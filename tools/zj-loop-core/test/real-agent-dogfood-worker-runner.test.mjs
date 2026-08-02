import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createContentAddressedEvidenceStore } from '../dist/content-addressed-evidence-store.js';
import { createRealAgentDogfoodDraft, createRealAgentDogfoodTransition, appendRealAgentDogfoodEvent, projectRealAgentDogfoodLifecycle } from '../dist/real-agent-dogfood-lifecycle.js';
import { executeRealAgentDogfoodWorker } from '../dist/real-agent-dogfood-worker-runner.js';
import { createRealAgentDogfoodExecutionBinding } from '../dist/real-agent-dogfood-binding.js';
import { createFakeRealAgentDogfoodPostRunProof } from '../dist/real-agent-dogfood-post-run-proof.js';
import { createAdmissionBoundExecution } from '../dist/trusted-runner-admission-binding.js';
import { trustedRunnerCapabilitiesDigest } from '../dist/trusted-runner-registry.js';
import { providerAuthRefDigest } from '../dist/provider-auth-runtime.js';

const d = (letter) => `sha256:${letter.repeat(64)}`;
function providerAuthRef(execution_id, attempt, provider_id = 'provider-1') {
  const unsigned = { schema: 'zj-loop.provider_auth_ref.v1', auth_ref_id: `auth-${execution_id}`, network_id: 'network-1', node_id: 'node-1', provider_runtime_id: 'provider-runtime-1', provider_id, execution_id, attempt, issuer: 'provider-runtime-1', audience: 'model-api', scope: ['model:invoke'], issued_at: '2026-08-01T12:00:00.000Z', expires_at: '2026-08-01T13:00:00.000Z', status: 'active' };
  return { ...unsigned, ref_digest: providerAuthRefDigest(unsigned) };
}

function admissionBoundExecution({ execution_id, attempt, executable, cwd }) {
  const capabilities = ['process-boundary', 'output-bounds'];
  return createAdmissionBoundExecution({
    preflight: {
      network_id: 'network-1', plan_id: 'plan-1', plan_revision: 1, task_id: 'task-1', execution_id, attempt,
      provider_id: 'provider-1', adapter_version: 'adapter-1', executable, executable_digest: d('c'), args: ['exec'], argv_digest: d('d'), cwd, cwd_digest: d('e'), env_allowlist: [], env_policy_digest: d('f'), sandbox_policy_digest: d('1'), network_policy: { mode: 'network-denied', policy_digest: d('2') }, timeout_ms: 1000, termination_grace_ms: 100, max_stdout_bytes: 1024, max_stderr_bytes: 1024, orchestration_preflight_digest: d('3'), issued_at: '2026-08-01T12:00:00.000Z', expires_at: '2026-08-01T13:00:00.000Z',
    },
    execution: { helper: { helper_id: 'helper-1', helper_version: '1', protocol_version: 'zj-loop.trusted_runner_protocol.v1', executable_digest: d('4') } },
    admission: { status: 'admitted', binding: { network_id: 'network-1', runner_id: 'runner-1', registry_revision: 1, registry_snapshot_digest: d('5'), required_capabilities: ['process-boundary'], capabilities, capabilities_digest: trustedRunnerCapabilitiesDigest(capabilities), provider_auth_ref: providerAuthRef(execution_id, attempt) } },
  });
}

async function runningFixture(root) {
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-01T12:00:00.000Z' });
  const draft = createRealAgentDogfoodDraft({ network_id: 'network-1', dogfood_id: 'dogfood-1', execution_id: 'execution-1', attempt: 1, provider_id: 'provider-1', adapter_version: 'adapter-1', created_at: '2026-08-01T12:00:00.000Z' });
  const ready = createRealAgentDogfoodTransition({ lifecycle: draft.lifecycle, to: 'preflight-ready', event_id: 'ready', occurred_at: '2026-08-01T12:00:01.000Z', fact_digest: d('a'), next_action: 'human-approval' });
  const awaiting = createRealAgentDogfoodTransition({ lifecycle: ready.lifecycle, to: 'awaiting-human-approval', event_id: 'awaiting', occurred_at: '2026-08-01T12:00:02.000Z', fact_digest: d('a'), next_action: 'human-approval' });
  const running = createRealAgentDogfoodTransition({ lifecycle: awaiting.lifecycle, to: 'running', event_id: 'running', occurred_at: '2026-08-01T12:00:03.000Z', approval_digest: d('b'), next_action: 'provider-execution' });
  let revision = 1;
  for (const event of [draft.event, ready.event, awaiting.event, running.event]) await appendRealAgentDogfoodEvent({ stateStore, expected_revision: revision++, event });
  return { stateStore, lifecycle: running.lifecycle };
}

test('worker persists bounded output evidence and advances only with post-run proof', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-worker-runner-'));
  const evidenceStore = await createContentAddressedEvidenceStore({ root: path.join(root, 'evidence') });
  const { stateStore, lifecycle } = await runningFixture(root);
  const executable = path.join(root, 'provider');
  await (await import('node:fs/promises')).writeFile(executable, 'provider');
  const binding = await createRealAgentDogfoodExecutionBinding({ executable, args: ['exec'], cwd: '/tmp/worktree', worktree_path: '/tmp/worktree', lease_id: 'lease-1' });
  const admission_bound_execution = admissionBoundExecution({ execution_id: lifecycle.execution_id, attempt: lifecycle.attempt, executable, cwd: '/tmp/worktree' });
  const postRunProofFactory = async (input) => createFakeRealAgentDogfoodPostRunProof(input);
  let request;
  try {
    const result = await executeRealAgentDogfoodWorker({ stateStore, evidenceStore, lifecycle, worker_id: 'worker-1', lease_id: 'lease-1', binding, admission_bound_execution, worktree_path: '/tmp/worktree', executable, goal: 'do the atom', provider: { async run(input) { request = input; return { status: 'completed', success: true, pid: 123, exit_code: 0, signal: null, stdout: 'result', stderr: '' }; } }, provider_cleanup: async () => ({ status: 'cleaned', proof_digest: d('6') }), post_run_proof_factory: postRunProofFactory, expected_revision: 5, now: '2026-08-01T12:00:04.000Z' });
    assert.equal(result.status, 'verification-pending');
    assert.equal(request.cwd, '/tmp/worktree');
    const events = await stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'real-agent-dogfood', aggregate_id: 'dogfood-1' });
    assert.equal(projectRealAgentDogfoodLifecycle(events.events).status, 'verification-pending');
    assert.match(result.stdout_digest, /^sha256:/);
    assert.match(result.provider_fact_digest, /^sha256:/);
    const fact = await evidenceStore.read({ digest: result.provider_fact_digest, actor: 'test' });
    assert.match(fact.toString(), /real_agent_dogfood_provider_result/);
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('worker does not claim verification when post-run proof is missing', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-worker-runner-uncertain-'));
  const evidenceStore = await createContentAddressedEvidenceStore({ root: path.join(root, 'evidence') });
  const { stateStore, lifecycle } = await runningFixture(root);
  const executable = path.join(root, 'provider');
  await (await import('node:fs/promises')).writeFile(executable, 'provider');
  const binding = await createRealAgentDogfoodExecutionBinding({ executable, args: ['exec'], cwd: '/tmp/worktree', worktree_path: '/tmp/worktree', lease_id: 'lease-1' });
  const admission_bound_execution = admissionBoundExecution({ execution_id: lifecycle.execution_id, attempt: lifecycle.attempt, executable, cwd: '/tmp/worktree' });
  try {
    const result = await executeRealAgentDogfoodWorker({ stateStore, evidenceStore, lifecycle, worker_id: 'worker-1', lease_id: 'lease-1', binding, admission_bound_execution, worktree_path: '/tmp/worktree', executable, goal: 'do the atom', provider: { async run() { return { status: 'completed', success: true, pid: 123, exit_code: 0, signal: null, stdout: 'result', stderr: '' }; } }, provider_cleanup: async () => ({ status: 'cleaned', proof_digest: d('6') }), expected_revision: 5, now: '2026-08-01T12:00:04.000Z' });
    assert.equal(result.status, 'outcome-uncertain');
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('worker records malformed ProviderResult as an adapter failure', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-worker-runner-adapter-failure-'));
  const evidenceStore = await createContentAddressedEvidenceStore({ root: path.join(root, 'evidence') });
  const { stateStore, lifecycle } = await runningFixture(root);
  const executable = path.join(root, 'provider');
  await (await import('node:fs/promises')).writeFile(executable, 'provider');
  const binding = await createRealAgentDogfoodExecutionBinding({ executable, args: ['exec'], cwd: '/tmp/worktree', worktree_path: '/tmp/worktree', lease_id: 'lease-1' });
  const admission_bound_execution = admissionBoundExecution({ execution_id: lifecycle.execution_id, attempt: lifecycle.attempt, executable, cwd: '/tmp/worktree' });
  try {
    const result = await executeRealAgentDogfoodWorker({ stateStore, evidenceStore, lifecycle, worker_id: 'worker-1', lease_id: 'lease-1', binding, admission_bound_execution, worktree_path: '/tmp/worktree', executable, goal: 'do the atom', provider: { async run() { return { status: 'completed', success: true, pid: 123, exit_code: 0, signal: null, stdout: 'result', stderr: '', provider_result: { schema: 'zj-loop.provider_result.v1', status: 'completed', success: true, exit_code: 0, signal: null, stdout_digest: d('a'), stderr_digest: d('b'), unexpected: true } }; } }, expected_revision: 5, now: '2026-08-01T12:00:04.000Z' });
    assert.equal(result.status, 'outcome-uncertain');
    assert.equal(result.reason_code, 'provider-adapter-failure-cleanup-uncertain');
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('worker keeps adapter failure blocked only after trusted cleanup proof', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-worker-runner-adapter-cleaned-'));
  const evidenceStore = await createContentAddressedEvidenceStore({ root: path.join(root, 'evidence') });
  const { stateStore, lifecycle } = await runningFixture(root);
  const executable = path.join(root, 'provider');
  await (await import('node:fs/promises')).writeFile(executable, 'provider');
  const binding = await createRealAgentDogfoodExecutionBinding({ executable, args: ['exec'], cwd: '/tmp/worktree', worktree_path: '/tmp/worktree', lease_id: 'lease-1' });
  const admission_bound_execution = admissionBoundExecution({ execution_id: lifecycle.execution_id, attempt: lifecycle.attempt, executable, cwd: '/tmp/worktree' });
  try {
    const result = await executeRealAgentDogfoodWorker({ stateStore, evidenceStore, lifecycle, worker_id: 'worker-1', lease_id: 'lease-1', binding, admission_bound_execution, worktree_path: '/tmp/worktree', executable, goal: 'do the atom', provider: { async run() { return { status: 'completed', success: true, pid: 123, exit_code: 0, signal: null, stdout: 'result', stderr: '', provider_result: { schema: 'zj-loop.provider_result.v1', status: 'completed', success: true, exit_code: 0, signal: null, stdout_digest: d('a'), stderr_digest: d('b'), unexpected: true } }; } }, provider_cleanup: async () => ({ status: 'cleaned', proof_digest: d('c') }), expected_revision: 5, now: '2026-08-01T12:00:04.000Z' });
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason_code, 'provider-adapter-failure');
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('worker rejects a tampered signed post-run proof', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-worker-runner-tampered-'));
  const evidenceStore = await createContentAddressedEvidenceStore({ root: path.join(root, 'evidence') });
  const { stateStore, lifecycle } = await runningFixture(root);
  const executable = path.join(root, 'provider');
  await (await import('node:fs/promises')).writeFile(executable, 'provider');
  const binding = await createRealAgentDogfoodExecutionBinding({ executable, args: ['exec'], cwd: '/tmp/worktree', worktree_path: '/tmp/worktree', lease_id: 'lease-1' });
  const admission_bound_execution = admissionBoundExecution({ execution_id: lifecycle.execution_id, attempt: lifecycle.attempt, executable, cwd: '/tmp/worktree' });
  const postRunProofFactory = async (input) => {
    const proof = createFakeRealAgentDogfoodPostRunProof(input);
    proof.after_worktree_clean = false;
    return proof;
  };
  try {
    const result = await executeRealAgentDogfoodWorker({ stateStore, evidenceStore, lifecycle, worker_id: 'worker-1', lease_id: 'lease-1', binding, admission_bound_execution, worktree_path: '/tmp/worktree', executable, goal: 'do the atom', provider: { async run() { return { status: 'completed', success: true, pid: 123, exit_code: 0, signal: null, stdout: 'result', stderr: '' }; } }, provider_cleanup: async () => ({ status: 'cleaned', proof_digest: d('6') }), post_run_proof_factory: postRunProofFactory, expected_revision: 5, now: '2026-08-01T12:00:04.000Z' });
    assert.equal(result.status, 'outcome-uncertain');
    assert.equal(result.reason_code, 'post-run-proof-invalid');
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});
