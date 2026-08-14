#!/usr/bin/env node
import { createHash, randomBytes, X509Certificate } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { runCli } from './cli.js';
import { createMacOSKeychainHumanSigner } from './macos-keychain-human-signer.js';
import { createPemFileHumanSigner } from './pem-file-human-signer.js';
import { createHumanApprovalUiServer, createPairingHttpUpstream } from './human-approval-ui.js';
import { createSqliteStateStore } from './sqlite-state-store.js';
import { createStateStoreGraphAtomUiUpstream } from './state-store-graph-atom-ui-upstream.js';
import { createContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
import { createRealAgentDogfoodGraphReviewUpstream } from './real-agent-dogfood-graph-review-upstream.js';
import type { RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import { createRealAgentDogfoodApprovalUiUpstream } from './real-agent-dogfood-approval-ui-upstream.js';
import { loadOpnWebUiConfig, opnWebUiIdentityDir, type OpnWebUiConfig } from './opn-web-ui-config.js';
import { installHumanApprovalUiService, opnWebUiServiceLabel, uninstallHumanApprovalUiService } from './human-approval-ui-service.js';

const argv = process.argv.slice(2);
type GatewayBinding = { schema: string; pid: number; port: number; control_token: string; started_at: string };

async function readBinding(filename: string): Promise<GatewayBinding | null> {
  try { return JSON.parse(await readFile(filename, 'utf8')) as GatewayBinding; } catch { return null; }
}

async function controlRequest(binding: GatewayBinding, action: 'bootstrap' | 'stop'): Promise<Record<string, unknown>> {
  const response = await fetch(`http://127.0.0.1:${binding.port}/control/${action}`, { method: 'POST', headers: { 'x-zj-loop-control': binding.control_token } });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(String(body.reason ?? `gateway-${action}-failed`));
  return body;
}

async function gatewayHealth(binding: GatewayBinding): Promise<boolean> {
  try { const response = await fetch(`http://127.0.0.1:${binding.port}/healthz`); return response.ok; } catch { return false; }
}

process.exitCode = await runCli({
  name: 'zj-loop-human-approval-ui',
  description: 'Run the local Human approval UI.',
  usage: 'zj-loop-human-approval-ui [start|status|open|stop|install-service|uninstall-service] [options]',
  options: [
    { name: 'command', type: 'positional', description: 'start', default: 'start' },
    { name: 'identity-dir', flag: 'identity-dir', type: 'string', description: 'Identity directory containing opn-web-ui.json' },
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
    { name: 'state-store', flag: 'state-store', type: 'string', description: 'Optional Coordinator SQLite StateStore for native Graph Review facts' },
    { name: 'graph-plan', flag: 'graph-plan', type: 'string', description: 'Optional real Graph plan JSON path for replay-backed Review UI' },
    { name: 'graph-evidence-store', flag: 'graph-evidence-store', type: 'string', description: 'EvidenceStore root for replay-backed Graph Review' },
    { name: 'open', type: 'boolean', description: 'Open the bootstrap URL in the default browser' },
    { name: 'port', type: 'string', description: 'Local browser server port (0 chooses a free port)' },
    { name: 'runtime-dir', flag: 'runtime-dir', type: 'string', description: 'Persistent local Gateway runtime directory' },
  ],
  async handler({ io, options }) {
    const command = String(options.command ?? 'start');
    const identityDir = typeof options['identity-dir'] === 'string' ? opnWebUiIdentityDir(String(options['identity-dir'])) : '';
    const configured: OpnWebUiConfig | undefined = identityDir ? await loadOpnWebUiConfig(identityDir) : undefined;
    const runtimeDir = path.resolve(String(options['runtime-dir'] ?? configured?.runtime_dir ?? path.join('.tmp', 'human-approval-ui')));
    const bindingPath = path.join(runtimeDir, 'binding.json');
    const existing = await readBinding(bindingPath);
    const configuredNetworkId = configured?.network_id ?? String(options['network-id'] ?? '').trim();
    if (command === 'install-service' || command === 'uninstall-service') {
      if (!identityDir) throw new Error('opn-web-ui-identity-dir-required-for-service');
      if (!configuredNetworkId) throw new Error('opn-web-ui-network-id-required-for-service');
      const label = opnWebUiServiceLabel(configuredNetworkId);
      if (command === 'uninstall-service') {
        const result = await uninstallHumanApprovalUiService(label);
        io.stdout(JSON.stringify({ schema: 'zj-loop.human_approval_ui_service.v1', status: 'uninstalled', label, ...result, identity_dir: identityDir, side_effects_executed: true }));
        return 0;
      }
      const result = await installHumanApprovalUiService({
        label,
        executable: process.execPath,
        script: process.argv[1]!,
        args: ['start', '--identity-dir', identityDir],
        runtime_dir: path.resolve(String(configured?.runtime_dir ?? runtimeDir)),
        working_directory: process.cwd(),
      });
      io.stdout(JSON.stringify({ schema: 'zj-loop.human_approval_ui_service.v1', status: 'installed', label, ...result, identity_dir: identityDir, side_effects_executed: true }));
      return 0;
    }
    if (command === 'status') {
      const healthy = existing ? await gatewayHealth(existing) : false;
      io.stdout(JSON.stringify({ schema: 'zj-loop.human_approval_ui_cli.v1', status: healthy ? 'running' : 'stopped', ...(existing ?? {}), side_effects_executed: false }));
      return healthy ? 0 : 1;
    }
    if (command === 'open') {
      if (!existing || !(await gatewayHealth(existing))) throw new Error('human-approval-ui-gateway-not-running');
      const issued = await controlRequest(existing, 'bootstrap');
      const url = `http://127.0.0.1:${existing.port}${String(issued.url)}`;
      io.stdout(JSON.stringify({ schema: 'zj-loop.human_approval_ui_cli.v1', status: 'ready', url, stable_url: `http://127.0.0.1:${existing.port}/`, side_effects_executed: false }));
      if (options.open === true) {
        const opener: { command: string; args: string[] } = process.platform === 'darwin' ? { command: 'open', args: [url] } : process.platform === 'win32' ? { command: 'cmd', args: ['/c', 'start', '', url] } : { command: 'xdg-open', args: [url] };
        spawn(opener.command, opener.args, { stdio: 'ignore', detached: true, windowsHide: true }).unref();
      }
      return 0;
    }
    if (command === 'stop') {
      if (!existing || !(await gatewayHealth(existing))) { await rm(bindingPath, { force: true }); io.stdout(JSON.stringify({ schema: 'zj-loop.human_approval_ui_cli.v1', status: 'stopped', side_effects_executed: false })); return 0; }
      const result = await controlRequest(existing, 'stop');
      io.stdout(JSON.stringify({ schema: 'zj-loop.human_approval_ui_cli.v1', ...result }));
      return 0;
    }
    if (command !== 'start') throw new Error('unsupported-human-approval-ui-command');
    if (existing && await gatewayHealth(existing)) throw new Error('human-approval-ui-gateway-already-running');
    await rm(bindingPath, { force: true });
    await mkdir(runtimeDir, { recursive: true });
    const networkId = configuredNetworkId;
    const pairingEndpoint = configured?.pairing_endpoint ?? String(options['pairing-endpoint'] ?? '').trim();
    const humanId = configured?.human_id ?? String(options['human-id'] ?? '').trim();
    const deviceKeyId = configured?.device_key_id ?? String(options['device-key-id'] ?? '').trim();
    const keyTag = configured?.key_tag ?? String(options['key-tag'] ?? '').trim();
    const helperPath = configured?.helper_path ?? String(options['helper-path'] ?? '').trim();
    const signerKey = configured?.signer_key;
    if (!networkId || !pairingEndpoint || !humanId || !deviceKeyId || (!signerKey && (!keyTag || !helperPath))) throw new Error('network-id-pairing-endpoint-human-id-device-key-id-signer-required');
    const clientCertPath = configured?.client_cert ?? (typeof options['client-cert'] === 'string' ? options['client-cert'] : '');
    const clientKeyPath = configured?.client_key ?? (typeof options['client-key'] === 'string' ? options['client-key'] : '');
    if (!clientCertPath || !clientKeyPath) throw new Error('human-device-client-cert-and-key-required');
    const endpoint = new URL(pairingEndpoint);
    if (endpoint.protocol !== 'https:') throw new Error('pairing-upstream-https-required');
    const signer = signerKey
      ? createPemFileHumanSigner({ human_id: humanId, private_key_path: signerKey })
      : createMacOSKeychainHumanSigner({ human_id: humanId, key_tag: keyTag, helper_path: helperPath });
    const clientCert = await readFile(clientCertPath, 'utf8');
    const clientKey = await readFile(clientKeyPath, 'utf8');
    let deviceFingerprint: string;
    try { deviceFingerprint = createHash('sha256').update(new X509Certificate(clientCert).raw).digest('hex'); } catch { throw new Error('human-device-client-cert-invalid'); }
    const ownerAuthorization = configured ? `Bearer ${(await readFile(configured.owner_token_file, 'utf8')).trim()}` : (typeof options['owner-authorization'] === 'string' ? options['owner-authorization'] : undefined);
    const caPath = configured?.ca ?? (typeof options.ca === 'string' ? options.ca : '');
    const upstream = createPairingHttpUpstream({ network_id: networkId, endpoint: pairingEndpoint, authorization: ownerAuthorization, ca: caPath ? await readFile(caPath, 'utf8') : undefined, cert: clientCert, key: clientKey, device_fingerprint: deviceFingerprint });
    const stateStorePath = configured?.state_store ?? (typeof options['state-store'] === 'string' ? options['state-store'].trim() : '');
    const stateStore = stateStorePath ? createSqliteStateStore({ filename: stateStorePath }) : undefined;
    let graph;
    let dogfoodApprovals;
    let graphFeatureStatus: { status: 'ready' | 'not-configured' | 'invalid-config'; reason?: string } = { status: 'not-configured' };
    const graphPlanPath = configured?.graph_plan ?? (typeof options['graph-plan'] === 'string' ? options['graph-plan'].trim() : '');
    const graphEvidenceRoot = configured?.graph_evidence_store ?? (typeof options['graph-evidence-store'] === 'string' ? options['graph-evidence-store'].trim() : '');
    if (stateStore && graphPlanPath) {
      if (!graphEvidenceRoot) {
        graphFeatureStatus = { status: 'invalid-config', reason: 'graph-evidence-store-required-with-graph-plan' };
      } else {
        try {
          const plan = JSON.parse(await readFile(graphPlanPath, 'utf8')) as RealAgentDogfoodGraphPlan;
          if (configured?.graph_plan_digest && plan.plan_digest !== configured.graph_plan_digest) throw new Error('graph-plan-digest-mismatch');
          const evidenceStore = await createContentAddressedEvidenceStore({ root: graphEvidenceRoot });
          graph = createRealAgentDogfoodGraphReviewUpstream({ stateStore, evidenceStore, network_id: networkId, plans: [plan] });
          dogfoodApprovals = createRealAgentDogfoodApprovalUiUpstream({ stateStore, evidenceRoot: graphEvidenceRoot, network_id: networkId, plans: [plan] });
          graphFeatureStatus = { status: 'ready' };
        } catch (error) {
          graphFeatureStatus = { status: 'invalid-config', reason: error instanceof Error ? error.message : 'graph-config-invalid' };
        }
      }
    } else if (stateStore) {
      graph = createStateStoreGraphAtomUiUpstream({ stateStore, network_id: networkId });
    }
    const bootstrapToken = randomBytes(32).toString('base64url');
    const controlToken = randomBytes(32).toString('base64url');
    let closeServer: (() => Promise<void>) | undefined;
    const server = createHumanApprovalUiServer({ signer, network_id: networkId, human_device: { device_key_id: deviceKeyId, device_fingerprint: deviceFingerprint }, upstream, graph, dogfoodApprovals, graphFeatureStatus, bootstrap_token: bootstrapToken, session_store_path: path.join(runtimeDir, 'sessions.json'), control_token: controlToken, on_shutdown: () => { void closeServer?.(); } });
    const portValue = typeof options.port === 'string' && options.port.trim() !== '' ? Number(options.port) : 0;
    if (!Number.isInteger(portValue) || portValue < 0 || portValue > 65535) throw new Error('human-approval-ui-port-invalid');
    const port = portValue;
    await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('human-approval-ui-address-unavailable');
    const binding: GatewayBinding = { schema: 'zj-loop.human_approval_ui_binding.v1', pid: process.pid, port: address.port, control_token: controlToken, started_at: new Date().toISOString() };
    const temporaryBindingPath = `${bindingPath}.${process.pid}.tmp`;
    await writeFile(temporaryBindingPath, JSON.stringify(binding));
    await rename(temporaryBindingPath, bindingPath);
    const url = `http://127.0.0.1:${address.port}/ui/bootstrap?token=${encodeURIComponent(bootstrapToken)}`;
    io.stdout(JSON.stringify({ schema: 'zj-loop.human_approval_ui_cli.v1', status: 'listening', url, stable_url: `http://127.0.0.1:${address.port}/`, runtime_dir: runtimeDir, network_id: networkId, side_effects_executed: false }));
    if (options.open === true) {
      const opener: { command: string; args: string[] } = process.platform === 'darwin' ? { command: 'open', args: [url] } : process.platform === 'win32' ? { command: 'cmd', args: ['/c', 'start', '', url] } : { command: 'xdg-open', args: [url] };
      spawn(opener.command, opener.args, { stdio: 'ignore', detached: true, windowsHide: true }).unref();
    }
    await new Promise<void>((resolve) => {
      let closed = false;
      const close = async () => {
        if (closed) return;
        closed = true;
        await new Promise<void>((done) => server.close(() => done()));
        await stateStore?.close();
        await rm(bindingPath, { force: true });
        resolve();
      };
      closeServer = close;
      process.once('SIGINT', () => { void close(); });
      process.once('SIGTERM', () => { void close(); });
    });
    return 0;
  },
}, argv);
