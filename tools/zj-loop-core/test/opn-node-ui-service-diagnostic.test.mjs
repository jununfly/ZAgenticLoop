import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBoundedLoopTask } from '../dist/agent-task.js';
import { createOpnNodeUiServiceDiagnosticExecutor } from '../dist/opn-node-ui-service-diagnostic.js';

const digest = 'sha256:' + 'a'.repeat(64);
const task = createBoundedLoopTask({
  task_id: 'node-ui-diagnostic-task', execution_id: 'node-ui-diagnostic-execution', attempt: 1,
  task_kind: 'opn-node-ui-service-dogfood', objective: 'verify node UI service',
  success_criteria: ['service remains available after restart'], input_artifact_refs: [digest], dependency_refs: [],
  resource_isolation: { status: 'not-applicable', bindings: [] }, budget: { timeout_ms: 30_000, max_iterations: 1 },
  expected_evidence_kinds: ['service_status', 'healthz', 'connection', 'restart_persistence'],
  idempotency_key: 'node-ui-diagnostic-task:1', cancellation: { mode: 'cooperative', token: 'cancel:node-ui-diagnostic' },
});

function response(status, body) { return { ok: status >= 200 && status < 300, status, async text() { return JSON.stringify(body); } }; }

test('node UI diagnostic executor performs deterministic service and endpoint checks', async () => {
  const commands = [];
  const executor = createOpnNodeUiServiceDiagnosticExecutor({
    network_id: 'opn-test', node_id: 'abcdef0123456789ffff', platform: 'win32',
    command: async (command, args) => {
      commands.push([command, args]);
      if (args[0] === '/Query') return { status: 0, stdout: 'TaskName: \\x\r\nTask To Run: C:\\zj-loop\\service.cmd\r\nTask State: Running\r\n', stderr: '' };
      return { status: 0, stdout: '', stderr: '' };
    },
    fetcher: async (url) => response(200, { status: 'ok', url }),
  });
  const result = await executor(task);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.evidence.status, 'passed');
  assert.equal(result.evidence.service_label, 'ZAgenticLoop-OPN-NodeUI-opn-test-abcdef0123456789');
  assert.equal(result.evidence.service_command, 'C:\\zj-loop\\service.cmd');
  assert.equal(result.evidence.restart_persistence.healthy_after_restart, true);
  assert.deepEqual(commands.map((item) => item[1][0]), ['/Query', '/End', '/Run', '/Query']);
});

test('node UI diagnostic executor blocks when restart or endpoint checks fail', async () => {
  const executor = createOpnNodeUiServiceDiagnosticExecutor({
    network_id: 'opn-test', node_id: 'abcdef0123456789ffff', platform: 'win32',
    command: async (_command, args) => args[0] === '/Query' ? { status: 0, stdout: 'Task State: Running\r\n', stderr: '' } : { status: 1, stdout: '', stderr: 'failed' },
    fetcher: async () => response(503, { status: 'blocked' }),
  });
  const result = await executor(task);
  assert.equal(result.status, 'blocked');
  assert.equal(result.evidence.status, 'blocked');
  assert.match(result.reason, /diagnostic-check-failed/);
  assert.equal(result.evidence.healthz.status, 'blocked');
});
