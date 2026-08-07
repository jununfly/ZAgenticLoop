#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { runCli } from './cli.js';
import { createCodexAgentProviderAdapter } from './codex-agent-provider-adapter.js';
import { createWorkBuddyCodeProviderAdapter } from './workbuddy-code-provider-adapter.js';
import { createLocalProcessAdapter } from './local-process-adapter.js';
import { createTlsTransportAdapter } from './tls-transport-adapter.js';
import { createSqliteStateStore } from './sqlite-state-store.js';
import { createOpnArtifactStore } from './opn-artifact-store.js';
import { createNativeAgentRuntime } from './native-agent-runtime.js';
import { createAgentRegistration } from './agent-registration.js';
import { createOpnAgentAdapter, createProviderBackedNativeAgentExecutor } from './opn-agent-adapter.js';
import { createTlsOpnArtifactDownloader, createTlsOpnArtifactPublisher } from './opn-artifact-client.js';
import { discoverProviderExecutable } from './provider-executable-discovery.js';
import { createBoundedLoopTask } from './agent-task.js';
export function createRetryBoundedLoopTask(task) {
    const { schema: _schema, task_digest: _task_digest, execution_id: _execution_id, attempt: _attempt, idempotency_key: _idempotency_key, ...definition } = task;
    return createBoundedLoopTask({ ...definition, execution_id: `retry-${randomUUID()}`, attempt: task.attempt + 1, idempotency_key: `${task.idempotency_key}:retry:${randomUUID()}` });
}
const spec = {
    name: 'zj-loop-opn-agent-runner',
    description: 'Consume one OPN task and execute it with a local Codex or WorkBuddy provider.',
    usage: 'zj-loop-opn-agent-runner run ...',
    options: [
        { name: 'command', type: 'positional', description: 'run' },
        { name: 'endpoint', type: 'string', description: 'OPN HTTPS endpoint' },
        { name: 'network_id', flag: 'network-id', type: 'string', description: 'OPN network id' },
        { name: 'node_id', flag: 'node-id', type: 'string', description: 'Agent node id' },
        { name: 'ca', type: 'string', description: 'CA PEM path' },
        { name: 'cert', type: 'string', description: 'Agent certificate PEM path' },
        { name: 'key', type: 'string', description: 'Agent key PEM path' },
        { name: 'credential_token_file', flag: 'credential-token-file', type: 'string', description: 'Credential token path' },
        { name: 'task_file', flag: 'task-file', type: 'string', description: 'Local task JSON path' },
        { name: 'artifact_store', flag: 'artifact-store', type: 'string', description: 'Local ArtifactStore directory' },
        { name: 'provider', type: 'string', description: 'codex or workbuddy-code' },
        { name: 'executable', type: 'string', description: 'Optional provider executable path; otherwise auto-discover' },
        { name: 'cwd', type: 'string', description: 'Provider working directory' },
        { name: 'session_id', flag: 'session-id', type: 'string', description: 'WorkBuddy session id' },
        { name: 'retry_failed', flag: 'retry-failed', type: 'boolean', description: 'Create a new execution attempt only after the persisted execution failed' },
    ],
    async handler({ options, io }) {
        if (String(options.command ?? '') !== 'run')
            throw new Error('opn-agent-runner-command-invalid');
        const read = async (name, error) => { const value = String(options[name] ?? '').trim(); if (!value)
            throw new Error(error); return readFile(value, 'utf8'); };
        const network_id = String(options.network_id ?? '').trim();
        const node_id = String(options.node_id ?? '').trim();
        let task = JSON.parse(await read('task_file', 'opn-agent-runner-task-required'));
        const providerKind = String(options.provider ?? '').trim();
        if (providerKind !== 'codex' && providerKind !== 'workbuddy-code')
            throw new Error('opn-agent-runner-provider-invalid');
        const processAdapter = createLocalProcessAdapter();
        const discovery = await discoverProviderExecutable({ provider: providerKind, explicit: String(options.executable ?? '') });
        if (discovery.status !== 'found' || !discovery.executable) {
            throw new Error(`opn-agent-provider-executable-unavailable:${JSON.stringify(discovery)}`);
        }
        const executable = discovery.executable;
        const provider = providerKind === 'codex'
            ? createCodexAgentProviderAdapter({ process_adapter: processAdapter, executable })
            : createWorkBuddyCodeProviderAdapter({ process_adapter: processAdapter, executable, session_id: String(options.session_id ?? '').trim() });
        const stateStore = createSqliteStateStore({ filename: String(options.artifact_store ?? '').trim() + '.runner-state.db' });
        try {
            await stateStore.createNetwork({ network_id, owner_id: 'human-1' });
            let retry_of_execution_id;
            if (options.retry_failed === true) {
                const persisted = await stateStore.readEvents({ network_id, aggregate_type: 'native-agent-execution', aggregate_id: task.execution_id });
                const last = persisted.events.at(-1)?.payload;
                if (last?.execution?.status !== 'failed')
                    throw new Error('opn-agent-retry-requires-failed-execution');
                retry_of_execution_id = task.execution_id;
                task = createRetryBoundedLoopTask(task);
            }
            const ca = await read('ca', 'opn-agent-runner-ca-required');
            const cert = await read('cert', 'opn-agent-runner-cert-required');
            const key = await read('key', 'opn-agent-runner-key-required');
            const bearer_token = (await read('credential_token_file', 'opn-agent-runner-token-required')).trim();
            const transport = createTlsTransportAdapter({ endpoint: String(options.endpoint ?? ''), ca, cert, key, bearer_token });
            const publisher = createTlsOpnArtifactPublisher({ endpoint: String(options.endpoint ?? ''), ca, cert, key, bearer_token });
            const downloader = createTlsOpnArtifactDownloader({ endpoint: String(options.endpoint ?? ''), ca, cert, key, bearer_token });
            const session = await transport.openSession({ network_id, node_id });
            try {
                const executor = createProviderBackedNativeAgentExecutor({ provider_kind: providerKind, provider, cwd: String(options.cwd ?? ''), prompt: (value) => value.objective });
                const runtime = createNativeAgentRuntime({ stateStore, registration: createAgentRegistration({ agent_id: node_id, display_name: providerKind, capabilities: ['task.execute'], accepted_task_kinds: [task.task_kind], evidence_kinds: task.expected_evidence_kinds, protocol_version: 'opn-agent-runtime.v1', identity_ref: `identity:${node_id}` }), executor });
                const artifactStore = createOpnArtifactStore({ root: String(options.artifact_store ?? '') });
                const adapter = createOpnAgentAdapter({ transport, runtime, artifactStore, publishArtifact: publisher.publish, agent_id: node_id });
                const result = await adapter.processNext({
                    session_id: session.session_id,
                    resolveTask: async (envelope) => {
                        const taskRef = envelope.artifact_refs[0];
                        if (!taskRef)
                            throw new Error('opn-agent-task-artifact-missing');
                        const bytes = await downloader.download(taskRef.artifact_id);
                        const stored = await artifactStore.put({ bytes, file_name: `${envelope.task_id}.task.json`, media_type: 'application/json', expected_digest: taskRef.artifact_id });
                        const remoteTask = JSON.parse(stored.metadata ? bytes.toString('utf8') : '{}');
                        if (remoteTask.task_id !== envelope.task_id)
                            throw new Error('opn-agent-task-id-mismatch');
                        return remoteTask;
                    },
                });
                io.stdout(JSON.stringify({ schema: 'zj-loop.opn_agent_runner.v1', ...(retry_of_execution_id ? { retry_of_execution_id, execution_id: task.execution_id } : {}), ...result }));
            }
            finally {
                await transport.closeSession({ session_id: session.session_id });
            }
        }
        finally {
            await stateStore.close();
        }
    },
};
if (process.argv[1]?.endsWith('opn-agent-runner-cli.js'))
    process.exitCode = await runCli(spec);
