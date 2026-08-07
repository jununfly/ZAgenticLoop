#!/usr/bin/env node
import { runCli, type CliSpec } from './cli.js';
import { bootstrapOpnAgentIdentity } from './opn-agent-identity-bootstrap.js';
import { signOpnAgentCertificate } from './opn-agent-certificate-signer.js';

const spec: CliSpec = {
  name: 'zj-loop-opn-agent-identity',
  description: 'Create a local P-256 Agent key and certificate signing request.',
  usage: 'zj-loop-opn-agent-identity init|sign ...',
  options: [
    { name: 'command', type: 'positional', description: 'Command', valueName: 'init' },
    { name: 'output_dir', flag: 'output-dir', type: 'string', description: 'Identity output directory', valueName: 'PATH' },
    { name: 'display_name', flag: 'display-name', type: 'string', description: 'Human-readable Agent name', valueName: 'NAME' },
    { name: 'agent_kind', flag: 'agent-kind', type: 'string', description: 'Provider-neutral Agent kind', valueName: 'KIND' },
    { name: 'agent_version', flag: 'agent-version', type: 'string', description: 'Agent version', valueName: 'VERSION' },
    { name: 'openssl_bin', flag: 'openssl-bin', type: 'string', description: 'OpenSSL executable path', valueName: 'PATH' },
    { name: 'csr', type: 'string', description: 'CSR PEM path for sign', valueName: 'PATH' },
    { name: 'ca_key', flag: 'ca-key', type: 'string', description: 'CA private key PEM path for sign', valueName: 'PATH' },
    { name: 'ca_cert', flag: 'ca-cert', type: 'string', description: 'CA certificate PEM path for sign', valueName: 'PATH' },
    { name: 'output_cert', flag: 'output-cert', type: 'string', description: 'Signed certificate PEM output path', valueName: 'PATH' },
    { name: 'serial', type: 'string', description: 'CA serial file path', valueName: 'PATH' },
    { name: 'days', type: 'string', description: 'Certificate validity in days', valueName: 'DAYS' },
  ],
  async handler({ options, io }) {
    if (options.command === 'sign') {
      const result = await signOpnAgentCertificate({ csr_path: String(options.csr ?? ''), ca_key_path: String(options.ca_key ?? ''), ca_cert_path: String(options.ca_cert ?? ''), output_cert_path: String(options.output_cert ?? ''), serial_path: typeof options.serial === 'string' ? options.serial : undefined, days: options.days === undefined ? undefined : Number(options.days), openssl_bin: typeof options.openssl_bin === 'string' ? options.openssl_bin : undefined });
      io.stdout(JSON.stringify({ ...result, side_effects_executed: true }));
      return;
    }
    if (options.command !== 'init') throw new Error('identity-bootstrap-init-required');
    const result = await bootstrapOpnAgentIdentity({ output_dir: String(options.output_dir ?? ''), display_name: String(options.display_name ?? ''), agent_kind: String(options.agent_kind ?? ''), agent_version: String(options.agent_version ?? ''), openssl_bin: typeof options.openssl_bin === 'string' ? options.openssl_bin : undefined });
    io.stdout(JSON.stringify({ schema: 'zj-loop.opn_agent_identity_bootstrap.v1', status: result.status, private_key_path: result.private_key_path, csr_path: result.csr_path, metadata_path: result.metadata_path, certificate_status: result.metadata.certificate_status, node_id: null, side_effects_executed: true }));
  },
};

process.exitCode = await runCli(spec);
