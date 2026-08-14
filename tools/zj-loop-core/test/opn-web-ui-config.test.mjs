import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile } from 'node:fs/promises';
import {
  OPN_WEB_UI_CONFIG_SCHEMA,
  loadOpnWebUiConfig,
  opnWebUiConfigPath,
  validateOpnWebUiConfig,
  writeOpnWebUiConfig,
} from '../dist/opn-web-ui-config.js';

function config(root, extra = {}) {
  return {
    schema: OPN_WEB_UI_CONFIG_SCHEMA,
    network_id: 'network-1',
    pairing_endpoint: 'https://127.0.0.1:43123',
    owner_token_file: 'owner-token',
    human_id: 'human-1',
    device_key_id: 'device-key-1',
    key_tag: 'zagenticloop.human.owner.dev',
    helper_path: 'signer-helper',
    ca: 'ca.cert.pem',
    client_cert: 'human-device.cert.pem',
    client_key: 'human-device.key.pem',
    state_store: 'state.db',
    port: 55615,
    runtime_dir: 'web-ui-runtime',
    ...extra,
  };
}

test('WebUI config resolves relative paths inside identity dir', () => {
  const root = path.join(os.tmpdir(), 'zj-loop-web-ui-config');
  const result = validateOpnWebUiConfig(config(root), root);
  assert.equal(result.ca, path.join(root, 'ca.cert.pem'));
  assert.equal(result.runtime_dir, path.join(root, 'web-ui-runtime'));
});

test('WebUI config rejects unknown fields and path escape', () => {
  const root = path.join(os.tmpdir(), 'zj-loop-web-ui-config');
  assert.throws(() => validateOpnWebUiConfig(config(root, { unexpected: true }), root), { message: 'opn-web-ui-config-field-invalid' });
  assert.throws(() => validateOpnWebUiConfig(config(root, { ca: '../outside.pem' }), root), { message: 'opn-web-ui-config-ca-outside-identity-dir' });
});

test('WebUI config requires HTTPS and a complete Graph plan pair', () => {
  const root = path.join(os.tmpdir(), 'zj-loop-web-ui-config');
  assert.throws(() => validateOpnWebUiConfig(config(root, { pairing_endpoint: 'http://127.0.0.1:43123' }), root), { message: 'opn-web-ui-config-pairing-endpoint-invalid' });
  assert.throws(() => validateOpnWebUiConfig(config(root, { graph_plan: 'graph-plan.json' }), root), { message: 'opn-web-ui-config-graph-pair-required' });
});

test('WebUI config writes and reloads a strict identity-dir file', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-web-ui-config-'));
  const input = validateOpnWebUiConfig(config(root, { graph_plan: 'graph-plan.json', graph_evidence_store: 'graph-evidence', graph_plan_digest: `sha256:${'1'.repeat(64)}` }), root);
  const written = await writeOpnWebUiConfig(root, input);
  assert.equal(written, opnWebUiConfigPath(root));
  assert.deepEqual(await loadOpnWebUiConfig(root), input);
  const persisted = JSON.parse(await readFile(written, 'utf8'));
  assert.equal(persisted.schema, OPN_WEB_UI_CONFIG_SCHEMA);
  assert.equal(persisted.graph_plan, path.join(root, 'graph-plan.json'));
  assert.equal(persisted.graph_plan_digest, `sha256:${'1'.repeat(64)}`);
});

test('WebUI config supports an explicit cross-platform PEM signer instead of macOS Keychain fields', () => {
  const root = path.join(os.tmpdir(), 'zj-loop-web-ui-config');
  const value = config(root, { signer_key: 'human-signer.key.pem' });
  delete value.key_tag;
  delete value.helper_path;
  const result = validateOpnWebUiConfig(value, root);
  assert.equal(result.signer_key, path.join(root, 'human-signer.key.pem'));
  assert.equal(result.key_tag, undefined);
  assert.equal(result.helper_path, undefined);
});
