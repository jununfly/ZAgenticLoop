import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createDispatchIntent } from '../dist/dispatch-intent.js';
import { evaluateDispatchGate } from '../dist/dispatch-gate.js';
import { recordTaskDispatched } from '../dist/dispatch-fact.js';

test('task.dispatched fact is CAS-backed and idempotent without Provider side effects', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-dispatch-fact-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-30T00:00:00.000Z' });
    const intent = createDispatchIntent({ intent_id: 'intent-1', network_id: 'network-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: 'sha256:' + 'a'.repeat(64), task_id: 'task-1', node_id: 'codex-node', assigned_node: 'codex', grant_digest: 'sha256:' + 'b'.repeat(64), claim_event_id: 'claim-1', dispatch_event_id: 'dispatch-1', authorized_by: 'human+codex', issued_at: '2026-07-30T00:00:00.000Z', expires_at: '2026-07-30T00:05:00.000Z', session_ttl_ms: 300000, capabilities: ['artifact.read'], resource_scope: ['repo:branch-a'] });
    const gate = evaluateDispatchGate({ intent, now: '2026-07-30T00:01:00.000Z', claim: { status: 'claimed', network_id: intent.network_id, plan_digest: intent.plan_digest, plan_revision: 1, grant_digest: intent.grant_digest, task_id: 'task-1', node_id: 'codex-node' }, revalidation: { status: 'passed', network_id: intent.network_id, plan_id: intent.plan_id, plan_digest: intent.plan_digest, plan_revision: 1, task_id: intent.task_id, node_id: intent.node_id, grant_digest: intent.grant_digest } });
    const first = await recordTaskDispatched({ stateStore, network_id: 'network-1', expected_revision: 1, intent, gate, now: '2026-07-30T00:01:00.000Z' });
    assert.equal(first.status, 'recorded');
    assert.equal(first.revision, 2);
    const second = await recordTaskDispatched({ stateStore, network_id: 'network-1', expected_revision: 2, intent, gate, now: '2026-07-30T00:01:00.000Z' });
    assert.equal(second.status, 'duplicate');
    assert.equal(second.side_effects_executed, false);
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});
