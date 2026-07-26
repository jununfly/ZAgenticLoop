import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildAgentLocalHandoff, parseAgentExecutionRequest, persistAgentLocalHandoff } from "../dist/index.js";

const marker = "/zj-loop start roadmap-sliced-development";
const envelope = { schema: "zj-loop.gitlab_issue_note_bridge.v1", event_id: "event-1", event_type: "Note Hook", project_path: "mlive-dev/ai-studio", issue_iid: 982, note_id: 19713120, mr_iid: null, source_url: "https://git.bilibili.co/mlive-dev/ai-studio/-/issues/982#note_19713120", target_route: "roadmap-sliced-development", target_ref: "master", received_at: "2026-07-26T00:00:00.000Z", dedupe_key: "gln_1", auth_source: "GITLAB_WEBHOOK_SECRET", trigger_pipeline_id: null };
const registrationText = `schema: zj-loop.project-registration.v1
project_path: mlive-dev/ai-studio
default_branch: master
routes:
  - route_id: roadmap-sliced-development
    marker: /zj-loop start roadmap-sliced-development
    allowed_executors:
      - kind: agent-local
        profile: human-codex-mac
        capabilities: [read-repository, modify-worktree, commit, push-branch, create-draft-mr]
`;
const ref = "a".repeat(40);
const digest = createHash("sha256").update(registrationText).digest("hex");
const request = { schema: "zj-loop.agent_execution_request.v1", registration: { ref, path: "zj-loop/registrations/project.yaml", sha256: digest } };

test("agent-local request parser requires an explicit pinned registration", () => {
  const parsed = parseAgentExecutionRequest(`${marker}\n<!-- zj-loop.agent_execution_request.v1\n${JSON.stringify(request)}\n-->`, marker);
  assert.equal(parsed.registration.ref, ref);
  assert.equal(parseAgentExecutionRequest(marker, marker), null);
  assert.throws(() => parseAgentExecutionRequest(`${marker}\n<!-- zj-loop.agent_execution_request.v1 {"schema":"bad"} -->`, marker), /invalid/);
});

test("agent-local handoff binds registration digest and current workspace base", () => {
  const handoff = buildAgentLocalHandoff({ envelope, request, registrationText, registrationCommit: ref, workspaceBaseCommit: "b".repeat(40), now: "2026-07-26T00:01:00.000Z" });
  assert.equal(handoff.status, "pending");
  assert.equal(handoff.executor.profile, "human-codex-mac");
  assert.equal(handoff.registration.sha256, digest);
  assert.equal(handoff.workspace.base_commit, "b".repeat(40));
});

test("agent-local handoff persistence is append-only and idempotent", async () => {
  const files = new Map();
  let head = "head-1";
  const client = { getHead: async () => head, readJson: async (path) => files.get(path) ?? null, list: async () => [], commit: async ({ last_commit_id, actions }) => { assert.equal(last_commit_id, head); head = "head-2"; for (const action of actions) files.set(action.file_path, JSON.parse(action.content)); return { id: head }; } };
  const handoff = buildAgentLocalHandoff({ envelope, request, registrationText, registrationCommit: ref, workspaceBaseCommit: "b".repeat(40), now: "2026-07-26T00:01:00.000Z" });
  const created = await persistAgentLocalHandoff({ client, handoff });
  const duplicate = await persistAgentLocalHandoff({ client, handoff });
  assert.equal(created.status, "created");
  assert.equal(created.side_effects_executed, true);
  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.side_effects_executed, false);
});
