import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createRecoveryDecision,
  createRecoveryDecisionCoordinator,
} from '../dist/recovery-decision.js';
import { persistRecoveryDecision } from '../dist/recovery-decision-store.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const base = {
  recovery_decision_id: 'recovery-1',
  event_id: 'event-1',
  plan_id: 'plan-1',
  plan_revision: 3,
  parent_execution_id: 'execution-1',
  uncertainty_evidence_id: 'evidence-uncertain-1',
  recovery_reason: 'provider outcome remains uncertain',
  human_id: 'human-1',
  device_id: 'device-1',
  session_id: 'session-1',
  authentication_method: 'fixture',
  decided_at: '2026-07-31T00:00:00.000Z',
  side_effects_executed: false,
};

function decision(action, digest = `digest-${action}`) {
  return { ...base, recovery_action: action, decision_digest: digest };
}

test('RecoveryDecision uses one CAS winner per parent execution', () => {
  const recovery = createRecoveryDecision({ ...decision('adopt') });
  assert.equal(recovery.schema, 'zj-loop.recovery_decision.v1');
  assert.equal(recovery.lifecycle_status, 'recovery-required');

  const coordinator = createRecoveryDecisionCoordinator({ parent_execution_id: 'execution-1', plan_id: 'plan-1', plan_revision: 3 });
  const accepted = coordinator.submitDecision(recovery);
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.lifecycle_status, 'recovery-decision-recorded');
  assert.equal(accepted.side_effects_executed, false);

  const duplicate = coordinator.submitDecision(recovery);
  assert.equal(duplicate.status, 'duplicate');

  const conflict = coordinator.submitDecision(createRecoveryDecision({ ...decision('compensate', 'digest-compensate') }));
  assert.equal(conflict.status, 'conflict');
  assert.equal(coordinator.getDecision().recovery_action, 'adopt');
});

test('RecoveryDecision rejects stale plan and side-effect claims', () => {
  const coordinator = createRecoveryDecisionCoordinator({ parent_execution_id: 'execution-1', plan_id: 'plan-1', plan_revision: 3 });
  const stale = coordinator.submitDecision(createRecoveryDecision({ ...decision('reconcile'), plan_revision: 2 }));
  assert.equal(stale.status, 'stale-decision');
  assert.throws(
    () => createRecoveryDecision({ ...decision('abandon'), side_effects_executed: true }),
    /recovery-decision-side-effects-invalid/,
  );
});

test('SQLite RecoveryDecision CAS converges concurrent recovery actions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-recovery-decision-'));
  const filename = path.join(root, 'state.db');
  const firstStore = createSqliteStateStore({ filename });
  const secondStore = createSqliteStateStore({ filename });
  try {
    await firstStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-31T00:00:00.000Z' });
    const submit = (store, action, digest) => persistRecoveryDecision({
      stateStore: store,
      network_id: 'network-1',
      expected_revision: 1,
      decision: createRecoveryDecision({ ...decision(action, digest) }),
      now: '2026-07-31T00:00:01.000Z',
    });
    const [left, right] = await Promise.all([
      submit(firstStore, 'adopt', 'digest-adopt'),
      submit(secondStore, 'compensate', 'digest-compensate'),
    ]);
    assert.deepEqual(new Set([left.status, right.status]), new Set(['accepted', 'conflict']));
    const duplicate = await submit(firstStore, 'adopt', 'digest-adopt');
    assert.equal(duplicate.status, 'duplicate');
    assert.equal(await firstStore.getRevision('network-1'), 2);
  } finally {
    await firstStore.close();
    await secondStore.close();
    await rm(root, { recursive: true, force: true });
  }
});
