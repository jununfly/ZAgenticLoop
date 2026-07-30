import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCredentialClaimEvent, createCredentialExpireEvent, createCredentialIssueIntentEvent, createCredentialRevokeEvent, createNodeRevokeEvent } from '../dist/credential-issuance-events.js';

test('credential lifecycle event builders produce deterministic metadata-only StateStore events', () => {
  const issue = createCredentialIssueIntentEvent({
    request_id: 'request-1',
    network_id: 'network-1',
    node_id: 'node-1',
    credential_id: 'credential-1',
    issuance_digest: 'sha256:' + 'a'.repeat(64),
    capabilities: ['state.read'],
    issued_at: '2026-07-30T01:00:00.000Z',
    expires_at: '2026-07-30T02:00:00.000Z',
    intent_expires_at: '2026-07-30T01:05:00.000Z',
  });
  assert.deepEqual(issue, {
    event_id: 'credential-issued:request-1',
    aggregate_type: 'credential',
    aggregate_id: 'credential-1',
    event_type: 'credential-issued',
    occurred_at: '2026-07-30T01:00:00.000Z',
    payload: {
      request_id: 'request-1',
      network_id: 'network-1',
      node_id: 'node-1',
      credential_id: 'credential-1',
      issuance_digest: 'sha256:' + 'a'.repeat(64),
      capabilities: ['state.read'],
      issued_at: '2026-07-30T01:00:00.000Z',
      expires_at: '2026-07-30T02:00:00.000Z',
      intent_expires_at: '2026-07-30T01:05:00.000Z',
    },
  });
  const claim = createCredentialClaimEvent({ request_id: 'request-1', credential_id: 'credential-1', claimed_at: '2026-07-30T01:01:00.000Z' });
  assert.deepEqual(claim, {
    event_id: 'credential-claimed:request-1',
    aggregate_type: 'credential',
    aggregate_id: 'credential-1',
    event_type: 'credential-claimed',
    occurred_at: '2026-07-30T01:01:00.000Z',
    payload: { request_id: 'request-1', credential_id: 'credential-1', claimed_at: '2026-07-30T01:01:00.000Z' },
  });
  assert.equal(JSON.stringify(issue).includes('token'), false);
  assert.equal(JSON.stringify(claim).includes('token'), false);
  assert.equal(createCredentialRevokeEvent({ request_id: 'request-2', credential_id: 'credential-1', revoked_at: '2026-07-30T01:02:00.000Z', reason: 'human-request' }).event_type, 'credential-revoked');
  assert.equal(createCredentialExpireEvent({ request_id: 'request-3', credential_id: 'credential-1', expired_at: '2026-07-30T02:00:00.000Z' }).event_type, 'credential-expired');
  assert.equal(createNodeRevokeEvent({ request_id: 'request-4', network_id: 'network-1', node_id: 'node-1', revoked_at: '2026-07-30T01:03:00.000Z', reason: 'suspected-key-loss' }).event_type, 'node-revoked');
  assert.equal(JSON.stringify(createCredentialRevokeEvent({ request_id: 'request-2', credential_id: 'credential-1', revoked_at: '2026-07-30T01:02:00.000Z', reason: 'human-request' })).includes('token'), false);
});
