import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProviderAuthAuthorityIpcFrame, createProviderAuthAuthorityRevokeRequest, createProviderAuthAuthorityRevokeResponse, validateProviderAuthAuthorityIpcFrame } from '../dist/provider-auth-authority-ipc-protocol.js';

const digest = (value) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;
const request = createProviderAuthAuthorityRevokeRequest({ request_id: 'request-1', network_id: 'network-1', runtime_id: 'runtime-1', runtime_binding: { runtime_identity_fingerprint: digest('identity'), runtime_manifest_digest: digest('manifest'), provider_capabilities_digest: digest('capabilities') }, auth_ref_id: 'auth-ref-1', auth_ref_digest: digest('ref'), authority_contract_digest: digest('authority-contract'), revoke_reason: 'cleanup', nonce: 'nonce-1' });

test('Authority protocol creates a secret-free, digest-bound revoke request and response', () => {
  const frame = createProviderAuthAuthorityIpcFrame({ correlation_id: 'corr-1', sequence: 1, kind: 'revoke-request', payload: request });
  assert.equal(validateProviderAuthAuthorityIpcFrame(frame).status, 'valid');
  assert.equal(JSON.stringify(frame).includes('secret'), false);
  const response = createProviderAuthAuthorityRevokeResponse({ status: 'revoked', request_id: request.request_id, network_id: request.network_id, runtime_id: request.runtime_id, request_digest: request.request_digest, event_digest: digest('event') });
  assert.equal(validateProviderAuthAuthorityIpcFrame(createProviderAuthAuthorityIpcFrame({ correlation_id: 'corr-1', sequence: 2, kind: 'revoke-response', payload: response })).status, 'valid');
});

test('Authority protocol rejects request digest drift, unknown fields, secrets, and successful response without event digest', () => {
  const validFrame = createProviderAuthAuthorityIpcFrame({ correlation_id: 'corr-1', sequence: 1, kind: 'revoke-request', payload: request });
  assert.equal(validateProviderAuthAuthorityIpcFrame({ ...validFrame, payload: { ...request, request_digest: digest('wrong') } }).status, 'blocked');
  assert.equal(validateProviderAuthAuthorityIpcFrame({ ...createProviderAuthAuthorityIpcFrame({ correlation_id: 'corr-1', sequence: 1, kind: 'revoke-request', payload: request }), secret: 'must-not-travel' }).status, 'blocked');
  assert.throws(() => createProviderAuthAuthorityRevokeResponse({ status: 'revoked', request_id: request.request_id, network_id: request.network_id, runtime_id: request.runtime_id, request_digest: request.request_digest }), /event-digest-required/);
  const responseFrame = createProviderAuthAuthorityIpcFrame({ correlation_id: 'corr-1', sequence: 2, kind: 'revoke-response', payload: createProviderAuthAuthorityRevokeResponse({ status: 'revoked', request_id: request.request_id, network_id: request.network_id, runtime_id: request.runtime_id, request_digest: request.request_digest, event_digest: digest('event') }) });
  assert.equal(validateProviderAuthAuthorityIpcFrame({ ...responseFrame, payload: { ...responseFrame.payload, event_digest: undefined } }).status, 'blocked');
});

test('Authority request digest stays stable across fresh challenge nonces', () => {
  const { schema: _schema, request_digest: _digest, nonce: _nonce, ...semantic } = request;
  const other = createProviderAuthAuthorityRevokeRequest({ ...semantic, nonce: 'nonce-2' });
  assert.equal(other.request_digest, request.request_digest);
});
