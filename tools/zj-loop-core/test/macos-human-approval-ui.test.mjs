import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createMacOSKeychainHumanSigner } from '../dist/macos-keychain-human-signer.js';
import { verifyHumanApprovalContext } from '../dist/human-authority.js';
import { createHumanApprovalUiServer } from '../dist/human-approval-ui.js';

const isMacOS = process.platform === 'darwin';

function request(address, pathValue, options = {}) {
  const payload = options.body === undefined ? undefined : JSON.stringify(options.body);
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port: address.port, path: pathValue, method: options.method ?? 'GET', headers: { ...(payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }), ...(options.headers ?? {}) } }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    request.on('error', reject);
    if (payload !== undefined) request.write(payload);
    request.end();
  });
}

test('macOS Keychain signer completes the real Human approval UI signing path', { skip: !isMacOS }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-macos-ui-'));
  const binary = path.join(root, 'human-signer');
  const source = path.resolve('native/macos-human-signer.swift');
  const tag = `zj-loop-ui-test-${randomUUID()}`;
  execFileSync('swiftc', ['-O', '-framework', 'Security', '-framework', 'CryptoKit', source, '-o', binary], { stdio: 'ignore' });
  const signer = createMacOSKeychainHumanSigner({ human_id: 'human-1', key_tag: tag, helper_path: binary });
  const requestValue = { request_id: 'request-keychain', status: 'pending', request_digest: 'a'.repeat(64), node_id: 'node-keychain', requested_capabilities: ['event.consume'], expires_at: '2026-07-30T01:00:00.000Z' };
  let approval;
  const server = createHumanApprovalUiServer({ signer, network_id: 'network-1', bootstrap_token: 'bootstrap-keychain', upstream: { async list() { return { requests: [requestValue] }; }, async approve(value) { approval = value; return { status: 'recorded' }; } }, now: () => '2026-07-30T00:00:00.000Z' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const bootstrapped = await request(address, '/ui/bootstrap?token=bootstrap-keychain');
    const cookie = bootstrapped.headers['set-cookie'][0].split(';', 1)[0];
    const result = await request(address, '/ui/pairing-requests/request-keychain/approve', { method: 'POST', headers: { cookie, origin: `http://127.0.0.1:${address.port}` }, body: { request_digest: requestValue.request_digest, approved_capabilities: ['event.consume'] } });
    assert.equal(result.status, 201);
    const identity = await signer.getPublicIdentity();
    assert.equal(verifyHumanApprovalContext({ identity: { ...identity, schema: 'zj-loop.human_authority.v1' }, context: approval.context, now: '2026-07-30T00:01:00.000Z' }), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    try { execFileSync(binary, ['delete', tag], { stdio: 'ignore' }); } catch { /* cleanup is best effort after test failure */ }
    await rm(root, { recursive: true, force: true });
  }
});
