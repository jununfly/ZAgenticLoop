#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { runCli, type CliSpec } from './cli.js';
import { createOpnAgentJoinRequest, submitOpnAgentJoinRequest } from './opn-agent-join.js';

const spec: CliSpec = {
  name: 'zj-loop-opn-agent-join',
  description: 'Submit a one-time OPN Agent pairing request.',
  usage: 'zj-loop-opn-agent-join --endpoint <https-url> --network-id <id> --request-id <id> --display-name <name> --agent-kind <kind> --agent-version <version> --agent-endpoint <endpoint> --capabilities <csv> --expires-at <iso> --ca <path> --cert <path> --key <path> --session-file <path>',
  options: [
    { name: 'endpoint', type: 'string', description: 'Mac OPN endpoint HTTPS URL', valueName: 'URL' },
    { name: 'server_name', flag: 'server-name', type: 'string', description: 'TLS server name for the pinned certificate', valueName: 'NAME' },
    { name: 'network_id', flag: 'network-id', type: 'string', description: 'OPN network id', valueName: 'ID' },
    { name: 'request_id', flag: 'request-id', type: 'string', description: 'Stable retryable pairing request id', valueName: 'ID' },
    { name: 'display_name', flag: 'display-name', type: 'string', description: 'Human-readable Agent name', valueName: 'NAME' },
    { name: 'agent_kind', flag: 'agent-kind', type: 'string', description: 'Provider-neutral Agent kind', valueName: 'KIND' },
    { name: 'agent_version', flag: 'agent-version', type: 'string', description: 'Agent version', valueName: 'VERSION' },
    { name: 'agent_endpoint', flag: 'agent-endpoint', type: 'string', description: 'Agent callback endpoint reference', valueName: 'ENDPOINT' },
    { name: 'capabilities', type: 'string', description: 'Comma-separated requested capabilities', valueName: 'CSV' },
    { name: 'expires_at', flag: 'expires-at', type: 'string', description: 'Pairing request expiry (ISO-8601)', valueName: 'TIME' },
    { name: 'ca', type: 'string', description: 'Pinned server CA PEM path', valueName: 'PATH' },
    { name: 'cert', type: 'string', description: 'Local Agent client certificate PEM path', valueName: 'PATH' },
    { name: 'key', type: 'string', description: 'Local Agent private key PEM path', valueName: 'PATH' },
    { name: 'session_file', flag: 'session-file', type: 'string', description: 'Local path for the short-lived pairing session', valueName: 'PATH' },
  ],
  async handler({ options, io }) {
    const read = async (name: string) => readFile(String(options[name] ?? ''), 'utf8');
    const requested_capabilities = String(options.capabilities ?? '').split(',').map((value) => value.trim()).filter(Boolean);
    if (!requested_capabilities.length) throw new Error('opn-agent-join-capabilities-required');
    const request = createOpnAgentJoinRequest({
      request_id: String(options.request_id ?? ''),
      network_id: String(options.network_id ?? ''),
      display_name: String(options.display_name ?? ''),
      agent_kind: String(options.agent_kind ?? ''),
      agent_version: String(options.agent_version ?? ''),
      endpoint: String(options.agent_endpoint ?? ''),
      requested_capabilities,
      expires_at: String(options.expires_at ?? ''),
      certificate_pem: await read('cert'),
      private_key_pem: await read('key'),
    });
    const response = await submitOpnAgentJoinRequest({
      endpoint: String(options.endpoint ?? ''),
      server_name: String(options.server_name ?? ''),
      ca: await read('ca'),
      cert: await read('cert'),
      key: await read('key'),
      request,
    });
    const body = response.body as { session?: { session_id?: string; request_id?: string; expires_at?: string; status?: string }; session_token?: string; status?: string; reason?: string };
    if (response.statusCode < 200 || response.statusCode >= 300 || !body.session || typeof body.session_token !== 'string') {
      throw new Error(`opn-agent-join-rejected:${body.reason ?? body.status ?? response.statusCode}`);
    }
    await writeFile(String(options.session_file ?? ''), JSON.stringify({ schema: 'zj-loop.opn_agent_join_session.v1', request_id: body.session.request_id, session_id: body.session.session_id, network_id: request.request.network_id, node_id: request.request.node_id, request_digest: request.proof.request_digest, expires_at: body.session.expires_at, session_token: body.session_token }) + '\n', { mode: 0o600 });
    io.stdout(JSON.stringify({ schema: 'zj-loop.opn_agent_join.v1', status: 'created', request_id: request.request.request_id, node_id: request.request.node_id, request_digest: request.proof.request_digest, session_id: body.session.session_id, expires_at: body.session.expires_at, session_file: String(options.session_file ?? ''), side_effects_executed: true }));
  },
};

process.exitCode = await runCli(spec);
