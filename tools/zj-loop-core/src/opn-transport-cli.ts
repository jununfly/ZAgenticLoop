#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { runCli, type CliIo, type CliSpec, defaultCliIo } from './cli.js';
import { createLocalOpnTransportAdapter } from './opn-center-transport.js';
import { createTlsTransportAdapter } from './tls-transport-adapter.js';
import { createSqliteStateStore } from './sqlite-state-store.js';
import { createTransportEnvelope } from './transport-contract.js';

const digest = 'sha256:' + '0'.repeat(64);

async function textFile(path: string, error: string): Promise<string> {
  if (!path.trim()) throw new Error(error);
  return readFile(path, 'utf8');
}

function nodeId(options: Record<string, string | boolean | undefined>, session?: { node_id?: unknown }): string {
  const value = typeof options.node_id === 'string' && options.node_id.trim() ? options.node_id : typeof session?.node_id === 'string' ? session.node_id : '';
  if (!value.trim()) throw new Error('opn-transport-node-id-required');
  return value;
}

function messageEnvelope(options: Record<string, string | boolean | undefined>, from_node_id: string): ReturnType<typeof createTransportEnvelope> {
  const now = new Date();
  const value = (name: string, fallback: string): string => typeof options[name] === 'string' && options[name] ? options[name] as string : fallback;
  const target = value('target_node_id', '');
  if (!target.trim()) throw new Error('opn-transport-target-node-id-required');
  const revision = Number(value('plan_revision', '1'));
  if (!Number.isInteger(revision) || revision < 0) throw new Error('opn-transport-plan-revision-invalid');
  return createTransportEnvelope({
    message_id: value('message_id', `opn-message-${Date.now()}`),
    network_id: value('network_id', ''),
    event_id: value('event_id', `opn-event-${Date.now()}`),
    plan_id: value('plan_id', 'opn-dogfood-transport'),
    plan_revision: revision,
    task_id: value('task_id', 'opn-transport-cli'),
    from_node_id,
    target_node_id: target,
    notification_kind: value('notification_kind', 'dogfood-message'),
    state: 'available',
    artifact_refs: [{ artifact_id: digest, content_sha256: digest, kind: 'evidence' }],
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 50 * 60 * 1000).toISOString(),
  });
}

export const opnTransportCliSpec: CliSpec = {
  name: 'zj-loop-opn-transport',
  description: 'Send and receive provider-neutral OPN transport envelopes.',
  usage: 'zj-loop-opn-transport [receive|send|local-send] ...',
  options: [
    { name: 'command', type: 'positional', description: 'receive, send, or local-send', default: 'receive' },
    { name: 'endpoint', type: 'string', description: 'Remote OPN HTTPS endpoint' },
    { name: 'network_id', flag: 'network-id', type: 'string', description: 'OPN network id' },
    { name: 'node_id', flag: 'node-id', type: 'string', description: 'Local Agent or center node id' },
    { name: 'target_node_id', flag: 'target-node-id', type: 'string', description: 'Target node id' },
    { name: 'ca', type: 'string', description: 'Pinned server CA PEM path' },
    { name: 'cert', type: 'string', description: 'Client certificate PEM path' },
    { name: 'key', type: 'string', description: 'Client private key PEM path' },
    { name: 'credential_token_file', flag: 'credential-token-file', type: 'string', description: 'Opaque claimed credential token path' },
    { name: 'session_file', flag: 'session-file', type: 'string', description: 'Join session file used to derive node id' },
    { name: 'state_store', flag: 'state-store', type: 'string', description: 'Local SQLite StateStore path for center commands' },
    { name: 'message_id', flag: 'message-id', type: 'string', description: 'Message id for send' },
    { name: 'event_id', flag: 'event-id', type: 'string', description: 'Event id for send' },
    { name: 'plan_id', flag: 'plan-id', type: 'string', description: 'Plan id for send' },
    { name: 'plan_revision', flag: 'plan-revision', type: 'string', description: 'Plan revision for send' },
    { name: 'task_id', flag: 'task-id', type: 'string', description: 'Task id for send' },
    { name: 'notification_kind', flag: 'notification-kind', type: 'string', description: 'Notification kind for send' },
  ],
  async handler({ options, io }) {
    const command = String(options.command ?? 'receive');
    const network_id = String(options.network_id ?? '').trim();
    if (!network_id) throw new Error('opn-transport-network-id-required');
    let sessionValue: { node_id?: unknown } | undefined;
    if (typeof options.session_file === 'string' && options.session_file.trim()) sessionValue = JSON.parse(await textFile(options.session_file, 'opn-transport-session-file-required')) as { node_id?: unknown };
    const localNodeId = nodeId(options, sessionValue);

    if (command === 'local-send') {
      const stateStore = createSqliteStateStore({ filename: String(options.state_store ?? '') });
      try {
        const adapter = createLocalOpnTransportAdapter({ stateStore, network_id, node_id: localNodeId });
        const session = await adapter.openSession({ network_id, node_id: localNodeId });
        const envelope = messageEnvelope(options, localNodeId);
        const result = await adapter.send({ session_id: session.session_id, envelope });
        await adapter.closeSession({ session_id: session.session_id });
        io.stdout(JSON.stringify({ schema: 'zj-loop.opn_transport_cli.v1', status: result.status === 'duplicate' ? 'duplicate' : 'sent', message_id: envelope.message_id, envelope_digest: envelope.envelope_digest, session_id: session.session_id, side_effects_executed: false }));
        return;
      } finally { await stateStore.close(); }
    }

    const endpoint = String(options.endpoint ?? '').trim();
    const adapter = createTlsTransportAdapter({ endpoint, ca: await textFile(String(options.ca ?? ''), 'opn-transport-ca-required'), cert: await textFile(String(options.cert ?? ''), 'opn-transport-client-cert-required'), key: await textFile(String(options.key ?? ''), 'opn-transport-client-key-required'), bearer_token: (await textFile(String(options.credential_token_file ?? ''), 'opn-transport-credential-token-required')).trim() });
    const session = await adapter.openSession({ network_id, node_id: localNodeId });
    try {
      if (command === 'receive') {
        const envelope = await adapter.receive({ session_id: session.session_id });
        if (!envelope) {
          io.stdout(JSON.stringify({ schema: 'zj-loop.opn_transport_cli.v1', status: 'empty', session_id: session.session_id, reconnected: true, side_effects_executed: false }));
          return;
        }
        const acknowledged = await adapter.acknowledge({ session_id: session.session_id, message_id: envelope.message_id, envelope_digest: envelope.envelope_digest });
        io.stdout(JSON.stringify({ schema: 'zj-loop.opn_transport_cli.v1', status: acknowledged.status === 'duplicate' ? 'duplicate' : 'received', message_id: envelope.message_id, envelope_digest: envelope.envelope_digest, from_node_id: envelope.from_node_id, target_node_id: envelope.target_node_id, notification_kind: envelope.notification_kind, acknowledgement: acknowledged.status, session_id: session.session_id, reconnected: true, side_effects_executed: false }));
        return;
      }
      if (command !== 'send') throw new Error('opn-transport-command-invalid');
      const envelope = messageEnvelope(options, localNodeId);
      const result = await adapter.send({ session_id: session.session_id, envelope });
      io.stdout(JSON.stringify({ schema: 'zj-loop.opn_transport_cli.v1', status: result.status === 'duplicate' ? 'duplicate' : 'sent', message_id: envelope.message_id, envelope_digest: envelope.envelope_digest, session_id: session.session_id, reconnected: true, side_effects_executed: false }));
    } finally { await adapter.closeSession({ session_id: session.session_id }); }
  },
};

export async function runOpnTransportCli(argv: readonly string[] = process.argv.slice(2), io: CliIo = defaultCliIo): Promise<number> {
  return runCli(opnTransportCliSpec, argv, io);
}

if (process.argv[1]?.endsWith('opn-transport-cli.js')) process.exitCode = await runOpnTransportCli();
