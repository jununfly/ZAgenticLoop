import { test } from "node:test";
import assert from "node:assert/strict";
import { recordAgentLocalEvidence, recordAgentLocalExecution } from "../dist/index.js";

const handoff = {
  schema: "zj-loop.agent_handoff.v1", handoff_id: "glh_exec_1", request_id: "request-1", status: "claimed", created_at: "2026-07-27T00:00:00.000Z",
  source: { provider: "gitlab", project_path: "group/project", issue_iid: 1, note_id: 2, event_id: "event", dedupe_key: "dedupe", source_url: "https://git.example/issues/1" },
  route: { route_id: "roadmap-sliced-development" }, executor: { kind: "agent-local", profile: "human-codex-mac", capabilities: ["modify-worktree"] },
  registration: { commit: "a".repeat(40), path: "zj-loop/registrations/project.yaml", sha256: "b".repeat(64) }, workspace: { project_path: "group/project", base_ref: "master", base_commit: "c".repeat(40) }, claim: null, side_effects_executed: false,
};
const claim = { schema: "zj-loop.agent_claim.v1", claim_id: "clm_exec_1", handoff_id: "glh_exec_1", human_id: 81, agent_session_id: "codex-test", claimed_at: "2026-07-27T00:01:00.000Z", status: "claimed" };

function fakeClient({ claimValue = claim } = {}) {
  let head = "head-1";
  const files = new Map([["handoffs/glh_exec_1.json", handoff], ["claims/glh_exec_1/clm_exec_1.json", claimValue]]);
  return {
    getHead: async () => head,
    readJson: async (file) => files.get(file) ?? null,
    list: async (directory) => [...files.keys()].filter((file) => file.startsWith(`${directory}/`)),
    commit: async ({ last_commit_id, actions }) => {
      if (last_commit_id !== head) throw new Error("gitlab-state-409");
      head = `head-${files.size + 1}`;
      for (const action of actions) files.set(action.file_path, JSON.parse(action.content));
      return { id: head };
    },
  };
}

test("execution and evidence records append under the same handoff and claim", async () => {
  const client = fakeClient();
  const execution = await recordAgentLocalExecution({ client, handoffId: "glh_exec_1", claimId: "clm_exec_1", executionId: "exe_1", status: "running", now: "2026-07-27T00:02:00.000Z" });
  assert.equal(execution.status, "recorded");
  assert.equal(execution.record?.status, "running");
  const evidence = await recordAgentLocalEvidence({ client, handoffId: "glh_exec_1", claimId: "clm_exec_1", executionId: "exe_1", kind: "test", status: "passed", path: "test-result.json", now: "2026-07-27T00:03:00.000Z" });
  assert.equal(evidence.status, "recorded");
  assert.equal(evidence.record?.execution_id, "exe_1");
});

test("execution writes fail closed when the claim binding is stale", async () => {
  const result = await recordAgentLocalExecution({ client: fakeClient({ claimValue: { ...claim, claim_id: "clm_other" } }), handoffId: "glh_exec_1", claimId: "clm_exec_1", status: "completed" });
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "claim-binding-mismatch");
  assert.equal(result.side_effects_executed, false);
});
