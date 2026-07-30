import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createHumanGrill,
  createHumanGrillCoordinator,
} from '../dist/human-grill.js';
import { persistHumanGrillDecision } from '../dist/human-grill-store.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const grill = createHumanGrill({
  grill_id: 'grill-1',
  event_id: 'event-1',
  plan_id: 'plan-1',
  plan_revision: 2,
  reason_code: 'resource-isolation-unknown',
  known_facts: ['repo is shared by two execution nodes'],
  unknowns_or_conflicts: ['write ownership is not proven'],
  affected_tasks: ['task-1', 'task-2'],
  affected_resources: ['repo:1'],
  candidate_strategies: [{ strategy_id: 'worktree-per-node', summary: 'separate worktrees' }],
  recommended_strategy: 'worktree-per-node',
  risks_and_tradeoffs: ['merge is required before verification'],
  requested_human_decision: 'Choose an isolation strategy',
  decision_options: ['worktree-per-node', 'serialize-shared-repo'],
});

function decision(strategy, digest = `digest-${strategy}`) {
  return {
    grill_id: 'grill-1',
    event_id: 'event-1',
    plan_id: 'plan-1',
    plan_revision: 2,
    decision: strategy,
    decision_digest: digest,
    human_id: 'human-1',
    device_id: 'device-1',
    session_id: 'session-1',
    authentication_method: 'fixture',
    decided_at: '2026-07-31T00:00:00.000Z',
    side_effects_executed: false,
  };
}

test('Human Grill decision CAS is idempotent and never dispatches', () => {
  const coordinator = createHumanGrillCoordinator({ grill });
  const first = coordinator.submitDecision(decision('worktree-per-node'));
  assert.equal(first.status, 'accepted');
  assert.equal(first.lifecycle_status, 'decision-recorded');
  assert.equal(first.side_effects_executed, false);

  const duplicate = coordinator.submitDecision(decision('worktree-per-node'));
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.side_effects_executed, false);

  const conflict = coordinator.submitDecision(decision('serialize-shared-repo', 'digest-other'));
  assert.equal(conflict.status, 'conflict');
  assert.equal(conflict.side_effects_executed, false);
  assert.equal(coordinator.getDecision().decision, 'worktree-per-node');
});

test('Human Grill rejects stale decisions and malformed side-effect claims', () => {
  const coordinator = createHumanGrillCoordinator({ grill });
  const stale = coordinator.submitDecision({ ...decision('worktree-per-node'), plan_revision: 1 });
  assert.equal(stale.status, 'stale-decision');
  assert.equal(stale.side_effects_executed, false);

  assert.throws(
    () => coordinator.submitDecision({ ...decision('worktree-per-node'), side_effects_executed: true }),
    /human-grill-side-effects-invalid/,
  );
});

test('SQLite Human Grill decision CAS converges concurrent devices', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-human-grill-'));
  const filename = path.join(root, 'state.db');
  const firstStore = createSqliteStateStore({ filename });
  const secondStore = createSqliteStateStore({ filename });
  try {
    await firstStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-31T00:00:00.000Z' });
    const input = (store, strategy, digest) => persistHumanGrillDecision({
      stateStore: store,
      network_id: 'network-1',
      expected_revision: 1,
      grill,
      decision: decision(strategy, digest),
      now: '2026-07-31T00:00:01.000Z',
    });
    const [left, right] = await Promise.all([
      input(firstStore, 'worktree-per-node', 'digest-worktree'),
      input(secondStore, 'serialize-shared-repo', 'digest-serialize'),
    ]);
    assert.deepEqual(new Set([left.status, right.status]), new Set(['accepted', 'conflict']));
    assert.equal(left.side_effects_executed, false);
    assert.equal(right.side_effects_executed, false);
    const duplicate = await input(firstStore, 'worktree-per-node', 'digest-worktree');
    assert.equal(duplicate.status, 'duplicate');
    assert.equal((await firstStore.getRevision('network-1')), 2);
  } finally {
    await firstStore.close();
    await secondStore.close();
    await rm(root, { recursive: true, force: true });
  }
});
