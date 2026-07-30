import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createInMemoryHumanAuthorityProvider } from '../dist/human-authority.js';
import { createSqliteCredentialIssuance, credentialIssuanceDigest } from '../dist/sqlite-credential-issuance.js';

const base = {
  request_id: 'issue-request-1',
  network_id: 'network-1',
  node_id: 'node-1',
  event_id: 'event-1',
  task_id: 'task-1',
  capabilities: ['state.read'],
  issued_at: '2026-07-30T01:00:00.000Z',
  expires_at: '2026-07-30T02:00:00.000Z',
};

test('SQLite credential issuance binds issue intent to signed Human approval and claims an opaque token once', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-issuance-'));
  const authority = createInMemoryHumanAuthorityProvider({ human_id: 'human-1' });
  const digestInput = { ...base, approval: { request_digest: '' }, human_identity: authority.getPublicIdentity() };
  const digest = credentialIssuanceDigest({ ...digestInput, approval: await authority.signApprovalContext({ action: 'credential.issue', request_id: base.request_id, request_digest: 'sha256:' + '0'.repeat(64), approved_capabilities: base.capabilities, issued_at: '2026-07-30T01:00:00.000Z', expires_at: '2026-07-30T01:05:00.000Z' }) });
  const approval = await authority.signApprovalContext({ action: 'credential.issue', request_id: base.request_id, request_digest: digest, approved_capabilities: base.capabilities, issued_at: '2026-07-30T01:00:00.000Z', expires_at: '2026-07-30T01:05:00.000Z' });
  const issuance = createSqliteCredentialIssuance({ filename: path.join(root, 'state.db'), now: () => '2026-07-30T01:01:00.000Z' });
  try {
    const first = await issuance.issueIntent({ ...base, approval, human_identity: authority.getPublicIdentity() });
    assert.equal(first.status, 'recorded');
    assert.match(first.credential_id, /^credential_[0-9a-f]{32}$/);
    const retry = await issuance.issueIntent({ ...base, approval, human_identity: authority.getPublicIdentity() });
    assert.deepEqual(retry, { ...first, status: 'duplicate' });
    const claimed = await issuance.claim({ request_id: base.request_id, network_id: base.network_id, node_id: base.node_id, credential_id: first.credential_id, now: '2026-07-30T01:02:00.000Z' });
    assert.equal(claimed.status, 'claimed');
    assert.match(claimed.token, /^[A-Za-z0-9_-]{40,}$/);
    const claimRetry = await issuance.claim({ request_id: base.request_id, network_id: base.network_id, node_id: base.node_id, credential_id: first.credential_id, now: '2026-07-30T01:03:00.000Z' });
    assert.deepEqual(claimRetry, { status: 'duplicate', credential_id: first.credential_id, claimed_at: '2026-07-30T01:02:00.000Z' });
    assert.equal('token' in claimRetry, false);
    const sessionRetry = await issuance.claimForPairingSession({ request_id: base.request_id, network_id: base.network_id, node_id: base.node_id, session_id: 'pairing-session-1', now: '2026-07-30T01:04:00.000Z' });
    assert.deepEqual(sessionRetry, { status: 'duplicate', credential_id: first.credential_id, claimed_at: '2026-07-30T01:02:00.000Z' });
    assert.deepEqual(await issuance.revoke({ credential_id: first.credential_id, request_id: 'revoke-1', reason: 'human-request', now: '2026-07-30T01:04:30.000Z' }), { status: 'revoked', credential_id: first.credential_id, revoked_at: '2026-07-30T01:04:30.000Z' });
    assert.deepEqual(await issuance.revoke({ credential_id: first.credential_id, request_id: 'revoke-2', reason: 'duplicate', now: '2026-07-30T01:04:31.000Z' }), { status: 'duplicate', credential_id: first.credential_id, revoked_at: '2026-07-30T01:04:30.000Z' });
    await assert.rejects(() => issuance.issueIntent({ ...base, task_id: 'different-task', approval, human_identity: authority.getPublicIdentity() }), { message: 'approval-context-mismatch' });
  } finally {
    await issuance.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('SQLite credential issuance rejects an approval bound to a different digest', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-issuance-'));
  const authority = createInMemoryHumanAuthorityProvider({ human_id: 'human-1' });
  const approval = await authority.signApprovalContext({ action: 'credential.issue', request_id: base.request_id, request_digest: 'sha256:' + 'f'.repeat(64), approved_capabilities: base.capabilities, issued_at: '2026-07-30T01:00:00.000Z', expires_at: '2026-07-30T01:05:00.000Z' });
  const issuance = createSqliteCredentialIssuance({ filename: path.join(root, 'state.db'), now: () => '2026-07-30T01:01:00.000Z' });
  await assert.rejects(() => issuance.issueIntent({ ...base, approval, human_identity: authority.getPublicIdentity() }), { message: 'approval-context-mismatch' });
  await issuance.close();
  await rm(root, { recursive: true, force: true });
});

test('SQLite credential claim fails closed for node mismatch and intent expiry', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-issuance-'));
  const authority = createInMemoryHumanAuthorityProvider({ human_id: 'human-1' });
  const unsignedApproval = await authority.signApprovalContext({ action: 'credential.issue', request_id: base.request_id, request_digest: 'sha256:' + '0'.repeat(64), approved_capabilities: base.capabilities, issued_at: '2026-07-30T01:00:00.000Z', expires_at: '2026-07-30T01:01:30.000Z' });
  const digest = credentialIssuanceDigest({ ...base, approval: unsignedApproval, human_identity: authority.getPublicIdentity() });
  const approval = await authority.signApprovalContext({ action: 'credential.issue', request_id: base.request_id, request_digest: digest, approved_capabilities: base.capabilities, issued_at: '2026-07-30T01:00:00.000Z', expires_at: '2026-07-30T01:01:30.000Z' });
  const issuance = createSqliteCredentialIssuance({ filename: path.join(root, 'state.db'), now: () => '2026-07-30T01:01:00.000Z' });
  try {
    const intent = await issuance.issueIntent({ ...base, approval, human_identity: authority.getPublicIdentity() });
    await assert.rejects(() => issuance.claim({ request_id: base.request_id, network_id: base.network_id, node_id: 'node-2', credential_id: intent.credential_id, now: '2026-07-30T01:01:01.000Z' }), { message: 'credential-not-available' });
    await assert.rejects(() => issuance.claim({ request_id: base.request_id, network_id: base.network_id, node_id: base.node_id, credential_id: intent.credential_id, now: '2026-07-30T01:02:00.000Z' }), { message: 'intent-expired' });
  } finally {
    await issuance.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('SQLite credential claim fails closed after credential expiry or revoke', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-issuance-'));
  const authority = createInMemoryHumanAuthorityProvider({ human_id: 'human-1' });
  const request = { ...base, request_id: 'issue-request-expiring', expires_at: '2026-07-30T01:01:30.000Z' };
  const draft = await authority.signApprovalContext({ action: 'credential.issue', request_id: request.request_id, request_digest: 'sha256:' + '0'.repeat(64), approved_capabilities: request.capabilities, issued_at: request.issued_at, expires_at: '2026-07-30T01:05:00.000Z' });
  const digest = credentialIssuanceDigest({ ...request, approval: draft, human_identity: authority.getPublicIdentity() });
  const approval = await authority.signApprovalContext({ action: 'credential.issue', request_id: request.request_id, request_digest: digest, approved_capabilities: request.capabilities, issued_at: request.issued_at, expires_at: '2026-07-30T01:05:00.000Z' });
  const issuance = createSqliteCredentialIssuance({ filename: path.join(root, 'state.db'), now: () => '2026-07-30T01:01:00.000Z' });
  try {
    const intent = await issuance.issueIntent({ ...request, approval, human_identity: authority.getPublicIdentity() });
    await assert.rejects(() => issuance.claim({ request_id: request.request_id, network_id: request.network_id, node_id: request.node_id, credential_id: intent.credential_id, now: '2026-07-30T01:02:00.000Z' }), { message: 'credential-expired' });
  } finally {
    await issuance.close();
    await rm(root, { recursive: true, force: true });
  }
});
