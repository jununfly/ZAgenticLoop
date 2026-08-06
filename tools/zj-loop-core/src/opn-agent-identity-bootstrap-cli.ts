#!/usr/bin/env node
import { runCli, type CliSpec } from './cli.js';
import { bootstrapOpnAgentIdentity } from './opn-agent-identity-bootstrap.js';

const spec: CliSpec = {
  name: 'zj-loop-opn-agent-identity',
  description: 'Create a local P-256 Agent key and certificate signing request.',
  usage: 'zj-loop-opn-agent-identity init --output-dir <path> --display-name <name> --agent-kind <kind> --agent-version <version>',
  options: [
    { name: 'command', type: 'positional', description: 'Command', valueName: 'init' },
    { name: 'output_dir', flag: 'output-dir', type: 'string', description: 'Identity output directory', valueName: 'PATH' },
    { name: 'display_name', flag: 'display-name', type: 'string', description: 'Human-readable Agent name', valueName: 'NAME' },
    { name: 'agent_kind', flag: 'agent-kind', type: 'string', description: 'Provider-neutral Agent kind', valueName: 'KIND' },
    { name: 'agent_version', flag: 'agent-version', type: 'string', description: 'Agent version', valueName: 'VERSION' },
    { name: 'openssl_bin', flag: 'openssl-bin', type: 'string', description: 'OpenSSL executable path', valueName: 'PATH' },
  ],
  async handler({ options, io }) {
    if (options.command !== 'init') throw new Error('identity-bootstrap-init-required');
    const result = await bootstrapOpnAgentIdentity({ output_dir: String(options.output_dir ?? ''), display_name: String(options.display_name ?? ''), agent_kind: String(options.agent_kind ?? ''), agent_version: String(options.agent_version ?? ''), openssl_bin: typeof options.openssl_bin === 'string' ? options.openssl_bin : undefined });
    io.stdout(JSON.stringify({ schema: 'zj-loop.opn_agent_identity_bootstrap.v1', status: result.status, private_key_path: result.private_key_path, csr_path: result.csr_path, metadata_path: result.metadata_path, certificate_status: result.metadata.certificate_status, node_id: null, side_effects_executed: true }));
  },
};

process.exitCode = await runCli(spec);
