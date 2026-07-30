import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSqliteCredentialVerifier } from '../dist/sqlite-credential-verifier.js';

const credential = {
  schema: 'zj-loop.scoped_credential.v1',
  credential_id: 'credential-1',
  issuer: 'state-store',
  network_id: 'network-1',
  node_id: 'node-1',
  event_id: 'event-1',
  task_id: 'task-1',
  capabilities: ['event.append', 'state.read'],
  issued_at: '2026-07-29T01:00:00.000Z',
  expires_at: '2026-07-29T02:00:00.000Z',
};

test('SQLite credential provider stores only an opaque token hash and verifies its scope', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-credentials-'));
  const verifier = createSqliteCredentialVerifier({ filename: path.join(root, 'state.db'), now: () => '2026-07-29T01:30:00.000Z' });
  try {
    const issued = await verifier.issueCredential({ credential });
    assert.equal(issued.status, 'recorded');
    assert.match(issued.token, /^[A-Za-z0-9_-]{40,}$/);
    assert.deepEqual(await verifier.verify({ token: issued.token, node_id: 'node-1', network_id: 'network-1', operation: 'POST /v1/networks/network-1/events', event_id: 'event-1', task_id: 'task-1', required_capabilities: ['event.append'] }), { status: 'allowed', credential_id: 'credential-1', expires_at: '2026-07-29T02:00:00.000Z' });
    assert.deepEqual(await verifier.verify({ token: issued.token, node_id: 'node-1', network_id: 'network-1', operation: 'POST /v1/networks/network-1/events', event_id: 'event-1', task_id: 'task-1', required_capabilities: ['admin'] }), { status: 'blocked', reason: 'credential-capability-mismatch' });
    const reopened = createSqliteCredentialVerifier({ filename: path.join(root, 'state.db'), now: () => '2026-07-29T01:30:00.000Z' });
    assert.deepEqual(await reopened.issueCredential({ credential }), { status: 'duplicate', credential_id: 'credential-1' });
    await reopened.close();
  } finally {
    await verifier.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('SQLite credential provider fails closed for expiry, node mismatch, and revoke', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-credentials-'));
  let current = '2026-07-29T01:30:00.000Z';
  const verifier = createSqliteCredentialVerifier({ filename: path.join(root, 'state.db'), now: () => current });
  try {
    const issued = await verifier.issueCredential({ credential });
    assert.deepEqual(await verifier.verify({ token: issued.token, node_id: 'node-2', network_id: 'network-1', operation: 'GET /v1/networks/network-1/events' }), { status: 'blocked', reason: 'credential-node-mismatch' });
    current = '2026-07-29T02:00:01.000Z';
    assert.deepEqual(await verifier.verify({ token: issued.token, node_id: 'node-1', network_id: 'network-1', operation: 'GET /v1/networks/network-1/events' }), { status: 'blocked', reason: 'credential-expired' });
    current = '2026-07-29T01:30:00.000Z';
    assert.deepEqual(await verifier.revokeCredential({ credential_id: 'credential-1', now: current }), { status: 'revoked' });
    assert.deepEqual(await verifier.verify({ token: issued.token, node_id: 'node-1', network_id: 'network-1', operation: 'GET /v1/networks/network-1/events' }), { status: 'blocked', reason: 'credential-revoked' });
    assert.deepEqual(await verifier.revokeCredential({ credential_id: 'credential-1', now: current }), { status: 'duplicate' });
  } finally {
    await verifier.close();
    await rm(root, { recursive: true, force: true });
  }
});
