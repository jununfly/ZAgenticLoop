import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAgentRegistration } from '../dist/agent-registration.js';
import { createOpnGraphAtomEnrollmentSnapshot } from '../dist/opn-graph-atom-enrollment.js';
import { runSameDeviceReadonlyAgentTasks, validateSameDeviceReadonlyRunResult } from '../dist/opn-same-device-readonly-runner.js';

const registration = (id) => createAgentRegistration({ agent_id: id, display_name: id, capabilities: ['read'], accepted_task_kinds: ['inspect'], evidence_kinds: ['report'], protocol_version: 'agent-v1', identity_ref: id });
const enrollment = createOpnGraphAtomEnrollmentSnapshot({ graph_id: 'graph-readonly', network_id: 'network-readonly', device_id: 'device-mac', center: { responsibility_unit: 'human', human_id: 'human-1' }, agents: ['Agent1', 'Agent2'].map((node_id) => ({ node_id, device_id: 'device-mac', network_id: 'network-readonly', status: 'approved', capability_ceiling: ['read'], registration: registration(node_id) })) });
const tasks = ['Agent1', 'Agent2'].map((node_id, index) => ({ task_id: `task-${index + 1}`, node_id, executable: '/opt/homebrew/bin/codex', cwd: '/tmp/agent', prompt: `Inspect the directory and report one fact as ${node_id}.`, resource_scope: ['read:workspace'] }));

test('runs two provider-neutral Agent nodes concurrently under one same-device enrollment', async () => {
  const calls = [];
  const providers = new Map(tasks.map((task) => [task.node_id, { async run(input) { calls.push({ node_id: task.node_id, input }); return { status: 'completed', success: true, pid: calls.length, exit_code: 0, signal: null, stdout: JSON.stringify({ agent: task.node_id, observation: 'readable' }), stderr: '', provider: 'codex' }; } }]));
  const result = await runSameDeviceReadonlyAgentTasks({ enrollment, tasks, providers });
  assert.equal(result.status, 'passed');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.input.mode).sort(), ['read-only', 'read-only']);
  assert.equal(validateSameDeviceReadonlyRunResult(result).status, 'valid');
});

test('does not report passed when one real provider fails', async () => {
  const providers = new Map([['Agent1', { async run() { return { status: 'completed', success: true, pid: 1, exit_code: 0, signal: null, stdout: 'ok', stderr: '' }; } }], ['Agent2', { async run() { return { status: 'failed', success: false, pid: 2, exit_code: 1, signal: null, stdout: '', stderr: 'failure' }; } }]]);
  const result = await runSameDeviceReadonlyAgentTasks({ enrollment, tasks, providers });
  assert.equal(result.status, 'blocked');
  assert.equal(result.agent_results.find((item) => item.node_id === 'Agent2').status, 'blocked');
});

test('rejects write-shaped resource scopes before invoking providers', async () => {
  await assert.rejects(() => runSameDeviceReadonlyAgentTasks({ enrollment, tasks: [{ ...tasks[0], resource_scope: ['write:workspace'] }, tasks[1]], providers: new Map() }), /same-device-readonly-readonly-resource-scope-invalid/);
});
