import { test } from "node:test";
import assert from "node:assert/strict";
import {
  claimAgentLocalHandoff,
  createGitLabStateBranchClient,
  listAgentLocalHandoffs,
} from "../dist/agent-local.js";

const handoff = {
  schema: "zj-loop.agent_handoff.v1",
  handoff_id: "glh_123",
  request_id: "glh_123",
  status: "pending",
  created_at: "2026-07-26T00:00:00.000Z",
  source: {
    provider: "gitlab",
    project_path: "mlive-dev/ai-studio",
    issue_iid: 982,
    note_id: 19713120,
    event_id: "event-1",
    dedupe_key: "gln_1",
    source_url:
      "https://git.bilibili.co/mlive-dev/ai-studio/-/issues/982#note_19713120",
  },
  route: { route_id: "roadmap-sliced-development" },
  executor: {
    kind: "agent-local",
    profile: "human-codex-mac",
    capabilities: ["read-repository", "modify-worktree"],
  },
  registration: {
    commit: "a".repeat(40),
    path: "zj-loop/registrations/project.yaml",
    sha256: "b".repeat(64),
  },
  workspace: {
    project_path: "mlive-dev/ai-studio",
    base_ref: "master",
    base_commit: "c".repeat(40),
  },
  claim: null,
  side_effects_executed: false,
};

function fakeClient({ conflict = false, claimed = false } = {}) {
  let head = "head-1";
  const files = new Map([["handoffs/glh_123.json", handoff]]);
  if (claimed)
    files.set("claims/glh_123/clm_existing.json", {
      schema: "zj-loop.agent_claim.v1",
      claim_id: "clm_existing",
      handoff_id: "glh_123",
      human_id: 81,
      agent_session_id: "existing",
      claimed_at: "2026-07-26T00:00:00.000Z",
      status: "claimed",
    });
  return {
    getHead: async () => (conflict ? "stale-head" : head),
    readJson: async (path) => files.get(path) ?? null,
    list: async (directory) =>
      [...files.keys()].filter((path) => path.startsWith(`${directory}/`)),
    commit: async ({ last_commit_id, actions }) => {
      if (last_commit_id !== head) throw new Error("gitlab-state-409");
      head = "head-2";
      for (const action of actions)
        files.set(action.file_path, JSON.parse(action.content));
      return { id: head };
    },
  };
}

test("agent-local list returns pending handoffs without side effects", async () => {
  const result = await listAgentLocalHandoffs({ client: fakeClient() });
  assert.equal(result.status, "completed");
  assert.equal(result.handoffs[0].handoff_id, "glh_123");
  assert.equal(result.side_effects_executed, false);
});

test("agent-local claim writes one claim using the observed state HEAD", async () => {
  const client = fakeClient();
  const result = await claimAgentLocalHandoff({
    client,
    handoffId: "glh_123",
    humanId: 81,
    agentSessionId: "codex-session-1",
    now: "2026-07-26T00:01:00.000Z",
  });
  assert.equal(result.status, "claimed");
  assert.equal(result.side_effects_executed, true);
  assert.equal(result.claim?.human_id, 81);
  assert.equal(result.commit_id, "head-2");
});

test("agent-local claim maps a state HEAD conflict to already-claimed", async () => {
  const client = fakeClient({ conflict: true });
  const result = await claimAgentLocalHandoff({
    client,
    handoffId: "glh_123",
    humanId: 81,
    agentSessionId: "codex-session-2",
  });
  assert.equal(result.status, "already-claimed");
  assert.equal(result.side_effects_executed, false);
});

test("agent-local list and claim surface an existing append-only claim", async () => {
  const client = fakeClient({ claimed: true });
  const listed = await listAgentLocalHandoffs({ client });
  assert.equal(listed.handoffs[0].status, "claimed");
  assert.equal(listed.handoffs[0].claim?.claim_id, "clm_existing");
  const result = await claimAgentLocalHandoff({
    client,
    handoffId: "glh_123",
    humanId: 81,
    agentSessionId: "codex-session-3",
  });
  assert.equal(result.status, "already-claimed");
  assert.equal(result.claim?.claim_id, "clm_existing");
});

test("GitLab state commits use the provider commit_message field", async () => {
  let request;
  const client = createGitLabStateBranchClient({
    apiBaseUrl: "https://git.example/api/v4",
    projectPath: "group/project",
    token: "state-token",
    fetchImpl: async (url, init = {}) => {
      request = { url, init };
      return { ok: true, status: 201, async json() { return { id: "commit-1" }; } };
    },
  });
  const result = await client.commit({
    branch: "zj-loop-state",
    message: "Create handoff [skip ci]",
    last_commit_id: "head-1",
    actions: [{ action: "create", file_path: "handoffs/test.json", content: "{}\n" }],
  });
  const body = JSON.parse(request.init.body);
  assert.equal(result.id, "commit-1");
  assert.equal(body.commit_message, "Create handoff [skip ci]");
  assert.equal("message" in body, false);
});
