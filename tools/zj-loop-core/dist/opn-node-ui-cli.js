#!/usr/bin/env node
import { createHash, X509Certificate } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOpnArtifactStore } from './opn-artifact-store.js';
import { createTlsOpnArtifactDownloader, createTlsOpnArtifactPublisher } from './opn-artifact-client.js';
import { createTlsTransportAdapter } from './tls-transport-adapter.js';
import { createTransportEnvelope } from './transport-contract.js';
import { createSqliteStateStore } from './sqlite-state-store.js';
import { appendInboundTaskDecision, listInboundTasks } from './opn-inbound-task.js';
import { runCli } from './cli.js';
const UI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../ui/opn');
function json(response, status, value) {
    const body = JSON.stringify(value);
    response.statusCode = status;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(body);
}
async function body(request) {
    const chunks = [];
    for await (const chunk of request)
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error('object-required');
        return value;
    }
    catch {
        throw new Error('opn-node-ui-json-invalid');
    }
}
function digest(cert) { return createHash('sha256').update(new X509Certificate(cert).raw).digest('hex'); }
async function loadConfig(options) {
    const nodeDir = String(options.node_dir ?? '').trim();
    const required = (name) => { const value = String(options[name] ?? '').trim(); if (!value)
        throw new Error(`opn-node-ui-${name}-required`); return value; };
    if (!nodeDir)
        throw new Error('opn-node-ui-node-dir-required');
    const readSibling = async (name) => readFile(path.join(nodeDir, name), 'utf8');
    const cert = await readSibling('agent.cert.pem');
    return {
        network_id: required('network_id'),
        node_id: String(options.node_id ?? '').trim() || digest(cert),
        endpoint: required('endpoint'),
        ca: await readSibling('ca.cert.pem'),
        cert,
        key: await readSibling('agent.key.pem'),
        token: (await readSibling('join-session.json.credential-token')).trim(),
        artifact_store: String(options.artifact_store ?? path.join(nodeDir, 'artifacts')).trim(),
        state_store: String(options.state_store ?? path.join(nodeDir, 'state.db')).trim(),
    };
}
function createNodeUiServer(input) {
    const readOutbox = async () => { try {
        return JSON.parse(await readFile(input.outbox_path, 'utf8'));
    }
    catch {
        return [];
    } };
    const writeOutbox = async (entry) => { const entries = await readOutbox(); entries.push(entry); await writeFile(input.outbox_path, JSON.stringify(entries), { mode: 0o600 }); };
    const withSession = async (fn) => { const session = await input.transport.openSession({ network_id: input.config.network_id, node_id: input.config.node_id }); try {
        return await fn(session.session_id);
    }
    finally {
        await input.transport.closeSession({ session_id: session.session_id });
    } };
    return createServer(async (request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        try {
            if (request.method === 'GET' && url.pathname === '/') {
                response.setHeader('content-type', 'text/html; charset=utf-8');
                response.end(await readFile(path.join(UI_ROOT, 'index.html')));
                return;
            }
            if (request.method === 'GET' && url.pathname.startsWith('/assets/')) {
                const file = url.pathname.slice('/assets/'.length);
                if (!/^[a-z0-9-]+\.\w+$/.test(file))
                    return json(response, 404, { status: 'blocked', reason: 'asset-not-found' });
                response.end(await readFile(path.join(UI_ROOT, file)));
                return;
            }
            if (request.method === 'GET' && url.pathname === '/healthz')
                return json(response, 200, { status: 'ok', schema: 'zj-loop.opn_node_ui_health.v1' });
            if (request.method === 'GET' && url.pathname === '/ui/connection') {
                await withSession(async () => undefined);
                return json(response, 200, { schema: 'zj-loop.opn_connection_read_model.v1', network_id: input.config.network_id, status: 'connected', local_node: { node_id: input.config.node_id, display_name: 'OPN Node', agent_kind: 'agent', agent_version: 'dev' }, peers: [], side_effects_executed: false });
            }
            if (request.method === 'GET' && url.pathname === '/ui/inbox') {
                const envelope = await withSession((session_id) => input.transport.receive({ session_id }));
                const messages = envelope ? [{ ...envelope, delivery_state: 'offered' }] : [];
                if (envelope?.artifact_refs[0]) {
                    try {
                        messages[0].message = JSON.parse((await input.downloader.download(envelope.artifact_refs[0].artifact_id)).toString('utf8'));
                    }
                    catch {
                        messages[0].message = null;
                    }
                }
                return json(response, 200, { schema: 'zj-loop.opn_node_ui_inbox.v1', network_id: input.config.network_id, messages, side_effects_executed: false });
            }
            if (request.method === 'GET' && url.pathname === '/ui/inbound-tasks') {
                if (!input.stateStore)
                    return json(response, 503, { schema: 'zj-loop.opn_node_ui.v1', status: 'blocked', reason: 'inbound-task-read-model-unavailable', side_effects_executed: false });
                const tasks = await listInboundTasks({ stateStore: input.stateStore, network_id: input.config.network_id });
                return json(response, 200, { schema: 'zj-loop.opn_node_ui_inbound_tasks.v1', network_id: input.config.network_id, tasks, side_effects_executed: false });
            }
            const inboundDecision = request.method === 'POST' ? url.pathname.match(/^\/ui\/inbound-tasks\/([^/]+)\/decision$/) : null;
            if (inboundDecision) {
                if (!input.stateStore)
                    return json(response, 503, { schema: 'zj-loop.opn_node_ui.v1', status: 'blocked', reason: 'inbound-task-decision-unavailable', side_effects_executed: false });
                const value = await body(request);
                const inboundId = decodeURIComponent(inboundDecision[1]);
                const tasks = await listInboundTasks({ stateStore: input.stateStore, network_id: input.config.network_id });
                const inbound = tasks.find((task) => task.inbound_id === inboundId);
                const requestDigest = String(value.envelope_digest ?? '').trim();
                const decision = value.decision === 'approved' || value.decision === 'rejected' ? value.decision : '';
                const humanId = String(value.human_id ?? '').trim();
                const humanNote = String(value.human_note ?? '').trim();
                const selectedAgentId = String(value.selected_agent_id ?? '').trim();
                if (!inbound || inbound.envelope.envelope_digest !== requestDigest)
                    return json(response, 409, { schema: 'zj-loop.opn_node_ui.v1', status: 'blocked', reason: 'inbound-task-state-conflict', side_effects_executed: false });
                if (!decision || !humanId || !humanNote || (decision === 'approved' && !selectedAgentId))
                    return json(response, 400, { schema: 'zj-loop.opn_node_ui.v1', status: 'blocked', reason: 'inbound-task-decision-input-invalid', side_effects_executed: false });
                const result = await appendInboundTaskDecision({ stateStore: input.stateStore, inbound, decision, human_id: humanId, human_note: humanNote, ...(selectedAgentId ? { selected_agent_id: selectedAgentId } : {}) });
                return json(response, 201, { schema: 'zj-loop.opn_node_ui_inbound_task_decision.v1', status: result.status, inbound: result.inbound, side_effects_executed: false });
            }
            if (request.method === 'GET' && url.pathname === '/ui/outbox')
                return json(response, 200, { schema: 'zj-loop.opn_node_ui_outbox.v1', network_id: input.config.network_id, messages: await readOutbox(), side_effects_executed: false });
            if (request.method === 'POST' && url.pathname === '/ui/messages') {
                const value = await body(request);
                const target = String(value.target_node_id ?? '').trim();
                const message = String(value.message ?? '').trim();
                if (!target || !message)
                    throw new Error('opn-node-ui-message-required');
                const messageId = String(value.message_id ?? `opn-ui-message-${Date.now()}`);
                const bytes = Buffer.from(JSON.stringify({ schema: 'zj-loop.opn_node_ui_message.v1', message, sent_at: new Date().toISOString(), sender_node_id: input.config.node_id }));
                const artifact = await input.artifacts.put({ bytes, file_name: `${messageId}.json`, media_type: 'application/json' });
                await input.publisher.publish({ bytes, metadata: artifact.metadata, transfer_id: `opn-ui:${messageId}`, target_node_id: target });
                const now = new Date();
                const envelope = createTransportEnvelope({ message_id: messageId, network_id: input.config.network_id, event_id: `opn-ui-event-${Date.now()}`, plan_id: 'opn-node-ui', plan_revision: 1, task_id: 'opn-ui-message', from_node_id: input.config.node_id, target_node_id: target, notification_kind: String(value.notification_kind ?? 'mcp.message'), state: 'available', artifact_refs: [{ artifact_id: artifact.metadata.artifact_id, content_sha256: artifact.metadata.content_sha256, kind: 'artifact' }], created_at: now.toISOString(), expires_at: new Date(now.getTime() + 50 * 60 * 1000).toISOString() });
                const result = await withSession((session_id) => input.transport.send({ session_id, envelope }));
                await writeOutbox({ ...envelope, delivery_state: result.status });
                return json(response, 200, { schema: 'zj-loop.opn_node_ui_message.v1', ...result, message_id: messageId, envelope_digest: envelope.envelope_digest, side_effects_executed: false });
            }
            return json(response, 404, { status: 'blocked', reason: 'route-not-found' });
        }
        catch (error) {
            return json(response, 503, { schema: 'zj-loop.opn_node_ui.v1', status: 'blocked', reason: error instanceof Error ? error.message : 'opn-node-ui-failed', side_effects_executed: false });
        }
    });
}
process.exitCode = await runCli({
    name: 'zj-loop-opn-node-ui', description: 'Run a cross-platform local OPN node Web Gateway.', usage: 'zj-loop-opn-node-ui start ...',
    options: [
        { name: 'command', type: 'positional', description: 'start', default: 'start' },
        { name: 'node_dir', flag: 'node-dir', type: 'string', description: 'OPN node directory' },
        { name: 'network_id', flag: 'network-id', type: 'string', description: 'OPN network id' },
        { name: 'endpoint', type: 'string', description: 'OPN HTTPS endpoint' },
        { name: 'node_id', flag: 'node-id', type: 'string', description: 'Optional node id derived from certificate when omitted' },
        { name: 'artifact_store', flag: 'artifact-store', type: 'string', description: 'Local artifact store' },
        { name: 'state_store', flag: 'state-store', type: 'string', description: 'Local StateStore database for read-only inbound task projection' },
        { name: 'port', type: 'string', description: 'Local browser port' },
    ],
    async handler({ options, io }) {
        if (String(options.command ?? 'start') !== 'start')
            throw new Error('unsupported-opn-node-ui-command');
        const config = await loadConfig(options);
        const transport = createTlsTransportAdapter({ endpoint: config.endpoint, ca: config.ca, cert: config.cert, key: config.key, bearer_token: config.token });
        const downloader = createTlsOpnArtifactDownloader({ endpoint: config.endpoint, ca: config.ca, cert: config.cert, key: config.key, bearer_token: config.token });
        const publisher = createTlsOpnArtifactPublisher({ endpoint: config.endpoint, ca: config.ca, cert: config.cert, key: config.key, bearer_token: config.token });
        const artifacts = createOpnArtifactStore({ root: config.artifact_store });
        const stateStore = createSqliteStateStore({ filename: config.state_store });
        const server = createNodeUiServer({ config, transport, downloader, publisher, artifacts, stateStore, outbox_path: path.join(String(options.node_dir), 'outbox.json') });
        const port = Number(options.port ?? 0);
        await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string')
            throw new Error('opn-node-ui-address-unavailable');
        io.stdout(JSON.stringify({ schema: 'zj-loop.opn_node_ui.v1', status: 'listening', url: `http://127.0.0.1:${address.port}/`, network_id: config.network_id, node_id: config.node_id, side_effects_executed: false }));
        await new Promise((resolve) => { const close = () => { server.close(() => { void stateStore.close().then(resolve); }); }; process.once('SIGINT', close); process.once('SIGTERM', close); });
    },
});
