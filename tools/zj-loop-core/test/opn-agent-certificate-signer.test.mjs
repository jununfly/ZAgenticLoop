import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { bootstrapOpnAgentIdentity } from '../dist/opn-agent-identity-bootstrap.js';
import { signOpnAgentCertificate } from '../dist/opn-agent-certificate-signer.js';

const OPENSSL_BIN = process.env.OPENSSL_BIN ?? (existsSync('/opt/homebrew/opt/openssl@3/bin/openssl') ? '/opt/homebrew/opt/openssl@3/bin/openssl' : 'openssl');

test('signs a Windows Agent CSR with a development CA without copying the CA key to the Agent', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-csr-signer-'));
  const caKey = path.join(root, 'ca.key.pem');
  const caCert = path.join(root, 'ca.cert.pem');
  const identityDir = path.join(root, 'agent');
  const outputCert = path.join(root, 'agent.cert.pem');
  try {
    execFileSync(OPENSSL_BIN, ['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', caKey]);
    execFileSync(OPENSSL_BIN, ['req', '-x509', '-new', '-key', caKey, '-out', caCert, '-subj', '/CN=ZAgenticLoop Dev CA', '-days', '30']);
    const bootstrap = await bootstrapOpnAgentIdentity({ output_dir: identityDir, display_name: 'Windows Agent', agent_kind: 'Agent2', agent_version: 'dev', openssl_bin: OPENSSL_BIN });
    const result = await signOpnAgentCertificate({ csr_path: bootstrap.csr_path, ca_key_path: caKey, ca_cert_path: caCert, output_cert_path: outputCert, openssl_bin: OPENSSL_BIN });
    assert.equal(result.status, 'signed');
    assert.equal((await readFile(outputCert, 'utf8')).includes('BEGIN CERTIFICATE'), true);
    const details = execFileSync(OPENSSL_BIN, ['x509', '-in', outputCert, '-noout', '-issuer', '-text'], { encoding: 'utf8' });
    assert.match(details, /Issuer:.*ZAgenticLoop Dev CA/);
    assert.match(details, /TLS Web Client Authentication/);
    assert.equal(path.basename(bootstrap.private_key_path), 'agent.key.pem');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('refuses to overwrite a signed Agent certificate', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-csr-signer-existing-'));
  const outputCert = path.join(root, 'agent.cert.pem');
  try {
    await import('node:fs/promises').then(({ writeFile }) => writeFile(outputCert, 'existing'));
    await assert.rejects(() => signOpnAgentCertificate({ csr_path: 'missing', ca_key_path: 'missing', ca_cert_path: 'missing', output_cert_path: outputCert }), /certificate-signer-output-exists/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
