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

test('OPN Agent adapter acknowledges non-task traffic so it cannot starve the next agent task', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-opn-agent-adapter-head-of-line-'));
  const agent = 'agent-1';
  const task = createBoundedLoopTask({ task_id: 'task-2', execution_id: 'execution-2', attempt: 1, task_kind: 'loop.task', objective: 'read artifact', success_criteria: ['result exists'], input_artifact_refs: [digest('a')], dependency_refs: [], resource_isolation: { status: 'not-applicable', bindings: [] }, budget: { timeout_ms: 30000, max_iterations: 1 }, expected_evidence_kinds: ['result'], idempotency_key: 'task-2:execution-2:1', cancellation: { mode: 'cooperative', token: 'cancel:execution-2' } });
  const unknown = createTransportEnvelope({ message_id: 'mcp-message-1', network_id: 'network-1', event_id: 'mcp-event-1', plan_id: 'opn-mcp-gateway', plan_revision: 1, task_id: 'opn-mcp-message', from_node_id: 'agent-2', target_node_id: agent, notification_kind: 'mcp.dogfood.smoke', state: 'available', artifact_refs: [{ artifact_id: digest('b'), content_sha256: digest('b'), kind: 'artifact' }], created_at: '2026-08-10T00:00:00.000Z', expires_at: '2026-08-10T01:00:00.000Z' });
  const taskEnvelope = createTransportEnvelope({ message_id: 'task-message-2', network_id: 'network-1', event_id: 'task-event-2', plan_id: 'plan-1', plan_revision: 1, task_id: task.task_id, from_node_id: 'agent-2', target_node_id: agent, notification_kind: 'agent.task', state: 'available', artifact_refs: [{ artifact_id: digest('a'), content_sha256: digest('a'), kind: 'artifact' }], created_at: '2026-08-10T00:00:01.000Z', expires_at: '2026-08-10T01:00:01.000Z' });
  const queue = [unknown, taskEnvelope];
  const acknowledgements = [];
  try {
    const transport = {
      async receive() { return queue[0] ?? null; },
      async acknowledge(input) { acknowledgements.push(input.message_id); queue.shift(); return { status: 'accepted', message_id: input.message_id, envelope_digest: input.envelope_digest, side_effects_executed: false }; },
      async send() { return { status: 'accepted', message_id: 'agent-result:task-message-2', envelope_digest: digest('c'), side_effects_executed: false }; },
    };
    const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-10T00:00:00.000Z' });
    const runtime = createNativeAgentRuntime({ stateStore, registration: createAgentRegistration({ agent_id: agent, display_name: 'Agent1', capabilities: ['task.execute'], accepted_task_kinds: ['loop.task'], evidence_kinds: ['result'], protocol_version: 'opn-agent-runtime.v1', identity_ref: 'identity:agent-1' }), executor: async () => ({ status: 'succeeded', evidence_refs: ['evidence:agent-1'] }) });
    const adapter = createOpnAgentAdapter({ transport, runtime, artifactStore: createOpnArtifactStore({ root: path.join(root, 'artifacts') }), agent_id: agent, now: () => '2026-08-10T00:00:02.000Z' });
    const skipped = await adapter.processNext({ session_id: 'session-1', resolveTask: () => task });
    assert.deepEqual(skipped, { status: 'skipped', message_id: 'mcp-message-1', reason: 'opn-agent-non-task-envelope-acknowledged', side_effects_executed: false });
    assert.deepEqual(acknowledgements, ['mcp-message-1']);
    const processed = await adapter.processNext({ session_id: 'session-1', resolveTask: () => task });
    assert.equal(processed.status, 'processed');
    await stateStore.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('OPN Agent adapter persists worker session evidence in the result artifact', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'opn-agent-session-evidence-'));
  const store = createOpnArtifactStore({ root });
  const task = createBoundedLoopTask({ task_id: 'task-session-evidence', execution_id: 'execution-session-evidence', attempt: 1, task_kind: 'loop.task', objective: 'read artifact', success_criteria: ['result exists'], input_artifact_refs: [digest('a')], dependency_refs: [], resource_isolation: { status: 'not-applicable', bindings: [] }, budget: { timeout_ms: 30000, max_iterations: 1 }, expected_evidence_kinds: ['result'], idempotency_key: 'task-session-evidence:execution-session-evidence:1', cancellation: { mode: 'cooperative', token: 'cancel:execution-session-evidence' } });
  const envelope = createTransportEnvelope({ message_id: 'task-session-evidence-message', network_id: 'network-1', event_id: 'event-session-evidence', plan_id: 'plan-1', plan_revision: 1, task_id: task.task_id, from_node_id: 'center', target_node_id: 'agent-1', notification_kind: 'agent.task', state: 'available', artifact_refs: [{ artifact_id: digest('a'), content_sha256: digest('a'), kind: 'artifact' }], created_at: '2026-08-07T12:01:00.000Z', expires_at: '2026-08-07T13:01:00.000Z' });
  const sent = [];
  const adapter = createOpnAgentAdapter({
    transport: { async receive() { return envelope; }, async send(input) { sent.push(input); return { status: 'accepted', message_id: input.envelope.message_id, envelope_digest: input.envelope.envelope_digest, side_effects_executed: false }; }, async acknowledge() { return { status: 'accepted', message_id: envelope.message_id, envelope_digest: envelope.envelope_digest, side_effects_executed: false }; } },
    runtime: { async acceptEnvelope() { return { status: 'accepted', execution: { schema: 'zj-loop.native_agent_execution.v1', execution_id: task.execution_id, task_id: task.task_id, attempt: 1, agent_id: 'agent-1', task_digest: task.task_digest, registration_digest: digest('r'), started_at: '2026-08-07T12:01:00.000Z', status: 'evidence-recorded', evidence_refs: ['provider-result'], transitions: [] }, side_effects_executed: false }; } },
    artifactStore: store,
    agent_id: 'agent-1',
    now: () => '2026-08-07T12:01:01.000Z',
  });
  await adapter.processNext({ session_id: 'session-2', session_evidence: { session_id: 'session-2', expires_at: '2026-08-10T15:00:00.000Z', refreshed: true, refresh_count: 1 }, resolveTask: () => task });
  const artifact = sent[0].envelope.artifact_refs[0].artifact_id;
  const stored = await store.read(artifact);
  assert.deepEqual(JSON.parse(stored.bytes.toString('utf8')).session_evidence, { session_id: 'session-2', expires_at: '2026-08-10T15:00:00.000Z', refreshed: true, refresh_count: 1 });
});

test('OPN Agent adapter does not execute or acknowledge supervised work before Human approval', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'opn-supervised-inbound-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const task = createBoundedLoopTask({ task_id: 'task-supervised', execution_id: 'execution-supervised', attempt: 1, task_kind: 'loop.task', objective: 'inspect input', success_criteria: ['result exists'], input_artifact_refs: [digest('a')], dependency_refs: [], resource_isolation: { status: 'not-applicable', bindings: [] }, budget: { timeout_ms: 30000, max_iterations: 1 }, expected_evidence_kinds: ['result'], idempotency_key: 'task-supervised:1', cancellation: { mode: 'cooperative', token: 'cancel:supervised' } });
  const envelope = createTransportEnvelope({ message_id: 'task-supervised-message', network_id: 'network-1', event_id: 'event-supervised', plan_id: 'plan-1', plan_revision: 1, task_id: task.task_id, from_node_id: 'center', target_node_id: 'agent-1', notification_kind: 'agent.task', state: 'available', artifact_refs: [{ artifact_id: digest('a'), content_sha256: digest('a'), kind: 'artifact' }], created_at: '2099-08-07T12:01:00.000Z', expires_at: '2099-08-07T13:01:00.000Z' });
  let executed = false;
  const acknowledgements = [];
  const adapter = createOpnAgentAdapter({
    transport: { async receive() { return envelope; }, async send() { throw new Error('must-not-send'); }, async acknowledge(input) { acknowledgements.push(input.message_id); return { status: 'accepted', message_id: envelope.message_id, envelope_digest: envelope.envelope_digest, side_effects_executed: false }; } },
    runtime: { async acceptEnvelope() { executed = true; throw new Error('must-not-execute'); } },
    artifactStore: createOpnArtifactStore({ root: await mkdtemp(path.join(os.tmpdir(), 'opn-supervised-artifact-')) }),
    stateStore,
    agent_id: 'agent-1',
    registration: createAgentRegistration({ agent_id: 'agent-1', display_name: 'Agent1', capabilities: ['task.execute'], accepted_task_kinds: ['agent.task'], evidence_kinds: ['result'], protocol_version: 'opn-agent-runtime.v1', identity_ref: 'identity:agent-1' }),
    supervision_mode: 'supervised',
    now: () => '2099-08-07T12:01:01.000Z',
  });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2099-08-07T12:00:00.000Z' });
    const result = await adapter.processNext({ session_id: 'session-supervised', resolveTask: () => task });
    assert.deepEqual(result, { status: 'blocked', message_id: envelope.message_id, reason: 'pending-human-approval', side_effects_executed: false });
    assert.equal(executed, false);
    assert.deepEqual(acknowledgements, [envelope.message_id]);
    const events = await stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'opn-inbound-task' });
    assert.equal(events.events.length, 1);
    assert.equal(events.events[0].payload.inbound.inbound_id, `inbound-task:${envelope.message_id}`);
    const duplicate = await adapter.processNext({ session_id: 'session-supervised', resolveTask: () => task });
    assert.deepEqual(duplicate, { status: 'blocked', message_id: envelope.message_id, reason: 'pending-human-approval', side_effects_executed: false });
    assert.deepEqual(acknowledgements, [envelope.message_id, envelope.message_id]);
    assert.equal((await stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'opn-inbound-task' })).events.length, 1);
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('OPN Agent adapter consumes an admitted local inbound task without remote re-delivery', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'opn-admitted-inbound-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const task = createBoundedLoopTask({ task_id: 'task-admitted', execution_id: 'execution-admitted', attempt: 1, task_kind: 'loop.task', objective: 'execute admitted task', success_criteria: ['result exists'], input_artifact_refs: [digest('a')], dependency_refs: [], resource_isolation: { status: 'not-applicable', bindings: [] }, budget: { timeout_ms: 30000, max_iterations: 1 }, expected_evidence_kinds: ['result'], idempotency_key: 'task-admitted:1', cancellation: { mode: 'cooperative', token: 'cancel:admitted' } });
  const envelope = createTransportEnvelope({ message_id: 'task-admitted-message', network_id: 'network-admitted', event_id: 'event-admitted', plan_id: 'plan-1', plan_revision: 1, task_id: task.task_id, from_node_id: 'center', target_node_id: 'agent-admitted', notification_kind: 'agent.task', state: 'available', artifact_refs: [{ artifact_id: digest('a'), content_sha256: digest('a'), kind: 'artifact' }], created_at: '2099-08-13T00:00:00.000Z', expires_at: '2099-08-13T01:00:00.000Z' });
  const inbound = (await import('../dist/opn-inbound-task.js')).createInboundTask({ network_id: 'network-admitted', envelope, received_at: '2099-08-13T00:00:01.000Z' });
  try {
    await stateStore.createNetwork({ network_id: 'network-admitted', owner_id: 'human-1', now: '2099-08-13T00:00:00.000Z' });
    await (await import('../dist/opn-inbound-task.js')).persistInboundTask({ stateStore, inbound });
    await (await import('../dist/opn-inbound-task.js')).appendInboundTaskDecision({ stateStore, inbound, decision: 'approved', human_id: 'human-1', human_note: 'approved for local Agent', selected_agent_id: 'agent-admitted', decided_at: '2099-08-13T00:00:02.000Z' });
    let received = false; let acknowledged = false; let executed = false;
    const adapter = createOpnAgentAdapter({ network_id: 'network-admitted', stateStore, transport: { async receive() { received = true; return null; }, async send() { return { status: 'accepted', message_id: 'result', envelope_digest: digest('c'), side_effects_executed: false }; }, async acknowledge() { acknowledged = true; return { status: 'accepted', message_id: envelope.message_id, envelope_digest: envelope.envelope_digest, side_effects_executed: false }; } }, runtime: { async acceptEnvelope() { executed = true; return { status: 'accepted', execution: { schema: 'zj-loop.native_agent_execution.v1', execution_id: task.execution_id, task_id: task.task_id, attempt: 1, agent_id: 'agent-admitted', task_digest: task.task_digest, registration_digest: digest('r'), started_at: '2099-08-13T00:00:03.000Z', status: 'evidence-recorded', evidence_refs: ['provider-result'], transitions: [] }, side_effects_executed: false }; } }, artifactStore: createOpnArtifactStore({ root: path.join(root, 'artifacts') }), agent_id: 'agent-admitted', now: () => '2099-08-13T00:00:03.000Z' });
    const result = await adapter.processNext({ session_id: 'session', resolveTask: () => task });
    assert.equal(result.status, 'processed'); assert.equal(received, false); assert.equal(acknowledged, false); assert.equal(executed, true);
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});
