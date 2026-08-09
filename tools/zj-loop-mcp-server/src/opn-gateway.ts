import { createHash, X509Certificate } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createTlsOpnArtifactDownloader,
  createTlsOpnArtifactPublisher,
  createTlsTransportAdapter,
  createTransportEnvelope,
  validateBoundedLoopTask,
} from '@jununfly/zj-loop-core';

const OPN_ARTIFACT_SCHEMA = 'zj-loop.opn_artifact.v1';
const OPN_ARTIFACT_MAX_BYTES = 8 * 1024 * 1024;

type GatewayConfig = {
  network_id: string;
  node_id: string;
  endpoint: string;
  ca: string;
  cert: string;
  key: string;
  credential_token: string;
  artifact_store: string;
};

export type GatewayResult = { status: 'ok'; value: Record<string, unknown> } | { status: 'blocked'; reason: string };

async function fileValue(name: string, filePath?: string): Promise<string> {
  const path = filePath?.trim();
  if (!path) throw new Error(`${name}-required`);
  return (await readFile(path, 'utf8')).trim();
}

async function config(): Promise<GatewayConfig> {
  const nodeDir = process.env.OPN_NODE_DIR?.trim() || process.env.OPN_IDENTITY_DIR?.trim();
  const sibling = (name: string): string | undefined => nodeDir ? path.join(nodeDir, name) : undefined;
  const pathValue = (environmentName: string, siblingName: string): string | undefined => process.env[environmentName]?.trim() || sibling(siblingName);
  const network_id = process.env.OPN_NETWORK_ID?.trim();
  const endpoint = process.env.OPN_ENDPOINT?.trim();
  const artifact_store = process.env.OPN_ARTIFACT_STORE?.trim() || sibling('artifacts');
  const caPath = pathValue('OPN_CA_FILE', 'ca.cert.pem');
  const certPath = pathValue('OPN_CERT_FILE', 'agent.cert.pem');
  const keyPath = pathValue('OPN_KEY_FILE', 'agent.key.pem');
  const credentialTokenPath = pathValue('OPN_CREDENTIAL_TOKEN_FILE', 'join-session.json.credential-token');
  if (!network_id || !endpoint || !artifact_store || !caPath || !certPath || !keyPath || !credentialTokenPath) throw new Error('opn-gateway-not-configured');
  const cert = await fileValue('OPN_CERT_FILE', certPath);
  const node_id = process.env.OPN_NODE_ID?.trim() || createHash('sha256').update(new X509Certificate(cert).raw).digest('hex');
  return { network_id, node_id, endpoint, artifact_store, ca: await fileValue('OPN_CA_FILE', caPath), cert, key: await fileValue('OPN_KEY_FILE', keyPath), credential_token: await fileValue('OPN_CREDENTIAL_TOKEN_FILE', credentialTokenPath) };
}

function blocked(error: unknown): GatewayResult {
  return { status: 'blocked', reason: error instanceof Error ? error.message : 'opn-gateway-failed' };
}

async function putLocalArtifact(input: { root: string; bytes: Buffer; file_name: string; media_type: string }) {
  if (input.bytes.byteLength > OPN_ARTIFACT_MAX_BYTES) throw new Error('opn-artifact-too-large');
  const content_sha256 = `sha256:${createHash('sha256').update(input.bytes).digest('hex')}`;
  const metadata = {
    schema: OPN_ARTIFACT_SCHEMA as typeof OPN_ARTIFACT_SCHEMA,
    artifact_id: content_sha256,
    content_sha256,
    size_bytes: input.bytes.byteLength,
    file_name: input.file_name,
    media_type: input.media_type,
  };
  await mkdir(input.root, { recursive: true });
  const artifactPath = path.join(input.root, content_sha256.slice('sha256:'.length));
  const metadataPath = `${artifactPath}.json`;
  try {
    await writeFile(artifactPath, input.bytes, { flag: 'wx' });
    await writeFile(metadataPath, JSON.stringify(metadata), { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  return { metadata };
}

export async function opnInboxRead(): Promise<GatewayResult> {
  try {
    const value = await config();
    const transport = createTlsTransportAdapter({ endpoint: value.endpoint, ca: value.ca, cert: value.cert, key: value.key, bearer_token: value.credential_token });
    const session = await transport.openSession({ network_id: value.network_id, node_id: value.node_id });
    try {
      const envelope = await transport.receive({ session_id: session.session_id });
      if (!envelope) return { status: 'ok', value: { schema: 'zj-loop.opn_mcp_inbox.v1', status: 'empty', network_id: value.network_id, node_id: value.node_id } };
      let message: unknown;
      const firstArtifact = envelope.artifact_refs[0]?.artifact_id;
      if (firstArtifact) {
        try {
          const downloader = createTlsOpnArtifactDownloader({ endpoint: value.endpoint, ca: value.ca, cert: value.cert, key: value.key, bearer_token: value.credential_token });
          message = JSON.parse((await downloader.download(firstArtifact)).toString('utf8'));
        } catch { message = undefined; }
      }
      return { status: 'ok', value: { schema: 'zj-loop.opn_mcp_inbox.v1', status: 'available', session_id: session.session_id, envelope, ...(message === undefined ? {} : { message }) } };
    } finally { await transport.closeSession({ session_id: session.session_id }); }
  } catch (error) { return blocked(error); }
}

export async function opnInboxAck(input: { message_id: string; envelope_digest: string }): Promise<GatewayResult> {
  try {
    if (!input.message_id.trim() || !input.envelope_digest.trim()) throw new Error('opn-message-id-and-envelope-digest-required');
    const value = await config();
    const transport = createTlsTransportAdapter({ endpoint: value.endpoint, ca: value.ca, cert: value.cert, key: value.key, bearer_token: value.credential_token });
    const session = await transport.openSession({ network_id: value.network_id, node_id: value.node_id });
    try {
      const result = await transport.acknowledge({ session_id: session.session_id, message_id: input.message_id, envelope_digest: input.envelope_digest });
      return { status: 'ok', value: { schema: 'zj-loop.opn_mcp_inbox_ack.v1', ...result } };
    } finally { await transport.closeSession({ session_id: session.session_id }); }
  } catch (error) { return blocked(error); }
}

export async function opnMessageSend(input: { target_node_id: string; message: string; message_id?: string; notification_kind?: string }): Promise<GatewayResult> {
  try {
    if (!input.target_node_id.trim() || !input.message.trim()) throw new Error('opn-message-target-and-content-required');
    const value = await config();
    const bytes = Buffer.from(JSON.stringify({ schema: 'zj-loop.opn_mcp_message.v1', message: input.message, sent_at: new Date().toISOString(), sender_node_id: value.node_id }));
    const artifact = await putLocalArtifact({ root: value.artifact_store, bytes, file_name: `${input.message_id ?? `opn-message-${Date.now()}`}.json`, media_type: 'application/json' });
    const publisher = createTlsOpnArtifactPublisher({ endpoint: value.endpoint, ca: value.ca, cert: value.cert, key: value.key, bearer_token: value.credential_token });
    await publisher.publish({ bytes, metadata: artifact.metadata, transfer_id: `mcp:${input.message_id ?? Date.now()}`, target_node_id: input.target_node_id });
    const transport = createTlsTransportAdapter({ endpoint: value.endpoint, ca: value.ca, cert: value.cert, key: value.key, bearer_token: value.credential_token });
    const session = await transport.openSession({ network_id: value.network_id, node_id: value.node_id });
    try {
      const envelope = createTransportEnvelope({ message_id: input.message_id ?? `opn-message-${Date.now()}`, network_id: value.network_id, event_id: `opn-event-${Date.now()}`, plan_id: 'opn-mcp-gateway', plan_revision: 1, task_id: 'opn-mcp-message', from_node_id: value.node_id, target_node_id: input.target_node_id, notification_kind: input.notification_kind ?? 'mcp.message', state: 'available', artifact_refs: [{ artifact_id: artifact.metadata.artifact_id, content_sha256: artifact.metadata.content_sha256, kind: 'artifact' }], created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 50 * 60 * 1000).toISOString() });
      const result = await transport.send({ session_id: session.session_id, envelope });
      return { status: 'ok', value: { schema: 'zj-loop.opn_mcp_message_send.v1', status: result.status, message_id: envelope.message_id, envelope_digest: envelope.envelope_digest, artifact_id: artifact.metadata.artifact_id, side_effects_executed: false } };
    } finally { await transport.closeSession({ session_id: session.session_id }); }
  } catch (error) { return blocked(error); }
}

export async function opnAgentTaskSend(input: { target_node_id: string; task_json: string; message_id?: string; event_id?: string; plan_id?: string; plan_revision?: number }): Promise<GatewayResult> {
  try {
    if (!input.target_node_id.trim() || !input.task_json.trim()) throw new Error('opn-task-target-and-content-required');
    let task: Record<string, unknown>;
    try { task = JSON.parse(input.task_json) as Record<string, unknown>; } catch { throw new Error('opn-task-json-invalid'); }
    const validation = validateBoundedLoopTask(task);
    if (validation.status !== 'valid') throw new Error(validation.reason);
    const value = await config();
    const bytes = Buffer.from(input.task_json);
    const artifact = await putLocalArtifact({ root: value.artifact_store, bytes, file_name: `${task.task_id}.json`, media_type: 'application/json' });
    const publisher = createTlsOpnArtifactPublisher({ endpoint: value.endpoint, ca: value.ca, cert: value.cert, key: value.key, bearer_token: value.credential_token });
    const messageId = input.message_id ?? `agent-task-${Date.now()}`;
    await publisher.publish({ bytes, metadata: artifact.metadata, transfer_id: `task-artifact:${messageId}`, target_node_id: input.target_node_id });
    const transport = createTlsTransportAdapter({ endpoint: value.endpoint, ca: value.ca, cert: value.cert, key: value.key, bearer_token: value.credential_token });
    const session = await transport.openSession({ network_id: value.network_id, node_id: value.node_id });
    try {
      const now = new Date();
      const envelope = createTransportEnvelope({ message_id: messageId, network_id: value.network_id, event_id: input.event_id ?? `agent-event-${Date.now()}`, plan_id: input.plan_id ?? 'opn-agent-task', plan_revision: input.plan_revision ?? 1, task_id: String(task.task_id), from_node_id: value.node_id, target_node_id: input.target_node_id, notification_kind: 'agent.task', state: 'available', artifact_refs: [{ artifact_id: artifact.metadata.artifact_id, content_sha256: artifact.metadata.content_sha256, kind: 'artifact' }, ...(Array.isArray(task.input_artifact_refs) ? task.input_artifact_refs.map((artifact_id) => ({ artifact_id: String(artifact_id), content_sha256: String(artifact_id), kind: 'artifact' as const })) : [])], created_at: now.toISOString(), expires_at: new Date(now.getTime() + 50 * 60 * 1000).toISOString() });
      const result = await transport.send({ session_id: session.session_id, envelope });
      return { status: 'ok', value: { schema: 'zj-loop.opn_mcp_agent_task_send.v1', status: result.status, message_id: envelope.message_id, task_id: envelope.task_id, task_artifact_id: artifact.metadata.artifact_id, envelope_digest: envelope.envelope_digest, side_effects_executed: false } };
    } finally { await transport.closeSession({ session_id: session.session_id }); }
  } catch (error) { return blocked(error); }
}
