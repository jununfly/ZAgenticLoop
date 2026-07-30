#!/usr/bin/env node
import { createHash, randomBytes, X509Certificate } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { runCli } from './cli.js';
import { createMacOSKeychainHumanSigner } from './macos-keychain-human-signer.js';
import { createHumanApprovalUiServer, createPairingHttpUpstream } from './human-approval-ui.js';

const argv = process.argv.slice(2);
process.exitCode = await runCli({
  name: 'zj-loop-human-approval-ui',
  description: 'Run the local Human approval UI.',
  usage: 'zj-loop-human-approval-ui start [options]',
  options: [
    { name: 'command', type: 'positional', description: 'start', default: 'start' },
    { name: 'network-id', flag: 'network-id', type: 'string', description: 'Configured network id' },
    { name: 'pairing-endpoint', flag: 'pairing-endpoint', type: 'string', description: 'HTTPS Pairing API endpoint' },
    { name: 'owner-authorization', flag: 'owner-authorization', type: 'string', description: 'Owner authorization forwarded to Pairing API' },
    { name: 'human-id', flag: 'human-id', type: 'string', description: 'Human id' },
    { name: 'device-key-id', flag: 'device-key-id', type: 'string', description: 'Human-device lifecycle key id' },
    { name: 'key-tag', flag: 'key-tag', type: 'string', description: 'macOS Keychain key tag' },
    { name: 'helper-path', flag: 'helper-path', type: 'string', description: 'macOS Keychain helper path' },
    { name: 'ca', type: 'string', description: 'Trusted Pairing API CA PEM path' },
    { name: 'client-cert', flag: 'client-cert', type: 'string', description: 'Optional Pairing API client certificate PEM path' },
    { name: 'client-key', flag: 'client-key', type: 'string', description: 'Optional Pairing API client key PEM path' },
    { name: 'open', type: 'boolean', description: 'Open the bootstrap URL in the default browser' },
  ],
  async handler({ io, options }) {
    if (String(options.command) !== 'start') throw new Error('unsupported-human-approval-ui-command');
    const networkId = String(options['network-id'] ?? '').trim();
    const pairingEndpoint = String(options['pairing-endpoint'] ?? '').trim();
    const humanId = String(options['human-id'] ?? '').trim();
    const deviceKeyId = String(options['device-key-id'] ?? '').trim();
    const keyTag = String(options['key-tag'] ?? '').trim();
    const helperPath = String(options['helper-path'] ?? '').trim();
    if (!networkId || !pairingEndpoint || !humanId || !deviceKeyId || !keyTag || !helperPath) throw new Error('network-id-pairing-endpoint-human-id-device-key-id-key-tag-helper-path-required');
    if (typeof options['client-cert'] !== 'string' || typeof options['client-key'] !== 'string') throw new Error('human-device-client-cert-and-key-required');
    const endpoint = new URL(pairingEndpoint);
    if (endpoint.protocol !== 'https:') throw new Error('pairing-upstream-https-required');
    const signer = createMacOSKeychainHumanSigner({ human_id: humanId, key_tag: keyTag, helper_path: helperPath });
    const clientCert = await readFile(options['client-cert'], 'utf8');
    const clientKey = await readFile(options['client-key'], 'utf8');
    let deviceFingerprint: string;
    try { deviceFingerprint = createHash('sha256').update(new X509Certificate(clientCert).raw).digest('hex'); } catch { throw new Error('human-device-client-cert-invalid'); }
    const upstream = createPairingHttpUpstream({ endpoint: pairingEndpoint, authorization: typeof options['owner-authorization'] === 'string' ? options['owner-authorization'] : undefined, ca: typeof options.ca === 'string' ? await readFile(options.ca, 'utf8') : undefined, cert: clientCert, key: clientKey, device_fingerprint: deviceFingerprint });
    const bootstrapToken = randomBytes(32).toString('base64url');
    const server = createHumanApprovalUiServer({ signer, network_id: networkId, human_device: { device_key_id: deviceKeyId, device_fingerprint: deviceFingerprint }, upstream, bootstrap_token: bootstrapToken });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('human-approval-ui-address-unavailable');
    const url = `http://127.0.0.1:${address.port}/ui/bootstrap?token=${encodeURIComponent(bootstrapToken)}`;
    io.stdout(JSON.stringify({ schema: 'zj-loop.human_approval_ui_cli.v1', status: 'listening', url, network_id: networkId, side_effects_executed: false }));
    if (options.open === true && process.platform === 'darwin') spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    await new Promise<void>((resolve) => {
      const close = () => { server.close(() => resolve()); };
      process.once('SIGINT', close);
      process.once('SIGTERM', close);
    });
    return 0;
  },
}, argv);
