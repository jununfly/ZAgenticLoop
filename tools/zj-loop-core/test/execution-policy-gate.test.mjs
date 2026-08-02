import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalExecutionPreflight } from '../dist/local-execution-preflight.js';
import { evaluateExecutionPolicy } from '../dist/execution-policy-gate.js';

const digest = (letter) => 'sha256:' + letter.repeat(64);
const preflight = createLocalExecutionPreflight({
  network_id: 'network-1',
  plan_id: 'plan-1',
  plan_revision: 1,
  task_id: 'task-1',
  execution_id: 'execution-1',
  attempt: 1,
  runner_id: 'runner-1',
  registry_revision: 7,
  registry_snapshot_digest: digest('2'),
  capabilities_digest: digest('3'),
  provider_id: 'codex',
  adapter_version: 'codex-adapter.v1',
  executable: '/opt/codex/bin/codex',
  executable_digest: digest('a'),
  args: ['exec', '--json'],
  argv_digest: digest('b'),
  cwd: '/tmp/worktree',
  cwd_digest: digest('c'),
  env_allowlist: [],
  env_policy_digest: digest('d'),
  sandbox_policy_digest: digest('e'),
  network_policy: { mode: 'network-denied', policy_digest: digest('f') },
  timeout_ms: 1000,
  termination_grace_ms: 100,
  max_stdout_bytes: 1000,
  max_stderr_bytes: 1000,
  orchestration_preflight_digest: digest('1'),
  issued_at: '2026-08-01T00:00:00.000Z',
  expires_at: '2026-08-01T01:00:00.000Z',
});

const base = {
  preflight,
  approval: { status: 'accepted', preflight_digest: preflight.preflight_digest, approval_digest: digest('2'), expires_at: '2026-08-01T00:30:00.000Z' },
  now: '2026-08-01T00:10:00.000Z',
  artifacts: { status: 'persisted', refs: [digest('3')] },
  process: { status: 'completed', success: true, exit_code: 0, signal: null },
};

test('ExecutionPolicyGate allows only a fully bound completed provider result', () => {
  const result = evaluateExecutionPolicy(base);
  assert.equal(result.status, 'provider-completed');
  assert.equal(result.outcome, 'confirmed-success');
  assert.deepEqual(result.reason_codes, []);
  assert.equal(result.side_effects_executed, false);
});

test('ExecutionPolicyGate fails closed for drift, missing artifacts, and expired approval', () => {
  assert.equal(evaluateExecutionPolicy({ ...base, approval: { ...base.approval, preflight_digest: digest('9') } }).status, 'blocked');
  assert.equal(evaluateExecutionPolicy({ ...base, artifacts: { status: 'blocked', refs: [] } }).reason_codes[0], 'artifact-persistence-failed');
  assert.equal(evaluateExecutionPolicy({ ...base, now: '2026-08-01T00:30:00.000Z' }).reason_codes[0], 'approval-expired');
});

test('ExecutionPolicyGate maps failed, cancelled, and timed-out processes to uncertain outcomes', () => {
  for (const status of ['failed', 'cancelled', 'timed-out']) {
    const result = evaluateExecutionPolicy({ ...base, process: { status, success: false, exit_code: null, signal: 'SIGTERM' } });
    assert.equal(result.status, 'outcome-uncertain');
    assert.equal(result.outcome, 'outcome-uncertain');
  }
});
