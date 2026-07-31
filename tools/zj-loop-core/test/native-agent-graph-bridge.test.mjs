import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNativeAgentEvidence } from '../dist/agent-evidence.js';
import { createNativeAgentExecution } from '../dist/agent-execution.js';
import { buildNativeOpnTracerExecutionFromNativeAgent } from '../dist/native-agent-graph-bridge.js';

const digest = (digit) => `sha256:${digit.repeat(64)}`;
const evidence = createNativeAgentEvidence({
  evidence_id: 'evidence-1', execution_id: 'exec-1', task_id: 'task-1', attempt: 1, agent_id: 'agent-1', kind: 'result',
  artifact_ref: digest('2'), content_sha256: digest('3'), success_criteria: ['result exists'], observed_at: '2026-08-01T00:00:02.000Z', status: 'passed',
});
const execution = createNativeAgentExecution({ execution_id: 'exec-1', task_id: 'task-1', attempt: 1, agent_id: 'agent-1', task_digest: digest('4'), registration_digest: digest('5'), started_at: '2026-08-01T00:00:00.000Z' });

test('Native Agent execution bridge binds evidence-recorded output to Graph scope', () => {
  const current = { ...execution, status: 'evidence-recorded', evidence_refs: [evidence.evidence_digest] };
  const result = buildNativeOpnTracerExecutionFromNativeAgent({
    execution: current, input_evidence_digests: [], output_evidence_digest: evidence.evidence_digest,
    network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('1'), recorded_at: '2026-08-01T00:00:03.000Z',
  });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.assigned_node, 'agent-1');
  assert.equal(result.output_evidence_digest, evidence.evidence_digest);
});

test('Native Agent execution bridge refuses missing output and preserves blocked state', () => {
  assert.throws(() => buildNativeOpnTracerExecutionFromNativeAgent({
    execution: { ...execution, status: 'evidence-recorded', evidence_refs: [] }, input_evidence_digests: [], output_evidence_digest: undefined,
    network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('1'), recorded_at: '2026-08-01T00:00:03.000Z',
  }), { message: 'native-agent-graph-output-required' });
  const blocked = buildNativeOpnTracerExecutionFromNativeAgent({
    execution: { ...execution, status: 'blocked', evidence_refs: [] }, input_evidence_digests: [],
    network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('1'), recorded_at: '2026-08-01T00:00:03.000Z',
  });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.output_evidence_digest, undefined);
});
