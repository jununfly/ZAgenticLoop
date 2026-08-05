import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createInMemoryProviderAuthRuntime } from '../dist/provider-auth-runtime.js';
import { createProviderAuthRefStateStoreResolver, PROVIDER_AUTH_REF_ISSUED_EVENT_TYPE, PROVIDER_AUTH_REF_REVOKED_EVENT_TYPE } from '../dist/provider-auth-ref-store.js';

test('StateStore resolver returns only an active auth ref from the requested network', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-provider-auth-ref-store-'));
  const store = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await store.createNetwork({ network_id: 'network-ref', owner_id: 'human-local', now: '2026-08-05T12:00:00.000Z' });
    const runtime = createInMemoryProviderAuthRuntime({ runtime_id: 'runtime-ref', provider_ids: ['codex'], now: () => '2026-08-05T12:00:00.000Z' });
    const issued = await runtime.issueRef({ network_id: 'network-ref', node_id: 'node-ref', provider_id: 'codex', execution_id: 'execution-ref', attempt: 1, audience: 'model-api', scope: [], secret: 'secret', issued_at: '2026-08-05T12:00:00.000Z', expires_at: '2099-01-01T00:00:00.000Z', human_authorized: true });
    assert.equal(issued.status, 'issued');
    await store.appendEvent({ network_id: 'network-ref', expected_revision: 1, event: { event_id: 'auth-ref-issued', aggregate_type: 'provider-auth-ref', aggregate_id: issued.ref.auth_ref_id, event_type: PROVIDER_AUTH_REF_ISSUED_EVENT_TYPE, occurred_at: '2026-08-05T12:00:01.000Z', payload: { schema: 'zj-loop.provider_auth_ref_issued.v1', auth_ref: issued.ref } }, now: '2026-08-05T12:00:01.000Z' });
    const resolver = createProviderAuthRefStateStoreResolver({ stateStore: store, network_id: 'network-ref' });
    assert.deepEqual(await resolver.resolve({ auth_ref_digest: issued.ref.ref_digest }), issued.ref);
    assert.equal(await resolver.resolve({ auth_ref_digest: 'sha256:' + 'f'.repeat(64) }), undefined);
    await store.createNetwork({ network_id: 'other-network', owner_id: 'other-human', now: '2026-08-05T12:00:00.000Z' });
    const otherNetwork = createProviderAuthRefStateStoreResolver({ stateStore: store, network_id: 'other-network' });
    assert.equal(await otherNetwork.resolve({ auth_ref_digest: issued.ref.ref_digest }), undefined);
    await store.appendEvent({ network_id: 'network-ref', expected_revision: 2, event: { event_id: 'auth-ref-revoked', aggregate_type: 'provider-auth-ref', aggregate_id: issued.ref.auth_ref_id, event_type: PROVIDER_AUTH_REF_REVOKED_EVENT_TYPE, occurred_at: '2026-08-05T12:00:02.000Z', payload: { schema: 'zj-loop.provider_auth_ref_revoked.v1', auth_ref_id: issued.ref.auth_ref_id, auth_ref_digest: issued.ref.ref_digest } }, now: '2026-08-05T12:00:02.000Z' });
    assert.equal(await resolver.resolve({ auth_ref_digest: issued.ref.ref_digest }), undefined);
  } finally { await store.close(); await rm(root, { recursive: true, force: true }); }
});
