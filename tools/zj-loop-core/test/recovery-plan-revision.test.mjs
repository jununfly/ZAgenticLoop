import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createRecoveryPlanRevisionRecord,
  evaluateRecoveryPlanRevisionReadiness,
} from '../dist/recovery-plan-revision.js';
import { persistRecoveryPlanRevisionRecord } from '../dist/recovery-plan-revision-store.js';
import { createContentAddressedArtifactStore } from '../dist/content-addressed-artifact-store.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const input = {
  recovery_plan_id: 'recovery-plan-1',
  event_id: 'event-1',
  plan_id: 'plan-2',
  plan_revision: 4,
  parent_plan_id: 'plan-1',
  parent_plan_revision: 3,
  parent_execution_id: 'execution-1',
  recovery_decision_id: 'recovery-1',
  uncertainty_evidence_id: 'evidence-uncertain-1',
  orchestration_plan_artifact_id: 'artifact-plan-2',
  plan_digest: `sha256:${'a'.repeat(64)}`,
  grant_digest: `sha256:${'b'.repeat(64)}`,
  resource_isolation_profile: 'worktree-per-node-v1',
  created_by: 'center-responsibility-unit',
  created_at: '2026-07-31T00:00:00.000Z',
};

test('RecoveryPlanRevisionRecord preserves parent bindings and stays preflight-gated', () => {
  const record = createRecoveryPlanRevisionRecord(input);
  assert.equal(record.schema, 'zj-loop.recovery_plan_revision.v1');
  assert.equal(record.status, 'recovery-planned');
  assert.equal(record.side_effects_executed, false);
  assert.equal(record.parent_execution_id, 'execution-1');
  assert.equal(record.recovery_decision_id, 'recovery-1');
  assert.equal(record.repreflight_artifact_id, null);
});

test('RecoveryPlanRevisionRecord rejects an in-place or side-effecting recovery plan', () => {
  assert.throws(
    () => createRecoveryPlanRevisionRecord({ ...input, plan_revision: 3 }),
    /recovery-plan-revision-must-advance/,
  );
  assert.throws(
    () => createRecoveryPlanRevisionRecord({ ...input, side_effects_executed: true }),
    /recovery-plan-revision-side-effects-invalid/,
  );
});

test('RecoveryPlanRevisionRecord only becomes executable through matching re-preflight evidence', () => {
  const record = createRecoveryPlanRevisionRecord(input);
  assert.equal(evaluateRecoveryPlanRevisionReadiness({ record }).status, 'blocked');
  const ready = {
    schema: 'zj-loop.orchestration_preflight.v1',
    status: 'execution-ready',
    side_effects_executed: false,
    plan_id: 'plan-2',
    plan_revision: 4,
    plan_digest: input.plan_digest,
    grant_digest: input.grant_digest,
  };
  assert.equal(evaluateRecoveryPlanRevisionReadiness({ record: { ...record, repreflight_artifact_id: 'artifact-reflight-1' }, artifact_id: 'artifact-reflight-1', preflight: ready }).status, 'execution-ready');
  assert.equal(evaluateRecoveryPlanRevisionReadiness({ record: { ...record, repreflight_artifact_id: 'artifact-reflight-1' }, artifact_id: 'artifact-reflight-1', preflight: { ...ready, plan_revision: 3 } }).status, 'blocked');
});

test('RecoveryPlanRevisionRecord persistence is artifact-backed and idempotent', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-recovery-plan-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const artifactStore = createContentAddressedArtifactStore({ root: path.join(root, 'artifacts') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-31T00:00:00.000Z' });
    const first = await persistRecoveryPlanRevisionRecord({ stateStore, artifactStore, network_id: 'network-1', expected_revision: 1, record: createRecoveryPlanRevisionRecord(input), now: '2026-07-31T00:00:01.000Z' });
    assert.equal(first.status, 'recorded');
    assert.equal(first.state_revision, 2);
    assert.ok(first.artifact_id);
    const duplicate = await persistRecoveryPlanRevisionRecord({ stateStore, artifactStore, network_id: 'network-1', expected_revision: 2, record: createRecoveryPlanRevisionRecord(input), now: '2026-07-31T00:00:02.000Z' });
    assert.equal(duplicate.status, 'duplicate');
    assert.equal(duplicate.artifact_id, first.artifact_id);
    assert.equal(await stateStore.getRevision('network-1'), 2);
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});
