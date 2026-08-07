#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { request as httpsRequest } from 'node:https';
import { runCli, defaultCliIo } from './cli.js';
import { createLocalOpnTransportAdapter } from './opn-center-transport.js';
import { createOpnArtifactStore } from './opn-artifact-store.js';
import { validateBoundedLoopTask } from './agent-task.js';
import { recordLocalOpnArtifactTransfer } from './opn-artifact-transfer-http-server.js';
import { createTlsTransportAdapter } from './tls-transport-adapter.js';
import { createSqliteStateStore } from './sqlite-state-store.js';
import { createTransportEnvelope } from './transport-contract.js';
const digest = 'sha256:' + '0'.repeat(64);
const ARTIFACT_SCHEMA = 'zj-loop.opn_artifact.v1';
async function textFile(path, error) {
    if (!path.trim())
        throw new Error(error);
    return readFile(path, 'utf8');
}
async function artifactRequest(input) {
    const endpoint = new URL(input.endpoint);
    const payload = input.body;
    const options = { protocol: 'https:', hostname: endpoint.hostname, port: endpoint.port || 443, method: input.method, path: `${endpoint.pathname.replace(/\/$/, '')}${input.pathname}`, ca: input.ca, cert: input.cert, key: input.key, rejectUnauthorized: true, minVersion: 'TLSv1.3', headers: { authorization: `Bearer ${input.bearer_token}`, ...(payload ? { 'content-length': payload.byteLength } : {}), ...input.headers } };
    return new Promise((resolve, reject) => {
        const req = httpsRequest(options, (response) => { const chunks = []; response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))); response.on('end', () => resolve({ statusCode: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) })); });
        req.on('error', reject);
        if (payload)
            req.write(payload);
        req.end();
    });
}
function parsedArtifactResponse(response) {
    try {
        return JSON.parse(response.body.toString('utf8'));
    }
    catch {
        throw new Error(`opn-artifact-http-${response.statusCode}`);
    }
}
function nodeId(options, session) {
    const value = typeof options.node_id === 'string' && options.node_id.trim() ? options.node_id : typeof session?.node_id === 'string' ? session.node_id : '';
    if (!value.trim())
        throw new Error('opn-transport-node-id-required');
    return value;
}
function messageEnvelope(options, from_node_id) {
    const now = new Date();
    const value = (name, fallback) => typeof options[name] === 'string' && options[name] ? options[name] : fallback;
    const target = value('target_node_id', '');
    if (!target.trim())
        throw new Error('opn-transport-target-node-id-required');
    const revision = Number(value('plan_revision', '1'));
    if (!Number.isInteger(revision) || revision < 0)
        throw new Error('opn-transport-plan-revision-invalid');
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
export const opnTransportCliSpec = {
    name: 'zj-loop-opn-transport',
    description: 'Send and receive provider-neutral OPN transport envelopes.',
    usage: 'zj-loop-opn-transport [receive|send|local-send|artifact-send|artifact-download] ...',
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
        { name: 'file', type: 'string', description: 'Local file for artifact-send' },
        { name: 'output', type: 'string', description: 'Local output path for artifact-download' },
        { name: 'artifact_id', flag: 'artifact-id', type: 'string', description: 'Content digest for artifact-download' },
        { name: 'transfer_id', flag: 'transfer-id', type: 'string', description: 'Transfer id for artifact-send' },
        { name: 'artifact_store', flag: 'artifact-store', type: 'string', description: 'Local content-addressed ArtifactStore directory' },
        { name: 'task_file', flag: 'task-file', type: 'string', description: 'Bounded Loop task JSON for local-task-send' },
    ],
    async handler({ options, io }) {
        const command = String(options.command ?? 'receive');
        const network_id = String(options.network_id ?? '').trim();
        if (!network_id)
            throw new Error('opn-transport-network-id-required');
        let sessionValue;
        if (typeof options.session_file === 'string' && options.session_file.trim())
            sessionValue = JSON.parse(await textFile(options.session_file, 'opn-transport-session-file-required'));
        const localNodeId = nodeId(options, sessionValue);
        if (command === 'local-task-send') {
            const stateStore = createSqliteStateStore({ filename: String(options.state_store ?? '') });
            try {
                const taskPath = String(options.task_file ?? '').trim();
                const artifactRoot = String(options.artifact_store ?? '').trim();
                if (!taskPath || !artifactRoot)
                    throw new Error('opn-task-file-and-artifact-store-required');
                const task = JSON.parse(await readFile(taskPath, 'utf8'));
                const validation = validateBoundedLoopTask(task);
                if (validation.status !== 'valid')
                    throw new Error(validation.reason);
                const bytes = await readFile(taskPath);
                const artifact = await recordLocalOpnArtifactTransfer({ network_id, stateStore, artifactStore: createOpnArtifactStore({ root: artifactRoot }), bytes, file_name: `${task.task_id}.json`, media_type: 'application/json', transfer_id: `task-artifact:${String(options.message_id ?? `agent-task-${Date.now()}`)}`, sender_node_id: localNodeId, target_node_id: String(options.target_node_id ?? '') });
                const adapter = createLocalOpnTransportAdapter({ stateStore, network_id, node_id: localNodeId });
                const session = await adapter.openSession({ network_id, node_id: localNodeId });
                const envelope = createTransportEnvelope({ message_id: String(options.message_id ?? `agent-task-${Date.now()}`), network_id, event_id: String(options.event_id ?? `agent-event-${Date.now()}`), plan_id: String(options.plan_id ?? 'opn-agent-task'), plan_revision: Number(options.plan_revision ?? 1), task_id: task.task_id, from_node_id: localNodeId, target_node_id: String(options.target_node_id ?? ''), notification_kind: 'agent.task', state: 'available', artifact_refs: [{ artifact_id: artifact.metadata.artifact_id, content_sha256: artifact.metadata.content_sha256, kind: 'artifact' }, ...task.input_artifact_refs.map((artifact_id) => ({ artifact_id, content_sha256: artifact_id, kind: 'artifact' }))], created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 50 * 60 * 1000).toISOString() });
                const result = await adapter.send({ session_id: session.session_id, envelope });
                await adapter.closeSession({ session_id: session.session_id });
                io.stdout(JSON.stringify({ schema: 'zj-loop.opn_transport_cli.v1', status: result.status === 'duplicate' ? 'duplicate' : 'sent', message_id: envelope.message_id, task_id: task.task_id, task_artifact_id: artifact.metadata.artifact_id, target_node_id: envelope.target_node_id, side_effects_executed: false }));
                return;
            }
            finally {
                await stateStore.close();
            }
        }
        if (command === 'artifact-send' || command === 'artifact-download') {
            const endpoint = String(options.endpoint ?? '').trim();
            const ca = await textFile(String(options.ca ?? ''), 'opn-artifact-ca-required');
            const cert = await textFile(String(options.cert ?? ''), 'opn-artifact-client-cert-required');
            const key = await textFile(String(options.key ?? ''), 'opn-artifact-client-key-required');
            const bearer_token = (await textFile(String(options.credential_token_file ?? ''), 'opn-artifact-credential-token-required')).trim();
            if (command === 'artifact-send') {
                const file = String(options.file ?? '').trim();
                if (!file)
                    throw new Error('opn-artifact-file-required');
                const bytes = await readFile(file);
                const artifact_id = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
                const file_name = file.split(/[\\/]/).pop() ?? 'artifact.bin';
                const transfer_id = String(options.transfer_id ?? `transfer-${Date.now()}`);
                const metadata = { schema: ARTIFACT_SCHEMA, artifact_id, content_sha256: artifact_id, size_bytes: bytes.byteLength, file_name, media_type: 'application/octet-stream' };
                const offered = await artifactRequest({ endpoint, ca, cert, key, bearer_token, method: 'POST', pathname: '/v1/artifacts', body: Buffer.from(JSON.stringify({ transfer_id, target_node_id: String(options.target_node_id ?? ''), metadata })), headers: { 'content-type': 'application/json' } });
                if (offered.statusCode !== 200 && offered.statusCode !== 202)
                    throw new Error(String(parsedArtifactResponse(offered).reason ?? 'opn-artifact-offer-failed'));
                const uploaded = await artifactRequest({ endpoint, ca, cert, key, bearer_token, method: 'PUT', pathname: `/v1/artifacts/${encodeURIComponent(artifact_id)}`, body: bytes });
                if (uploaded.statusCode !== 200 && uploaded.statusCode !== 201)
                    throw new Error(String(parsedArtifactResponse(uploaded).reason ?? 'opn-artifact-upload-failed'));
                io.stdout(JSON.stringify({ schema: 'zj-loop.opn_transport_cli.v1', status: 'verified', transfer_id, artifact_id, size_bytes: bytes.byteLength, side_effects_executed: false }));
                return;
            }
            const artifact_id = String(options.artifact_id ?? '').trim();
            const output = String(options.output ?? '').trim();
            const artifact_store = String(options.artifact_store ?? '').trim();
            if (!/^sha256:[0-9a-f]{64}$/.test(artifact_id))
                throw new Error('opn-artifact-id-required');
            if (!artifact_store)
                throw new Error('opn-artifact-store-required');
            const downloaded = await artifactRequest({ endpoint, ca, cert, key, bearer_token, method: 'GET', pathname: `/v1/artifacts/${encodeURIComponent(artifact_id)}` });
            if (downloaded.statusCode !== 200)
                throw new Error(String(parsedArtifactResponse(downloaded).reason ?? 'opn-artifact-download-failed'));
            const actual = `sha256:${createHash('sha256').update(downloaded.body).digest('hex')}`;
            if (actual !== artifact_id)
                throw new Error('opn-artifact-download-integrity-failed');
            const store = createOpnArtifactStore({ root: artifact_store });
            const stored = await store.put({ bytes: downloaded.body, file_name: output.split(/[\\/]/).pop() || 'artifact.bin', media_type: typeof downloaded.headers['content-type'] === 'string' ? downloaded.headers['content-type'] : 'application/octet-stream', expected_digest: artifact_id });
            if (output)
                await writeFile(output, downloaded.body, { flag: 'wx' });
            io.stdout(JSON.stringify({ schema: 'zj-loop.opn_transport_cli.v1', status: 'verified', artifact_id, size_bytes: downloaded.body.byteLength, artifact_store, ...(output ? { output } : {}), store_status: stored.status, side_effects_executed: false }));
            return;
        }
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
            }
            finally {
                await stateStore.close();
            }
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
            if (command !== 'send')
                throw new Error('opn-transport-command-invalid');
            const envelope = messageEnvelope(options, localNodeId);
            const result = await adapter.send({ session_id: session.session_id, envelope });
            io.stdout(JSON.stringify({ schema: 'zj-loop.opn_transport_cli.v1', status: result.status === 'duplicate' ? 'duplicate' : 'sent', message_id: envelope.message_id, envelope_digest: envelope.envelope_digest, session_id: session.session_id, reconnected: true, side_effects_executed: false }));
        }
        finally {
            await adapter.closeSession({ session_id: session.session_id });
        }
    },
};
export async function runOpnTransportCli(argv = process.argv.slice(2), io = defaultCliIo) {
    return runCli(opnTransportCliSpec, argv, io);
}
if (process.argv[1]?.endsWith('opn-transport-cli.js'))
    process.exitCode = await runOpnTransportCli();
