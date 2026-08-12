import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAgentRegistration } from '../dist/agent-registration.js';
import { createBoundedLoopTask } from '../dist/agent-task.js';
import { evaluateOpnTaskAdmission } from '../dist/opn-task-admission.js';

const digest = (digit) => `sha256:${digit.repeat(64)}`;
function task() {
  return createBoundedLoopTask({ task_id: 'task-1', execution_id: 'execution-1', attempt: 1, task_kind: 'loop.task', objective: 'inspect the bounded input', success_criteria: ['evidence exists'], input_artifact_refs: [digest('a')], dependency_refs: [], resource_isolation: { status: 'not-applicable', bindings: [] }, budget: { timeout_ms: 30000, max_iterations: 1 }, expected_evidence_kinds: ['result'], idempotency_key: 'task-1:1', cancellation: { mode: 'cooperative', token: 'cancel:1' } });
}
function registration(overrides = {}) {
  return createAgentRegistration({ agent_id: 'agent-1', display_name: 'Agent 1', capabilities: ['task.execute'], accepted_task_kinds: ['loop.task'], evidence_kinds: ['result'], protocol_version: 'opn-agent-runtime.v1', identity_ref: 'identity:agent-1', ...overrides });
}

test('supervised admission stops before execution and requires Human approval', () => {
  assert.deepEqual(evaluateOpnTaskAdmission({ task: task(), registration: registration(), target_node_id: 'agent-1', supervision_mode: 'supervised' }), { status: 'pending-human-approval', supervision_mode: 'supervised', ready_for_agent: true, reason: 'human-approval-required', side_effects_executed: false });
});

test('unattended admission is deterministic and allows only ready tasks', () => {
  assert.equal(evaluateOpnTaskAdmission({ task: task(), registration: registration(), target_node_id: 'agent-1', supervision_mode: 'unattended' }).status, 'admitted');
  assert.equal(evaluateOpnTaskAdmission({ task: task(), registration: registration({ capabilities: ['event.consume'] }), target_node_id: 'agent-1', supervision_mode: 'unattended' }).reason, 'task-execute-capability-missing');
  assert.equal(evaluateOpnTaskAdmission({ task: task(), registration: registration({ accepted_task_kinds: ['other.task'] }), target_node_id: 'agent-1', supervision_mode: 'unattended' }).reason, 'task-kind-not-accepted');
});
