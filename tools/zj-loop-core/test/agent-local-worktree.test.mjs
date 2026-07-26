import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { agentLocalBranchName, prepareAgentLocalWorktree } from "../dist/index.js";

const handoff = {
  schema: "zj-loop.agent_handoff.v1",
  handoff_id: "glh_worktree_1",
  request_id: "request-1",
  status: "claimed",
  created_at: "2026-07-26T00:00:00.000Z",
  source: { provider: "gitlab", project_path: "mlive-dev/ai-studio", issue_iid: 982, note_id: 19713535, event_id: "event-1", dedupe_key: "gln_1", source_url: "https://git.example/issues/982#note_19713535" },
  route: { route_id: "roadmap-sliced-development" },
  executor: { kind: "agent-local", profile: "human-codex-mac", capabilities: ["modify-worktree"] },
  registration: { commit: "a".repeat(40), path: "zj-loop/registrations/project.yaml", sha256: "b".repeat(64) },
  workspace: { project_path: "mlive-dev/ai-studio", base_ref: "master", base_commit: "c".repeat(40) },
  claim: { schema: "zj-loop.agent_claim.v1", claim_id: "clm_1", handoff_id: "glh_worktree_1", human_id: 81, agent_session_id: "codex-1", claimed_at: "2026-07-26T00:01:00.000Z", status: "claimed" },
  side_effects_executed: false,
};

test("agent-local worktree preparation uses deterministic branch and base commit", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "zj-loop-worktree-"));
  try {
    const repoRoot = path.join(root, "repo");
    const worktreeRoot = path.join(root, "worktrees");
    await mkdir(repoRoot);
    const calls = [];
    const gitRunner = async (args) => {
      calls.push(args);
      if (args[0] === "worktree") await mkdir(args[4]);
      if (args.at(-2) === "rev-parse") return { stdout: handoff.workspace.base_commit + "\n", stderr: "" };
      if (args.at(-2) === "branch") return { stdout: agentLocalBranchName(handoff.handoff_id) + "\n", stderr: "" };
      return { stdout: "", stderr: "" };
    };
    const prepared = await prepareAgentLocalWorktree({ handoff, repoRoot, worktreeRoot, gitRunner });
    const reused = await prepareAgentLocalWorktree({ handoff, repoRoot, worktreeRoot, gitRunner });
    assert.equal(prepared.status, "prepared");
    assert.equal(prepared.branch, "zj-loop/agent-local/glh_worktree_1");
    assert.equal(prepared.base_commit, "c".repeat(40));
    assert.equal(reused.status, "reused");
    assert.deepEqual(calls[0], ["worktree", "add", "--branch", "zj-loop/agent-local/glh_worktree_1", prepared.worktree_path, "c".repeat(40)]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("agent-local worktree preparation refuses an unclaimed handoff", async () => {
  const result = await prepareAgentLocalWorktree({ handoff: { ...handoff, status: "pending", claim: null }, repoRoot: "/tmp/repo", worktreeRoot: "/tmp/worktrees", gitRunner: async () => ({ stdout: "", stderr: "" }) });
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "handoff-claim-required");
  assert.equal(result.side_effects_executed, false);
});
