import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createInMemoryHumanAuthorityProvider } from '../dist/human-authority.js';
import { createCredentialIssueIntentService, createSqliteCredentialIssuance, credentialIssuanceDigest } from '../dist/sqlite-credential-issuance.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';

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

const createCredentialAuthority = () => createInMemoryHumanAuthorityProvider({ human_id: 'human-1', protocol_version: 'v2', network_id: 'network-1', device_key_id: 'device-key-1', device_fingerprint: 'd'.repeat(64) });

test('SQLite credential issuance binds issue intent to signed Human approval and claims an opaque token once', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-issuance-'));
  const authority = createCredentialAuthority();
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

test('SQLite credential issuance rejects a historical v1 approval context', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-issuance-v1-'));
  const authority = createInMemoryHumanAuthorityProvider({ human_id: 'human-1' });
  const approval = await authority.signApprovalContext({ action: 'credential.issue', request_id: base.request_id, request_digest: 'sha256:' + '0'.repeat(64), approved_capabilities: base.capabilities, issued_at: base.issued_at, expires_at: '2026-07-30T01:05:00.000Z' });
  const issuance = createSqliteCredentialIssuance({ filename: path.join(root, 'state.db'), now: () => '2026-07-30T01:01:00.000Z' });
  await assert.rejects(() => issuance.issueIntent({ ...base, approval, human_identity: authority.getPublicIdentity() }), { message: 'approval-context-invalid' });
  await issuance.close();
  await rm(root, { recursive: true, force: true });
});

test('SQLite credential issuance rejects an approval bound to a different digest', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-issuance-'));
  const authority = createCredentialAuthority();
  const approval = await authority.signApprovalContext({ action: 'credential.issue', request_id: base.request_id, request_digest: 'sha256:' + 'f'.repeat(64), approved_capabilities: base.capabilities, issued_at: '2026-07-30T01:00:00.000Z', expires_at: '2026-07-30T01:05:00.000Z' });
  const issuance = createSqliteCredentialIssuance({ filename: path.join(root, 'state.db'), now: () => '2026-07-30T01:01:00.000Z' });
  await assert.rejects(() => issuance.issueIntent({ ...base, approval, human_identity: authority.getPublicIdentity() }), { message: 'approval-context-mismatch' });
  await issuance.close();
  await rm(root, { recursive: true, force: true });
});

test('SQLite credential claim fails closed for node mismatch and intent expiry', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-issuance-'));
  const authority = createCredentialAuthority();
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
  const authority = createCredentialAuthority();
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

test('StateStore-backed credential issuance atomically appends canonical issue facts with CAS', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-issuance-atomic-'));
  const filename = path.join(root, 'state.db');
  const authority = createCredentialAuthority();
  const stateStore = createSqliteStateStore({ filename });
  const issuance = createSqliteCredentialIssuance({ filename, stateStore, now: () => '2026-07-30T01:01:00.000Z' });
  const approvedRequest = async (request) => {
    const draft = await authority.signApprovalContext({ action: 'credential.issue', request_id: request.request_id, request_digest: 'sha256:' + '0'.repeat(64), approved_capabilities: request.capabilities, issued_at: request.issued_at, expires_at: '2026-07-30T01:05:00.000Z' });
    const digest = credentialIssuanceDigest({ ...request, approval: draft, human_identity: authority.getPublicIdentity() });
    return { ...request, approval: await authority.signApprovalContext({ action: 'credential.issue', request_id: request.request_id, request_digest: digest, approved_capabilities: request.capabilities, issued_at: request.issued_at, expires_at: '2026-07-30T01:05:00.000Z' }), human_identity: authority.getPublicIdentity() };
  };
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-30T01:00:00.000Z' });
    const request = await approvedRequest({ ...base, expected_revision: 1 });
    const first = await issuance.issueIntent(request);
    assert.equal(first.status, 'recorded');
    assert.equal(await stateStore.getRevision('network-1'), 2);
    const events = await stateStore.readEvents({ network_id: 'network-1', after_revision: 1 });
    assert.deepEqual(events.events.map((event) => event.event_type), ['credential-issued']);
    const retry = await issuance.issueIntent(request);
    assert.deepEqual(retry, { ...first, status: 'duplicate' });
    assert.equal(await stateStore.getRevision('network-1'), 2);
    const claimed = await issuance.claim({ request_id: request.request_id, network_id: request.network_id, node_id: request.node_id, credential_id: first.credential_id, now: '2026-07-30T01:02:00.000Z' });
    assert.equal(claimed.status, 'claimed');
    assert.equal(await stateStore.getRevision('network-1'), 3);
    const claimRetry = await issuance.claim({ request_id: request.request_id, network_id: request.network_id, node_id: request.node_id, credential_id: first.credential_id, now: '2026-07-30T01:02:01.000Z' });
    assert.equal(claimRetry.status, 'duplicate');
    assert.equal(await stateStore.getRevision('network-1'), 3);
    const revoked = await issuance.revoke({ credential_id: first.credential_id, request_id: 'revoke-request-1', reason: 'human-request', now: '2026-07-30T01:03:00.000Z' });
    assert.equal(revoked.status, 'revoked');
    assert.equal(await stateStore.getRevision('network-1'), 4);
    const stale = await approvedRequest({ ...base, request_id: 'issue-request-stale', event_id: 'event-stale', expected_revision: 1 });
    await assert.rejects(() => issuance.issueIntent(stale), { message: 'revision-mismatch' });
    assert.equal(await stateStore.getRevision('network-1'), 4);
    const canonicalEvents = await stateStore.readEvents({ network_id: 'network-1', after_revision: 1 });
    assert.deepEqual(canonicalEvents.events.map((event) => event.event_type), ['credential-issued', 'credential-claimed', 'credential-revoked']);
    await assert.rejects(() => issuance.claim({ request_id: stale.request_id, network_id: stale.network_id, node_id: stale.node_id, credential_id: 'credential_missing', now: '2026-07-30T01:02:00.000Z' }), { message: 'credential-not-available' });
  } finally {
    await issuance.close();
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('credential issue HTTP adapter decodes a Human envelope and delegates typed issuance', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-issuance-adapter-'));
  const authority = createCredentialAuthority();
  const issuance = createSqliteCredentialIssuance({ filename: path.join(root, 'state.db'), now: () => '2026-07-30T01:01:00.000Z' });
  try {
    const request = { ...base, request_id: 'issue-request-adapter' };
    const draft = await authority.signApprovalContext({ action: 'credential.issue', request_id: request.request_id, request_digest: 'sha256:' + '0'.repeat(64), approved_capabilities: request.capabilities, issued_at: request.issued_at, expires_at: '2026-07-30T01:05:00.000Z' });
    const digest = credentialIssuanceDigest({ ...request, approval: draft, human_identity: authority.getPublicIdentity() });
    const approval = await authority.signApprovalContext({ action: 'credential.issue', request_id: request.request_id, request_digest: digest, approved_capabilities: request.capabilities, issued_at: request.issued_at, expires_at: '2026-07-30T01:05:00.000Z' });
    const service = createCredentialIssueIntentService({ issuance });
    const result = await service.issueIntent({ network_id: request.network_id, expected_revision: 1, human_id: 'human-1', human_context: JSON.stringify({ approval, human_identity: authority.getPublicIdentity() }), request: { request_id: request.request_id, node_id: request.node_id, event_id: request.event_id, task_id: request.task_id, capabilities: request.capabilities, issued_at: request.issued_at, expires_at: request.expires_at } });
    assert.equal(result.status, 'recorded');
  } finally {
    await issuance.close();
    await rm(root, { recursive: true, force: true });
  }
});
