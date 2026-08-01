import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import {
  createLocalExecutionPreflight,
  validateLocalExecutionPreflight,
} from '../dist/local-execution-preflight.js';
import {
  createLocalExecutionApproval,
  verifyLocalExecutionApproval,
} from '../dist/local-execution-approval.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;

const preflightInput = {
  network_id: 'network-1',
  plan_id: 'plan-1',
  plan_revision: 2,
  task_id: 'task-1',
  execution_id: 'execution-1',
  attempt: 1,
  provider_id: 'codex',
  adapter_version: 'codex-adapter.v1',
  executable: '/opt/codex/bin/codex',
  executable_digest: digest('a'),
  args: ['exec', '--json', '--sandbox', 'read-only'],
  argv_digest: digest('b'),
  cwd: '/tmp/worktree-1',
  cwd_digest: digest('c'),
  env_allowlist: ['CODEX_HOME'],
  env_policy_digest: digest('d'),
  sandbox_policy_digest: digest('e'),
  network_policy: { mode: 'network-denied', policy_digest: digest('f') },
  timeout_ms: 30_000,
  termination_grace_ms: 1_000,
  max_stdout_bytes: 1024 * 1024,
  max_stderr_bytes: 64 * 1024,
  orchestration_preflight_digest: digest('1'),
  issued_at: '2026-08-01T00:00:00.000Z',
  expires_at: '2026-08-01T01:00:00.000Z',
};

test('LocalExecutionPreflight canonicalizes policy and binds a concrete execution', () => {
  const preflight = createLocalExecutionPreflight({ ...preflightInput, env_allowlist: ['CODEX_HOME', 'CODEX_HOME'] });
  assert.equal(preflight.schema, 'zj-loop.local_execution_preflight.v1');
  assert.deepEqual(preflight.env_allowlist, ['CODEX_HOME']);
  assert.match(preflight.preflight_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(validateLocalExecutionPreflight(preflight).status, 'valid');
  assert.equal(validateLocalExecutionPreflight({ ...preflight, timeout_ms: 0 }).status, 'blocked');
});

test('LocalExecutionApproval signs and verifies the exact preflight binding', async () => {
  const preflight = createLocalExecutionPreflight(preflightInput);
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const identity = await signer.getPublicIdentity();
  const approval = await createLocalExecutionApproval({
    signer,
    preflight,
    request_id: 'execution-approval-1',
    issued_at: '2026-08-01T00:05:00.000Z',
    expires_at: '2026-08-01T00:30:00.000Z',
  });
  assert.equal(approval.schema, 'zj-loop.local_execution_approval.v1');
  assert.equal(approval.preflight_digest, preflight.preflight_digest);
  assert.equal(verifyLocalExecutionApproval({ approval, identity, now: '2026-08-01T00:10:00.000Z', expected: { preflight, request_id: 'execution-approval-1' } }).status, 'accepted');
  const drifted = createLocalExecutionPreflight({ ...preflightInput, timeout_ms: 31_000 });
  assert.equal(verifyLocalExecutionApproval({ approval, identity, now: '2026-08-01T00:10:00.000Z', expected: { preflight: drifted, request_id: 'execution-approval-1' } }).reason, 'preflight-digest-mismatch');
  assert.equal(verifyLocalExecutionApproval({ approval, identity, now: '2026-08-01T00:30:00.000Z', expected: { preflight, request_id: 'execution-approval-1' } }).reason, 'approval-expired');
});
