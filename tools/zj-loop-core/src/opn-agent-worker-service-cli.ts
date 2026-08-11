#!/usr/bin/env node
import path from 'node:path';
import { runCli, type CliSpec } from './cli.js';
import { installOpnAgentWorkerService, opnAgentWorkerServiceLabel, uninstallOpnAgentWorkerService } from './opn-agent-worker-service.js';
import { opnEndpointIdentityDir } from './opn-endpoint-config.js';

const required = (options: Record<string, string | boolean | undefined>, name: string): string => {
  const value = String(options[name] ?? '').trim();
  if (!value) throw new Error(`opn-agent-worker-${name.replaceAll('_', '-')}-required`);
  return value;
};

const spec: CliSpec = {
  name: 'zj-loop-opn-agent-worker-service',
  description: 'Install or remove the resident OPN Node worker service definition.',
  usage: 'zj-loop-opn-agent-worker-service [install|uninstall] [options]',
  options: [
    { name: 'command', type: 'positional', description: 'Lifecycle command (default: install)' },
    { name: 'network_id', flag: 'network-id', type: 'string', description: 'OPN network id' },
    { name: 'node_id', flag: 'node-id', type: 'string', description: 'OPN node id' },
    { name: 'endpoint', type: 'string', description: 'OPN HTTPS endpoint' },
    { name: 'ca', type: 'string', description: 'CA certificate path' },
    { name: 'cert', type: 'string', description: 'Agent certificate path' },
    { name: 'key', type: 'string', description: 'Agent private key path' },
    { name: 'credential_token_file', flag: 'credential-token-file', type: 'string', description: 'Credential token file path' },
    { name: 'artifact_store', flag: 'artifact-store', type: 'string', description: 'Artifact store directory' },
    { name: 'runner_script', flag: 'runner-script', type: 'string', description: 'opn-agent-runner-cli.js path' },
    { name: 'provider', type: 'string', description: 'codex or workbuddy-code' },
    { name: 'executable', type: 'string', description: 'Provider executable path (optional)' },
    { name: 'session_id', flag: 'session-id', type: 'string', description: 'Provider session id (optional)' },
    { name: 'working_directory', flag: 'cwd', type: 'string', description: 'Worker working directory' },
    { name: 'runtime_dir', flag: 'runtime-dir', type: 'string', description: 'Service log/runtime directory' },
    { name: 'identity_dir', flag: 'identity-dir', type: 'string', description: 'Identity directory used for default paths' },
    { name: 'receive_wait_ms', flag: 'receive-wait-ms', type: 'string', description: 'Long-poll duration in milliseconds (default: 25000)' },
    { name: 'session_refresh_margin_ms', flag: 'session-refresh-margin-ms', type: 'string', description: 'Session refresh margin in milliseconds' },
  ],
  async handler({ options, io }) {
    const command = String(options.command ?? 'install');
    const network_id = required(options, 'network_id');
    const node_id = required(options, 'node_id');
    const label = opnAgentWorkerServiceLabel(network_id, node_id);
    const runtime_dir = String(options.runtime_dir ?? path.join(opnEndpointIdentityDir(options.identity_dir === undefined ? undefined : String(options.identity_dir)), 'worker-runtime'));
    if (command === 'uninstall') {
      const result = await uninstallOpnAgentWorkerService(label);
      io.stdout(JSON.stringify({ schema: 'zj-loop.opn_agent_worker_service.v1', status: 'uninstalled', label, ...result, runtime_dir, side_effects_executed: true }));
      return;
    }
    if (command !== 'install') throw new Error('opn-agent-worker-service-command-invalid');
    const endpoint = required(options, 'endpoint');
    const ca = required(options, 'ca');
    const cert = required(options, 'cert');
    const key = required(options, 'key');
    const credential_token_file = required(options, 'credential_token_file');
    const artifact_store = required(options, 'artifact_store');
    const runner_script = required(options, 'runner_script');
    const working_directory = required(options, 'working_directory');
    const provider = required(options, 'provider');
    if (provider !== 'codex' && provider !== 'workbuddy-code') throw new Error('opn-agent-worker-provider-invalid');
    const args = ['worker', '--endpoint', endpoint, '--network-id', network_id, '--node-id', node_id, '--ca', ca, '--cert', cert, '--key', key, '--credential-token-file', credential_token_file, '--artifact-store', artifact_store, '--provider', provider, '--cwd', working_directory];
    const executable = String(options.executable ?? '').trim();
    const session_id = String(options.session_id ?? '').trim();
    if (executable) args.push('--executable', executable);
    if (session_id) args.push('--session-id', session_id);
    const receive_wait_ms = String(options.receive_wait_ms ?? '').trim();
    const session_refresh_margin_ms = String(options.session_refresh_margin_ms ?? '').trim();
    if (receive_wait_ms) args.push('--receive-wait-ms', receive_wait_ms);
    if (session_refresh_margin_ms) args.push('--session-refresh-margin-ms', session_refresh_margin_ms);
    const result = await installOpnAgentWorkerService({ label, executable: process.execPath, script: runner_script, args, runtime_dir, working_directory });
    io.stdout(JSON.stringify({ schema: 'zj-loop.opn_agent_worker_service.v1', status: 'installed', label, ...result, runtime_dir, command: [process.execPath, runner_script, ...args], side_effects_executed: true }));
  },
};

if (process.argv[1]?.endsWith('opn-agent-worker-service-cli.js')) process.exitCode = await runCli(spec);
