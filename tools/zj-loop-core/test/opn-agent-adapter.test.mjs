import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createBoundedLoopTask } from '../dist/agent-task.js';
import { createNativeAgentRuntime } from '../dist/native-agent-runtime.js';
import { createAgentRegistration } from '../dist/agent-registration.js';
import { createOpnAgentAdapter } from '../dist/opn-agent-adapter.js';
import { createOpnArtifactStore } from '../dist/opn-artifact-store.js';
import { createLocalOpnTransportAdapter } from '../dist/opn-center-transport.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createTransportEnvelope } from '../dist/transport-contract.js';

const digest = (digit) => `sha256:${digit.repeat(64)}`;

test('OPN Agent adapter consumes a task, emits a structured result artifact, and acknowledges only after sending result', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-opn-agent-adapter-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-07T12:00:00.000Z' });
    const center = 'endpoint:network-1';
    const agent = 'agent-1';
    const transport = createLocalOpnTransportAdapter({ stateStore, network_id: 'network-1', node_id: agent, now: () => '2026-08-07T12:01:00.000Z' });
    const centerTransport = createLocalOpnTransportAdapter({ stateStore, network_id: 'network-1', node_id: center, now: () => '2026-08-07T12:01:00.000Z' });
    const centerSession = await centerTransport.openSession({ network_id: 'network-1', node_id: center });
    const agentSession = await transport.openSession({ network_id: 'network-1', node_id: agent });
    const task = createBoundedLoopTask({ task_id: 'task-1', execution_id: 'execution-1', attempt: 1, task_kind: 'loop.task', objective: 'read artifact', success_criteria: ['result exists'], input_artifact_refs: [digest('a')], dependency_refs: [], resource_isolation: { status: 'not-applicable', bindings: [] }, budget: { timeout_ms: 30000, max_iterations: 1 }, expected_evidence_kinds: ['result'], idempotency_key: 'task-1:execution-1:1', cancellation: { mode: 'cooperative', token: 'cancel:execution-1' } });
    const envelope = createTransportEnvelope({ message_id: 'task-message-1', network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 1, task_id: task.task_id, from_node_id: center, target_node_id: agent, notification_kind: 'agent.task', state: 'available', artifact_refs: [{ artifact_id: digest('a'), content_sha256: digest('a'), kind: 'artifact' }], created_at: '2026-08-07T12:01:00.000Z', expires_at: '2026-08-07T13:01:00.000Z' });
    await centerTransport.send({ session_id: centerSession.session_id, envelope });
    const runtime = createNativeAgentRuntime({ stateStore, registration: createAgentRegistration({ agent_id: agent, display_name: 'Agent1', capabilities: ['task.execute'], accepted_task_kinds: ['loop.task'], evidence_kinds: ['result'], protocol_version: 'opn-agent-runtime.v1', identity_ref: 'identity:agent-1' }), executor: async () => ({ status: 'succeeded', evidence_refs: ['evidence:agent-1'] }) });
    const adapter = createOpnAgentAdapter({ transport, runtime, artifactStore: createOpnArtifactStore({ root: path.join(root, 'artifacts') }), agent_id: agent, now: () => '2026-08-07T12:01:01.000Z' });
    const processed = await adapter.processNext({ session_id: agentSession.session_id, resolveTask: () => task });
    assert.equal(processed.status, 'processed');
    assert.equal(processed.result.execution.status, 'evidence-recorded');
    const resultEnvelope = await centerTransport.receive({ session_id: centerSession.session_id });
    assert.equal(resultEnvelope.notification_kind, 'agent.result');
    assert.equal(resultEnvelope.target_node_id, center);
    assert.equal((await transport.receive({ session_id: agentSession.session_id })), null);
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});
