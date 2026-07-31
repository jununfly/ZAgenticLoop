import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAgentRegistration } from '../dist/agent-registration.js';
import { createBoundedLoopTask } from '../dist/agent-task.js';
import { createNativeAgentRuntime } from '../dist/native-agent-runtime.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createTransportEnvelope } from '../dist/transport-contract.js';

const artifact = 'sha256:' + '1'.repeat(64);
const registration = createAgentRegistration({
  agent_id: 'agent-1', display_name: 'Agent 1', capabilities: ['task.execute'],
  accepted_task_kinds: ['loop.task'], evidence_kinds: ['result'],
  protocol_version: 'opn-agent-runtime.v1', identity_ref: 'node-identity-1',
});
const task = createBoundedLoopTask({
  task_id: 'task-1', execution_id: 'exec-1', attempt: 1, task_kind: 'loop.task',
  objective: 'Produce a result', success_criteria: ['result exists'], input_artifact_refs: [artifact], dependency_refs: [],
  resource_isolation: { status: 'not-applicable', bindings: [] }, budget: { timeout_ms: 30_000, max_iterations: 1 },
  expected_evidence_kinds: ['result'], idempotency_key: 'task-1:exec-1:1', cancellation: { mode: 'cooperative', token: 'cancel-1' },
});
const envelope = createTransportEnvelope({
  message_id: 'message-1', network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 1,
  task_id: 'task-1', from_node_id: 'center', target_node_id: 'agent-1', notification_kind: 'agent.task', state: 'available',
  artifact_refs: [{ artifact_id: artifact, content_sha256: artifact, kind: 'artifact' }], created_at: '2026-08-01T00:00:00.000Z', expires_at: '2026-08-01T01:00:00.000Z',
});

async function fixture(name, executor) {
  const root = await mkdtemp(path.join(os.tmpdir(), `zj-native-runtime-${name}-`));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'center', now: '2026-08-01T00:00:00.000Z' });
  return { stateStore, runtime: createNativeAgentRuntime({ stateStore, registration, executor }) };
}

test('fixture runtime accepts an envelope, executes a bounded task, and persists lifecycle facts', async () => {
  let calls = 0;
  const { stateStore, runtime } = await fixture('success', async () => { calls += 1; return { status: 'succeeded', evidence_refs: ['evidence:result-1'] }; });
  const result = await runtime.acceptEnvelope({ envelope, task, now: '2026-08-01T00:00:01.000Z' });
  assert.equal(result.status, 'accepted');
  assert.equal(result.execution.status, 'evidence-recorded');
  assert.equal(calls, 1);
  const events = await stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'native-agent-execution' });
  assert.deepEqual(events.events.map((event) => event.event_type), [
    'agent-execution.received', 'agent-execution.validated', 'agent-execution.dispatched', 'agent-execution.running', 'agent-execution.succeeded', 'agent-execution.evidence-recorded',
  ]);
  await stateStore.close();
});

test('fixture runtime deduplicates an execution and blocks mismatched envelopes before execution', async () => {
  let calls = 0;
  const { stateStore, runtime } = await fixture('dedupe', async () => { calls += 1; return { status: 'blocked', reason: 'needs-human-review', evidence_refs: ['evidence:block-1'] }; });
  const first = await runtime.acceptEnvelope({ envelope, task, now: '2026-08-01T00:00:01.000Z' });
  const restartedRuntime = createNativeAgentRuntime({ stateStore, registration, executor: async () => { throw new Error('executor-must-not-run-after-restart'); } });
  const retry = await restartedRuntime.acceptEnvelope({ envelope, task, now: '2026-08-01T00:00:02.000Z' });
  assert.equal(first.execution.status, 'blocked');
  assert.equal(retry.status, 'duplicate');
  assert.equal(calls, 1);
  const { schema: _schema, envelope_digest: _digest, ...envelopeFields } = envelope;
  const blockedEnvelope = createTransportEnvelope({ ...envelopeFields, message_id: 'message-2', target_node_id: 'agent-2' });
  const blocked = await runtime.acceptEnvelope({ envelope: blockedEnvelope, task, now: '2026-08-01T00:00:03.000Z' });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.reason, 'target-agent-mismatch');
  await stateStore.close();
});
