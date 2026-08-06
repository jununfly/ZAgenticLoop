import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { bootstrapOpnAgentIdentity } from '../dist/opn-agent-identity-bootstrap.js';

const OPENSSL_BIN = process.env.OPENSSL_BIN ?? (existsSync('/opt/homebrew/opt/openssl@3/bin/openssl') ? '/opt/homebrew/opt/openssl@3/bin/openssl' : 'openssl');

test('Agent identity bootstrap creates a P-256 private key, CSR, and pending metadata', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-identity-'));
  try {
    const result = await bootstrapOpnAgentIdentity({ output_dir: root, display_name: 'Windows Agent', agent_kind: 'agent', agent_version: 'dev', openssl_bin: OPENSSL_BIN });
    assert.equal(result.status, 'pending-certificate');
    assert.equal(result.metadata.certificate_status, 'pending');
    assert.equal(result.metadata.algorithm, 'ECDSA-P256');
    assert.equal(result.metadata.display_name, 'Windows Agent');
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE KEY|BEGIN.*KEY/);
    const key = await readFile(result.private_key_path, 'utf8');
    const csr = await readFile(result.csr_path, 'utf8');
    assert.match(key, /BEGIN EC PRIVATE KEY|BEGIN PRIVATE KEY/);
    assert.match(csr, /BEGIN CERTIFICATE REQUEST/);
    const details = execFileSync(OPENSSL_BIN, ['req', '-in', result.csr_path, '-noout', '-text'], { encoding: 'utf8' });
    assert.match(details, /ASN1 OID: prime256v1|NIST CURVE: P-256/);
    await assert.rejects(() => bootstrapOpnAgentIdentity({ output_dir: root, display_name: 'Windows Agent', agent_kind: 'agent', agent_version: 'dev', openssl_bin: OPENSSL_BIN }), /identity-bootstrap-output-exists/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
