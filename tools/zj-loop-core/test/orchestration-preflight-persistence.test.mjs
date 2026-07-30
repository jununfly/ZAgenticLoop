import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createContentAddressedArtifactStore } from '../dist/content-addressed-artifact-store.js';
import { persistOrchestrationPreflight } from '../dist/orchestration-preflight-persistence.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';

test('preflight persistence stores full artifact and appends a lightweight CAS fact', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-preflight-'));
  const database = path.join(root, 'state.db');
  const stateStore = createSqliteStateStore({ filename: database });
  const artifactStore = createContentAddressedArtifactStore({ root: path.join(root, 'artifacts') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-30T00:00:00.000Z' });
    const result = await persistOrchestrationPreflight({ stateStore, artifactStore, network_id: 'network-1', expected_revision: 1, event_id: 'preflight-event-1', now: '2026-07-30T00:30:00.000Z', result: { schema: 'zj-loop.orchestration_preflight.v1', status: 'blocked', side_effects_executed: false, plan_id: 'plan-1', plan_revision: 1, plan_digest: 'sha256:' + 'a'.repeat(64), expires_at: '2026-07-30T01:00:00.000Z', errors: [{ code: 'human-approval-required', path: '$.approval', message: 'approval required', severity: 'error', blocking: true }], task_grants: [], isolation: [] } });
    assert.equal(result.status, 'recorded');
    assert.equal(result.state_revision, 2);
    const events = await stateStore.readEvents({ network_id: 'network-1', after_revision: 1 });
    assert.equal(events.events[0].event_type, 'orchestration.preflight.blocked');
    assert.equal(events.events[0].payload.artifact_id, result.artifact_id);
    const artifact = await artifactStore.readArtifact({ network_id: 'network-1', artifact_id: result.artifact_id });
    assert.equal(JSON.parse(new TextDecoder().decode(artifact.content)).plan_id, 'plan-1');
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});
