import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createNativeAgentEvidence } from '../dist/agent-evidence.js';
import { createAgentRegistration } from '../dist/agent-registration.js';
import { createBoundedLoopTask } from '../dist/agent-task.js';
import { createNativeAgentRuntime } from '../dist/native-agent-runtime.js';
import { createNativeOpnTracerExecution, recordNativeOpnTracerExecution } from '../dist/native-opn-tracer-execution.js';
import { createNativeOpnTracerAggregation, recordNativeOpnTracerAggregation } from '../dist/native-opn-tracer-aggregation.js';
import { createNativeOpnTracerVerification, recordNativeOpnTracerVerification } from '../dist/native-opn-tracer-verification.js';
import { createNativeOpnTracerReviewHandoff } from '../dist/review-handoff.js';
import { recordReviewHandoff } from '../dist/review-handoff-fact.js';
import { createHumanAcceptance } from '../dist/human-acceptance.js';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createTransportEnvelope } from '../dist/transport-contract.js';
import { buildNativeOpnTracerExecutionFromNativeAgent } from '../dist/native-agent-graph-bridge.js';

const digest = (digit) => `sha256:${digit.repeat(64)}`;
const registration = (agent_id) => createAgentRegistration({ agent_id, display_name: agent_id, capabilities: ['task.execute'], accepted_task_kinds: ['loop.task'], evidence_kinds: ['result'], protocol_version: 'opn-agent-runtime.v1', identity_ref: `identity:${agent_id}` });
const makeTask = (agent_id, execution_id, task_id, input_ref = digest('0')) => createBoundedLoopTask({ task_id, execution_id, attempt: 1, task_kind: 'loop.task', objective: `Execute ${task_id}`, success_criteria: ['result exists'], input_artifact_refs: [input_ref], dependency_refs: [], resource_isolation: { status: 'not-applicable', bindings: [] }, budget: { timeout_ms: 30_000, max_iterations: 1 }, expected_evidence_kinds: ['result'], idempotency_key: `${task_id}:${execution_id}:1`, cancellation: { mode: 'cooperative', token: `cancel:${execution_id}` } });
const makeEnvelope = (task, target_node_id, artifact_id, message_id) => createTransportEnvelope({ message_id, network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 1, task_id: task.task_id, from_node_id: 'center', target_node_id, notification_kind: 'agent.task', state: 'available', artifact_refs: [{ artifact_id, content_sha256: artifact_id, kind: 'artifact' }], created_at: '2026-08-01T00:00:00.000Z', expires_at: '2026-08-01T01:00:00.000Z' });

test('Native OPN Runtime closes the deterministic Agent1 -> Agent2 -> Human acceptance path', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-native-agent-conformance-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-01T00:00:00.000Z' });
    const task1 = makeTask('agent-1', 'execution-1', 'task-1');
    const runtime1 = createNativeAgentRuntime({ stateStore, registration: registration('agent-1'), executor: async () => ({ status: 'succeeded', evidence_refs: ['evidence:agent-1'] }) });
    const runtime2 = createNativeAgentRuntime({ stateStore, registration: registration('agent-2'), executor: async () => ({ status: 'succeeded', evidence_refs: ['evidence:agent-2'] }) });
    const first = await runtime1.acceptEnvelope({ envelope: makeEnvelope(task1, 'agent-1', digest('0'), 'message-1'), task: task1, now: '2026-08-01T00:00:01.000Z' });
    assert.equal(first.execution.status, 'evidence-recorded');
    const evidence1 = createNativeAgentEvidence({ evidence_id: 'evidence-1', execution_id: 'execution-1', task_id: 'task-1', attempt: 1, agent_id: 'agent-1', kind: 'result', artifact_ref: digest('2'), content_sha256: digest('2'), success_criteria: ['result exists'], observed_at: '2026-08-01T00:00:02.000Z', status: 'passed' });
    const task2 = makeTask('agent-2', 'execution-2', 'task-2', evidence1.evidence_digest);
    const second = await runtime2.acceptEnvelope({ envelope: makeEnvelope(task2, 'agent-2', evidence1.evidence_digest, 'message-2'), task: task2, now: '2026-08-01T00:00:03.000Z' });
    assert.equal(second.execution.status, 'evidence-recorded');
    const evidence2 = createNativeAgentEvidence({ evidence_id: 'evidence-2', execution_id: 'execution-2', task_id: 'task-2', attempt: 1, agent_id: 'agent-2', kind: 'result', artifact_ref: digest('3'), content_sha256: digest('3'), success_criteria: ['result exists'], observed_at: '2026-08-01T00:00:04.000Z', status: 'passed' });
    const graph1 = buildNativeOpnTracerExecutionFromNativeAgent({ execution: first.execution, input_evidence_digests: [], output_evidence_digest: evidence1.evidence_digest, network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('4'), recorded_at: '2026-08-01T00:00:05.000Z' });
    const graph2 = buildNativeOpnTracerExecutionFromNativeAgent({ execution: second.execution, input_evidence_digests: [evidence1.evidence_digest], output_evidence_digest: evidence2.evidence_digest, network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('4'), recorded_at: '2026-08-01T00:00:06.000Z' });
    let revision = await stateStore.getRevision('network-1');
    assert.equal((await recordNativeOpnTracerExecution({ stateStore, expected_revision: revision, execution: graph1, now: graph1.recorded_at })).status, 'recorded');
    revision = await stateStore.getRevision('network-1');
    assert.equal((await recordNativeOpnTracerExecution({ stateStore, expected_revision: revision, execution: graph2, now: graph2.recorded_at })).status, 'recorded');
    const aggregation = createNativeOpnTracerAggregation({ network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('4'), aggregation_id: 'aggregation-1', execution_ids: ['execution-1', 'execution-2'], input_evidence_digests: [evidence1.evidence_digest, evidence2.evidence_digest], output_evidence_digest: digest('5'), aggregated_at: '2026-08-01T00:00:07.000Z' });
    revision = await stateStore.getRevision('network-1');
    assert.equal((await recordNativeOpnTracerAggregation({ stateStore, expected_revision: revision, aggregation, now: aggregation.aggregated_at })).status, 'recorded');
    const verification = createNativeOpnTracerVerification({ network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('4'), aggregation_id: 'aggregation-1', aggregation_digest: aggregation.aggregation_digest, verifier_id: 'verifier-1', excluded_node_ids: ['agent-1', 'agent-2', 'aggregation-1'], status: 'passed', conditions: ['combined-output-valid'], satisfied_conditions: ['combined-output-valid'], failed_conditions: [], evidence_digest: digest('6'), checked_at: '2026-08-01T00:00:08.000Z' });
    revision = await stateStore.getRevision('network-1');
    assert.equal((await recordNativeOpnTracerVerification({ stateStore, expected_revision: revision, verification, now: verification.checked_at })).status, 'recorded');
    const handoff = createNativeOpnTracerReviewHandoff({ verification, dependencies_closed: true, remaining_risks: [], external_resource_states: [], responsible_party: 'human-1', accepted_at: '2026-08-01T00:00:09.000Z' });
    revision = await stateStore.getRevision('network-1');
    assert.equal((await recordReviewHandoff({ stateStore, expected_revision: revision, handoff, now: handoff.accepted_at })).status, 'recorded');
    const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
    const acceptance = await createHumanAcceptance({ signer, handoff, plan_digest: digest('4'), accepted_at: '2026-08-01T00:00:10.000Z' });
    assert.equal(acceptance.decision, 'accepted');
    assert.equal(acceptance.review_handoff_digest, handoff.handoff_digest);
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});
