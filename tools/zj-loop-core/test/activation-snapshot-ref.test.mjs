import { test } from "node:test";
import assert from "node:assert/strict";
import { persistActivationSnapshotRef } from "../dist/agent-context.js";

const input = {
  activationId: "act_123",
  projectPath: "group/project",
  commit: "a".repeat(40),
  path: "zj-loop/orchestrations/act_123/roadmap-activation.json",
  sha256: "b".repeat(64),
};

function fakeState({ existing = null, conflict = false } = {}) {
  let head = "head-1";
  const files = new Map(existing ? [["activations/act_123.json", existing]] : []);
  return {
    getHead: async () => head,
    readJson: async (path) => files.get(path) ?? null,
    commit: async ({ last_commit_id, actions }) => {
      if (conflict || last_commit_id !== head) throw new Error("gitlab-state-409");
      head = "head-2";
      for (const action of actions) files.set(action.file_path, JSON.parse(action.content));
      return { id: head };
    },
  };
}

test("activation snapshot ref is appended with an observed state HEAD", async () => {
  const result = await persistActivationSnapshotRef({ state: fakeState(), ...input });
  assert.equal(result.status, "recorded");
  assert.equal(result.commit_id, "head-2");
  assert.equal(result.activation.activation_id, input.activationId);
});

test("identical activation snapshot ref is an idempotent duplicate", async () => {
  const ref = { schema: "zj-loop.activation_snapshot_ref.v1", activation_id: input.activationId, project_path: input.projectPath, commit: input.commit, path: input.path, sha256: input.sha256 };
  const result = await persistActivationSnapshotRef({ state: fakeState({ existing: ref }), ...input });
  assert.equal(result.status, "duplicate");
  assert.equal(result.side_effects_executed, false);
});

test("different activation snapshot ref fails closed without overwrite", async () => {
  const ref = { schema: "zj-loop.activation_snapshot_ref.v1", activation_id: input.activationId, project_path: input.projectPath, commit: "c".repeat(40), path: input.path, sha256: input.sha256 };
  const result = await persistActivationSnapshotRef({ state: fakeState({ existing: ref }), ...input });
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "activation-ref-conflict");
  assert.equal(result.side_effects_executed, false);
});

test("state HEAD conflict fails closed", async () => {
  const result = await persistActivationSnapshotRef({ state: fakeState({ conflict: true }), ...input });
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "state-head-conflict");
});

test("invalid activation ref fields are rejected before any read or commit", async () => {
  let reads = 0;
  const state = { ...fakeState(), readJson: async () => { reads++; return null; } };
  const result = await persistActivationSnapshotRef({ state, ...input, path: "../escape.json" });
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "activation-path-invalid");
  assert.equal(reads, 0);
});
