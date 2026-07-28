import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildAgentExecutionContext } from "../dist/index.js";

const handoff = {
  schema: "zj-loop.agent_handoff.v1", handoff_id: "glh_context_1", request_id: "request-1", status: "claimed", created_at: "2026-07-27T00:00:00.000Z",
  source: { provider: "gitlab", project_path: "group/project", issue_iid: 1, note_id: 2, event_id: "event", dedupe_key: "dedupe", source_url: "https://git.example/issues/1" },
  route: { route_id: "roadmap-sliced-development" },
  executor: { kind: "agent-local", profile: "human-codex-mac", capabilities: ["read-repository", "modify-worktree", "commit", "push-branch", "create-draft-mr"] },
  registration: { commit: "a".repeat(40), path: "zj-loop/registrations/project.yaml", sha256: "b".repeat(64) },
  workspace: { project_path: "group/project", base_ref: "master", base_commit: "c".repeat(40) },
  claim: { schema: "zj-loop.agent_claim.v1", claim_id: "clm_1", handoff_id: "glh_context_1", human_id: 81, agent_session_id: "codex-test", claimed_at: "2026-07-27T00:01:00.000Z", status: "claimed" },
  side_effects_executed: false,
};

const agentContext = {
  schema: "zj-loop.agent_context_snapshot.v1",
  status: "completed",
  state: { branch: "zj-loop-state", head_sha: "d".repeat(40) },
  handoff: { handoff_id: "glh_context_1" },
  claim: { claim_id: "clm_1" },
  activation: { ref: { activation_id: "act-1", path: "zj-loop/orchestrations/act-1/roadmap-activation.json" } },
};

async function fixture({ roadmap = true } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "zj-loop-context-"));
  await mkdir(path.join(root, "zj-loop/orchestrations/act-1"), { recursive: true });
  await writeFile(path.join(root, "zj-loop/orchestrations/act-1/roadmap-activation.json"), JSON.stringify({ branch_name: "zjal-act-1", target_branch: "master", draft: true }));
  if (roadmap) { await mkdir(path.join(root, "docs/plans"), { recursive: true }); await writeFile(path.join(root, "docs/plans/roadmap.json"), "{}\n"); }
  return root;
}

test("execution context is ready only with claim, activation contract, and roadmap", async () => {
  const root = await fixture();
  const result = await buildAgentExecutionContext({ handoff, repoRoot: root, activationId: "act-1" });
  assert.equal(result.status, "execution-ready");
  assert.equal(result.merge_request.create_allowed, true);
  assert.deepEqual(result.workspace.branch, "zjal-act-1");
  assert.equal(result.side_effects_executed, false);
  assert.equal(result.state.branch, "zj-loop-state");
});

test("missing roadmap is an explicit blocked state with exact remediation path", async () => {
  const root = await fixture({ roadmap: false });
  const result = await buildAgentExecutionContext({ handoff, repoRoot: root, activationId: "act-1" });
  assert.equal(result.status, "blocked-missing-roadmap");
  assert.equal(result.reason, "roadmap-file-required");
  assert.match(result.next_steps[0], /docs\/plans\/roadmap\.json/);
});

test("unclaimed handoff requests a human claim before contract inspection", async () => {
  const root = await fixture();
  const result = await buildAgentExecutionContext({ handoff: { ...handoff, status: "pending", claim: null }, repoRoot: root, activationId: "act-1" });
  assert.equal(result.status, "request-human-claim");
  assert.equal(result.reason, "handoff-claim-required");
});

test("formal preflight rejects a missing or blocked reconstructed context", async () => {
  const root = await fixture();
  const result = await buildAgentExecutionContext({ handoff, repoRoot: root, activationId: "act-1", agentContext: { ...agentContext, status: "blocked", reason: "activation-ref-missing" }, requireContext: true });
  assert.equal(result.status, "blocked-incomplete-contract");
  assert.equal(result.reason, "agent-context-activation-ref-missing");
});

test("formal preflight accepts only bindings from the reconstructed context", async () => {
  const root = await fixture();
  const result = await buildAgentExecutionContext({ handoff, repoRoot: root, activationId: "act-1", agentContext: { ...agentContext, state: { ...agentContext.state, head_sha: null } }, stateHead: "d".repeat(40), requireContext: true });
  assert.equal(result.status, "blocked-incomplete-contract");
  assert.equal(result.reason, "agent-context-state-head-mismatch");
});
