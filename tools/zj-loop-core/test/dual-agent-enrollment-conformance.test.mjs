import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createHash, X509Certificate } from 'node:crypto';
import { buildNodeIdentity, createPairingRequest, createPairingRequestProof } from '../dist/node-enrollment.js';
import { issueScopedCredential } from '../dist/node-enrollment.js';
import { createInMemoryHumanAuthorityProvider, verifyHumanApprovalContext } from '../dist/human-authority.js';
import { createPairingHttpServer } from '../dist/pairing-http-server.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createSqlitePairingRecordStore } from '../dist/sqlite-pairing-record-store.js';
import { createContentAddressedArtifactStore } from '../dist/content-addressed-artifact-store.js';
import { buildDualAgentEnrollmentEvidence, dualAgentEnrollmentEvidenceDigest } from '../dist/dual-agent-enrollment-conformance.js';

const OPENSSL_BIN = process.env.OPENSSL_BIN ?? (existsSync('/opt/homebrew/opt/openssl@3/bin/openssl') ? '/opt/homebrew/opt/openssl@3/bin/openssl' : 'openssl');

function requestRecord(requestId, nodeId, digest) {
  return {
    type: 'pairing-requested',
    event_id: `pairing-requested:${requestId}`,
    occurred_at: '2026-07-29T10:00:00.000Z',
    network_id: 'network-1',
    request_digest: digest,
    request: {
      schema: 'zj-loop.pairing_request.v1',
      request_id: requestId,
      network_id: 'network-1',
      node_id: nodeId,
      identity: {
        schema: 'zj-loop.node_identity.v1',
        node_id: nodeId,
        certificate_sha256: nodeId,
        certificate_pem: 'test-only-certificate',
        display_name: nodeId,
        agent_kind: nodeId,
        agent_version: 'test',
      },
      endpoint: `loopback://${nodeId}`,
      requested_capabilities: ['event.consume'],
      expires_at: '2026-07-29T11:00:00.000Z',
    },
  };
}

function approvedRecord(requestId, digest) {
  return {
    type: 'human-approved',
    event_id: `pairing-approved:${requestId}:human-1`,
    occurred_at: '2026-07-29T10:05:00.000Z',
    network_id: 'network-1',
    request_id: requestId,
    request_digest: digest,
    human_id: 'human-1',
    approved_capabilities: ['event.consume'],
  };
}

test('SQLite PairingRecordStore shares StateStore history across reopen and protects concurrent approval', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-dual-agent-conformance-'));
  const filename = path.join(root, 'state.sqlite');
  const state = createSqliteStateStore({ filename });
  await state.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-29T10:00:00.000Z' });
  const pairing = createSqlitePairingRecordStore({ stateStore: state });
  const request = requestRecord('pair-codex', 'codex-node', 'a'.repeat(64));
  await pairing.append(request);

  const first = pairing.appendIfPending({ request_id: request.request.request_id, request_digest: request.request_digest, record: approvedRecord(request.request.request_id, request.request_digest), now: '2026-07-29T10:10:00.000Z' });
  const second = pairing.appendIfPending({ request_id: request.request.request_id, request_digest: request.request_digest, record: approvedRecord(request.request.request_id, request.request_digest), now: '2026-07-29T10:10:00.000Z' });
  const results = await Promise.allSettled([first, second]);
  assert.equal(results.filter((result) => result.status === 'fulfilled' && result.value.status === 'recorded').length, 1);
  assert.equal(results.filter((result) => result.status === 'fulfilled' && result.value.status === 'duplicate').length + results.filter((result) => result.status === 'rejected' && result.reason?.message === 'pairing-state-conflict').length, 1);

  await state.close();
  const reopenedState = createSqliteStateStore({ filename });
  const reopenedPairing = createSqlitePairingRecordStore({ stateStore: reopenedState });
  const records = await reopenedPairing.list('network-1');
  assert.equal(records.length, 2);
  assert.equal(records.filter((record) => record.type === 'human-approved').length, 1);
  assert.equal(await reopenedState.getRevision('network-1'), 3);
  await reopenedState.close();
  await rm(root, { recursive: true, force: true });
});

test('dual-agent conformance reaches enrolled-active with bootstrap credentials and records metadata-only Evidence', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-dual-agent-evidence-'));
  const stateFilename = path.join(root, 'state.sqlite');
  const artifactRoot = path.join(root, 'artifacts');
  const state = createSqliteStateStore({ filename: stateFilename });
  await state.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-29T10:00:00.000Z' });
  const pairing = createSqlitePairingRecordStore({ stateStore: state });
  const nodes = [
    { role: 'codex', node_id: 'a'.repeat(64), certificate_sha256: 'b'.repeat(64), agent_kind: 'codex' },
    { role: 'workbuddy', node_id: 'c'.repeat(64), certificate_sha256: 'd'.repeat(64), agent_kind: 'workbuddy' },
  ];
  for (const node of nodes) {
    const request = requestRecord(`pair-${node.role}`, node.node_id, node.certificate_sha256);
    request.request.identity.agent_kind = node.agent_kind;
    request.request.requested_capabilities = ['enrollment.read'];
    await pairing.append(request);
    const approval = approvedRecord(request.request.request_id, request.request_digest);
    approval.approved_capabilities = ['enrollment.read'];
    await pairing.appendIfPending({ request_id: request.request.request_id, request_digest: request.request_digest, record: approval, now: '2026-07-29T10:10:00.000Z' });
    const credential = issueScopedCredential({
      approval: { schema: 'zj-loop.pairing_approval.v1', approval_id: `${request.request.request_id}:human-1`, request_id: request.request.request_id, network_id: 'network-1', node_id: node.node_id, human_id: 'human-1', approved_capabilities: ['enrollment.read'], approved_at: '2026-07-29T10:05:00.000Z', request_expires_at: request.request.expires_at },
      grant: { node_id: node.node_id, event_id: `enrollment-bootstrap:${request.request.request_id}`, task_id: `enrollment-activation:${node.node_id}`, capabilities: ['enrollment.read'] },
      issued_at: '2026-07-29T10:10:00.000Z',
      expires_at: '2026-07-29T10:30:00.000Z',
    });
    const issuedRevision = await state.getRevision('network-1');
    await state.appendEvent({ network_id: 'network-1', expected_revision: issuedRevision, event: { event_id: `credential-issued:${node.node_id}`, aggregate_type: 'enrollment', aggregate_id: node.node_id, event_type: 'credential-issued', occurred_at: '2026-07-29T10:10:00.000Z', payload: { credential } } });
    const activeRevision = await state.getRevision('network-1');
    await state.appendEvent({ network_id: 'network-1', expected_revision: activeRevision, event: { event_id: `enrolled-active:${node.node_id}`, aggregate_type: 'enrollment', aggregate_id: node.node_id, event_type: 'enrolled-active', occurred_at: '2026-07-29T10:10:01.000Z', payload: { node_id: node.node_id, credential_id: credential.credential_id, bootstrap_scope: true } } });
  }
  const snapshot = await state.readEvents({ network_id: 'network-1' });
  const evidence = buildDualAgentEnrollmentEvidence({
    network_id: 'network-1',
    fixture_version: '1-4-2-1',
    nodes: nodes.map((node) => ({ ...node, status: 'enrolled-active' })),
    scenarios: [
      { name: 'independent-enrollment', status: 'passed' },
      { name: 'bootstrap-credential-scope', status: 'passed' },
      { name: 'sqlite-canonical-history', status: 'passed' },
      { name: 'metadata-only-evidence', status: 'passed' },
    ],
    state_store: { revision: snapshot.snapshot_revision, event_count: snapshot.events.length, event_digests: snapshot.events.map((event) => event.payload_sha256) },
    created_at: '2026-07-29T10:11:00.000Z',
  });
  assert.equal(evidence.status, 'passed');
  assert.equal(evidence.side_effects_executed, false);
  assert.equal(evidence.nodes.every((node) => node.status === 'enrolled-active'), true);
  assert.doesNotMatch(JSON.stringify(evidence), /session_token|private_key|secret|bearer/i);
  const artifacts = createContentAddressedArtifactStore({ root: artifactRoot });
  const content = new TextEncoder().encode(JSON.stringify(evidence));
  const artifact = await artifacts.putArtifact({ network_id: 'network-1', content, content_type: 'application/json', now: evidence.created_at });
  const evidenceRevision = await state.getRevision('network-1');
  await state.appendEvent({ network_id: 'network-1', expected_revision: evidenceRevision, event: { event_id: `evidence-recorded:${dualAgentEnrollmentEvidenceDigest(evidence)}`, aggregate_type: 'evidence', aggregate_id: 'dual-agent-enrollment', event_type: 'evidence-recorded', occurred_at: evidence.created_at, payload: { evidence_id: 'evd_dual_agent_enrollment_1', artifact_id: artifact.metadata.artifact_id, content_sha256: artifact.metadata.content_sha256, status: evidence.status } } });
  const stored = await artifacts.readArtifact({ network_id: 'network-1', artifact_id: artifact.metadata.artifact_id });
  assert.equal(new TextDecoder().decode(stored.content), JSON.stringify(evidence));
  await state.close();
  await rm(root, { recursive: true, force: true });
});

const supportsP256Certificates = (() => {
  try {
    const root = execFileSync('mktemp', ['-d'], { encoding: 'utf8' }).trim();
    const key = path.join(root, 'key.pem');
    const cert = path.join(root, 'cert.pem');
    execFileSync(OPENSSL_BIN, ['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', key], { stdio: 'ignore' });
    execFileSync(OPENSSL_BIN, ['req', '-x509', '-new', '-key', key, '-out', cert, '-subj', '/CN=probe', '-days', '1'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

async function certificate(root, commonName) {
  const keyPath = path.join(root, `${commonName}.key.pem`);
  const certPath = path.join(root, `${commonName}.cert.pem`);
  execFileSync(OPENSSL_BIN, ['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', keyPath], { stdio: 'ignore' });
  execFileSync(OPENSSL_BIN, ['req', '-x509', '-new', '-key', keyPath, '-out', certPath, '-subj', `/CN=${commonName}`, '-days', '1'], { stdio: 'ignore' });
  return { key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}

function httpsRequest({ address, server, client, path: requestPath, method = 'GET', body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const request = https.request({ hostname: '127.0.0.1', port: address.port, path: requestPath, method, ca: server.cert, cert: client?.cert, key: client?.key, servername: 'localhost', headers: { ...(body === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }), ...headers } }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => resolve({ statusCode: response.statusCode, body: text ? JSON.parse(text) : null }));
    });
    request.on('error', reject);
    request.end(payload);
  });
}

function certificateFingerprint(pem) {
  return createHash('sha256').update(new X509Certificate(pem).raw).digest('hex');
}

test('dual Codex and Workbuddy nodes enroll through loopback HTTPS and recover from SQLite restart', { skip: !supportsP256Certificates }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-dual-agent-http-'));
  const stateFilename = path.join(root, 'state.sqlite');
  const state = createSqliteStateStore({ filename: stateFilename });
  await state.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-29T10:00:00.000Z' });
  const pairing = createSqlitePairingRecordStore({ stateStore: state });
  const authority = createInMemoryHumanAuthorityProvider({ human_id: 'human-1', protocol_version: 'v2', network_id: 'network-1', device_key_id: 'human-device-key-1' });
  const serverMaterial = await certificate(root, 'localhost');
  const codexMaterial = await certificate(root, 'codex');
  const workbuddyMaterial = await certificate(root, 'workbuddy');
  const clients = [
    { name: 'Codex', kind: 'codex', material: codexMaterial },
    { name: 'Workbuddy', kind: 'workbuddy', material: workbuddyMaterial },
  ].map(({ name, kind, material }) => {
    const identity = buildNodeIdentity({ certificate_pem: material.cert, display_name: name, agent_kind: kind, agent_version: 'test' });
    const request = createPairingRequest({ request_id: `pair-${kind}`, network_id: 'network-1', identity, endpoint: `loopback://${kind}`, requested_capabilities: ['event.consume'], expires_at: '2026-07-29T11:00:00.000Z' });
    return { name, kind, material, identity, request, proof: createPairingRequestProof({ request, private_key_pem: material.key }) };
  });
  const createServer = () => createPairingHttpServer({
    tls: { key: serverMaterial.key, cert: serverMaterial.cert, ca: [codexMaterial.cert, workbuddyMaterial.cert] },
    recordStore: pairing,
    now: () => '2026-07-29T10:00:00.000Z',
    ownerAuthenticator: {
      authenticate: ({ action, context, authorization }) => action === 'pairing.list' && authorization === 'Bearer test-human-session'
        ? { status: 'allowed', human_id: 'human-1' }
        : context && verifyHumanApprovalContext({ identity: authority.getPublicIdentity(), context, now: '2026-07-29T10:10:00.000Z' }) && context.action === action
          ? { status: 'allowed', human_id: 'human-1' }
          : { status: 'blocked', reason: 'owner-not-authorized' },
    },
  });
  let server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const created = await Promise.all(clients.map((client) => httpsRequest({ address, server: serverMaterial, client: client.material, path: '/v1/pairing-requests', method: 'POST', body: { request: client.request, proof: client.proof } })));
  assert.deepEqual(created.map((response) => response.statusCode), [201, 201]);
  assert.notEqual(clients[0].identity.node_id, clients[1].identity.node_id);

  const codexContext = await authority.signApprovalContext({ action: 'pairing.approve', request_id: clients[0].request.request_id, request_digest: created[0].body.session.request_digest, device_fingerprint: certificateFingerprint(clients[0].material.cert), approved_capabilities: ['event.consume'], issued_at: '2026-07-29T10:10:00.000Z', expires_at: '2026-07-29T10:20:00.000Z' });
  const codexApprovalBody = { network_id: 'network-1', request_digest: created[0].body.session.request_digest, approved_capabilities: ['event.consume'], context: codexContext };
  const concurrentApprovals = await Promise.all([1, 2].map(() => httpsRequest({ address, server: serverMaterial, client: clients[0].material, path: `/v1/owner/pairing-requests/${clients[0].request.request_id}/approve`, method: 'POST', body: codexApprovalBody })));
  assert.deepEqual(concurrentApprovals.map((response) => response.statusCode).sort(), [200, 201]);
  const workbuddyContext = await authority.signApprovalContext({ action: 'pairing.approve', request_id: clients[1].request.request_id, request_digest: created[1].body.session.request_digest, device_fingerprint: certificateFingerprint(clients[1].material.cert), approved_capabilities: ['event.consume'], issued_at: '2026-07-29T10:10:00.000Z', expires_at: '2026-07-29T10:20:00.000Z' });
  const workbuddyApproval = await httpsRequest({ address, server: serverMaterial, client: clients[1].material, path: `/v1/owner/pairing-requests/${clients[1].request.request_id}/approve`, method: 'POST', body: { network_id: 'network-1', request_digest: created[1].body.session.request_digest, approved_capabilities: ['event.consume'], context: workbuddyContext } });
  assert.equal(workbuddyApproval.statusCode, 201);
  assert.equal((await pairing.list('network-1')).filter((record) => record.type === 'human-approved').length, 2);

  await new Promise((resolve) => server.close(resolve));
  server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const recovered = await httpsRequest({ address: server.address(), server: serverMaterial, path: '/v1/owner/pairing-requests?network_id=network-1', headers: { authorization: 'Bearer test-human-session' } });
  assert.equal(recovered.statusCode, 200);
  assert.deepEqual(recovered.body.requests.map((item) => item.status).sort(), ['approved', 'approved']);
  await new Promise((resolve) => server.close(resolve));
  await state.close();
  await rm(root, { recursive: true, force: true });
});
