import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAgentContext } from "../dist/agent-context.js";

const handoff = {
  schema: "zj-loop.agent_handoff.v1",
  handoff_id: "glh_context_1",
  request_id: "request-1",
  status: "claimed",
  created_at: "2026-07-27T00:00:00.000Z",
  source: { provider: "gitlab", project_path: "group/project", issue_iid: 1, note_id: 2, event_id: "event", dedupe_key: "dedupe", source_url: "https://example.test" },
  route: { route_id: "roadmap-sliced-development" },
  executor: { kind: "agent-local", profile: "human-codex-mac", capabilities: ["read-repository"] },
  registration: { commit: "a".repeat(40), path: "zj-loop/registrations/project.yaml", sha256: "b".repeat(64) },
  workspace: { project_path: "group/project", base_ref: "master", base_commit: "c".repeat(40) },
  claim: null,
  side_effects_executed: false,
};

const claim = { schema: "zj-loop.agent_claim.v1", claim_id: "clm_1", handoff_id: "glh_context_1", human_id: 81, agent_session_id: "codex", claimed_at: "2026-07-27T00:01:00.000Z", status: "claimed" };
const activation = { schema: "zj-loop.activation_snapshot_ref.v1", activation_id: "request-1", project_path: "group/project", commit: "d".repeat(40), path: "zj-loop/orchestrations/request-1/roadmap-activation.json", sha256: "e".repeat(64) };

function records(executions = [], evidence = []) { return { handoff, claim, activation, executions, evidence }; }
function execution(id, recorded_at, status = "completed") { return { schema: "zj-loop.agent_execution.v1", execution_id: id, handoff_id: "glh_context_1", claim_id: "clm_1", status, recorded_at, branch: "zj-loop/agent-local/glh_context_1", worktree_path: "/Users/example/worktree", reason: null, side_effects_executed: false }; }

test("reconstructs a minimal context and selects the latest execution", () => {
  const result = reconstructAgentContext({ stateHead: "head-1", finalStateHead: "head-1", records: records([execution("exe-1", "2026-07-27T00:02:00.000Z"), execution("exe-2", "2026-07-27T00:03:00.000Z", "running")]) });
  assert.equal(result.status, "completed");
  assert.equal(result.current.execution.execution_id, "exe-2");
  assert.equal(result.current.lifecycle_status, "running");
  assert.equal(result.handoff.source.source_url, undefined);
  assert.equal(result.current.execution.branch, null);
  assert.equal(result.current.execution.worktree_path, null);
});

test("fails closed when the state head changes", () => {
  const result = reconstructAgentContext({ stateHead: "head-1", finalStateHead: "head-2", records: records() });
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "state-head-changed");
  assert.equal(result.validation.errors[0].code, "state-head-changed");
});

test("fails closed when latest execution is ambiguous", () => {
  const timestamp = "2026-07-27T00:02:00.000Z";
  const result = reconstructAgentContext({ stateHead: "head-1", finalStateHead: "head-1", records: records([execution("exe-1", timestamp), execution("exe-2", timestamp)]) });
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "current-execution-ambiguous");
});

test("fails closed when canonical records are incomplete", () => {
  const result = reconstructAgentContext({ stateHead: "head-1", finalStateHead: "head-1", records: { handoff, claim: null, activation: null, executions: [], evidence: [] } });
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.validation.errors.map((item) => item.code), ["claim-missing", "activation-ref-missing"]);
});
