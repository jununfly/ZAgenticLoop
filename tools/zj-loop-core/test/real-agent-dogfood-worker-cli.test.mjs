import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runRealAgentDogfoodWorkerCli } from '../dist/real-agent-dogfood-worker-cli.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createContentAddressedEvidenceStore } from '../dist/content-addressed-evidence-store.js';
import { createRealAgentDogfoodDraft, createRealAgentDogfoodTransition, appendRealAgentDogfoodEvent, projectRealAgentDogfoodLifecycle } from '../dist/real-agent-dogfood-lifecycle.js';
import { acquireRealAgentDogfoodWorkerLease } from '../dist/real-agent-dogfood-worker.js';
import { createRealAgentDogfoodExecutionBinding } from '../dist/real-agent-dogfood-binding.js';
import { createAdmissionBoundExecution } from '../dist/trusted-runner-admission-binding.js';
import { trustedRunnerCapabilitiesDigest } from '../dist/trusted-runner-registry.js';
import { providerAuthRefDigest } from '../dist/provider-auth-runtime.js';
import { createInMemoryProviderAuthRuntime as createInMemoryProviderAuthRuntimeImpl } from '../dist/provider-auth-runtime.js';
import { createProviderAuthIpcFrame } from '../dist/provider-auth-ipc-protocol.js';
import { createUnixProviderAuthIpcServer } from '../dist/provider-auth-ipc-unix.js';
import { createTrustedRunnerPostRunProofServer } from '../dist/trusted-runner-post-run-ipc.js';
import { createFakeRealAgentDogfoodPostRunProof } from '../dist/real-agent-dogfood-post-run-proof.js';
import { createInMemoryTrustedRunnerPeerIdentityVerifier } from '../dist/trusted-runner-peer-identity.js';
import { mkdir, mkdtemp, rm, writeFile, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const digest = (letter) => `sha256:${letter.repeat(64)}`;
const runtimeBinding = { runtime_identity_fingerprint: digest('e'), runtime_manifest_digest: digest('f'), provider_capabilities_digest: digest('1') };
const createInMemoryProviderAuthRuntime = (input) => {
  const runtime = createInMemoryProviderAuthRuntimeImpl(input);
  return { ...runtime, launch: (request) => runtime.launch({ ...request, runtime_binding: request.runtime_binding ?? runtimeBinding }) };
};

function providerAuthRef(execution_id, attempt, provider_id = 'codex') {
  const unsigned = { schema: 'zj-loop.provider_auth_ref.v1', auth_ref_id: `auth-${execution_id}`, network_id: 'network-cli', node_id: 'node-1', provider_runtime_id: 'provider-runtime-1', provider_id, execution_id, attempt, issuer: 'provider-runtime-1', audience: 'model-api', scope: ['model:invoke'], issued_at: '2026-08-01T12:00:00.000Z', expires_at: '2026-08-01T13:00:00.000Z', status: 'active' };
  return { ...unsigned, ref_digest: providerAuthRefDigest(unsigned) };
}

test('worker blocks an unregistered provider without starting a process or falling back', async () => {
  const stdout = [];
  const stderr = [];
  const exitCode = await runRealAgentDogfoodWorkerCli(['worker', '--provider-id', 'unknown-provider'], {
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message),
  });
  assert.equal(exitCode, 2);
  assert.deepEqual(JSON.parse(stdout.join('')), { schema: 'zj-loop.real_agent_dogfood_worker_cli.v1', status: 'blocked', reason_code: 'provider-not-registered', next_action: 'register-supported-provider' });
  assert.equal(stderr.join(''), '');
});

test('worker recognizes codex but blocks until a persisted execution context is supplied', async () => {
  const stdout = [];
  const stderr = [];
  const exitCode = await runRealAgentDogfoodWorkerCli(['worker', '--provider-id', 'codex'], {
    stdout(message) { stdout.push(message); },
    stderr(message) { stderr.push(message); },
  });

  assert.equal(exitCode, 2);
  assert.deepEqual(JSON.parse(stdout[0]), {
    schema: 'zj-loop.real_agent_dogfood_worker_cli.v1',
    status: 'blocked',
    reason_code: 'execution-context-required',
    next_action: 'supply-running-execution-context',
  });
  assert.deepEqual(stderr, []);
});

test('worker context invokes the provider through the Runtime IPC channel', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-worker-cli-'));
  const statePath = path.join(root, 'state.db');
  const evidencePath = path.join(root, 'evidence');
  const worktree = path.join(root, 'worktree');
  const executable = path.join(root, 'provider.sh');
  await mkdir(worktree);
  await writeFile(executable, '#!/bin/sh\ncat >/dev/null\nprintf worker-output\n');
  await chmod(executable, 0o700);
  const store = createSqliteStateStore({ filename: statePath });
  const socketPath = path.join(root, 'runtime.sock');
  const runtime = createInMemoryProviderAuthRuntime({ runtime_id: 'provider-runtime-1', provider_ids: ['codex'], now: () => '2026-08-01T12:00:00.000Z' });
  const issued = await runtime.issueRef({ network_id: 'network-cli', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-cli', attempt: 1, audience: 'model-api', scope: ['model:invoke'], secret: 'secret', issued_at: '2026-08-01T12:00:00.000Z', expires_at: '2026-08-01T13:00:00.000Z', human_authorized: true });
  assert.equal(issued.status, 'issued');
  let launchHandle;
  const server = createUnixProviderAuthIpcServer({ socket_path: socketPath, correlation_id: 'worker-runtime', verify_peer: () => true, on_frames: async (frames, connection) => {
    const request = frames[0];
    if (request.kind === 'challenge') {
      const launch = await runtime.launch({ ref: issued.ref, network_id: 'network-cli', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-cli', attempt: 1, contract_digest: 'sha256:' + '5'.repeat(64), adapter_contract_digest: 'sha256:' + '4'.repeat(64), issued_at: '2026-08-01T12:00:00.000Z', expires_at: '2026-08-01T13:00:00.000Z' });
      assert.equal(launch.status, 'launched');
      launchHandle = launch.handle;
      await connection.send(createProviderAuthIpcFrame({ correlation_id: 'worker-runtime', sequence: 1, network_id: 'network-cli', node_id: 'node-1', provider_runtime_id: 'provider-runtime-1', provider_id: 'codex', execution_id: 'execution-cli', attempt: 1, kind: 'launch-accepted', launch_handle_digest: launch.handle.handle_digest, payload: { schema: 'zj-loop.provider_launch_response.v1', status: 'accepted', handle: launch.handle } }));
      await connection.send(createProviderAuthIpcFrame({ correlation_id: 'worker-runtime', sequence: 2, network_id: 'network-cli', node_id: 'node-1', provider_runtime_id: 'provider-runtime-1', provider_id: 'codex', execution_id: 'execution-cli', attempt: 1, kind: 'stdout', launch_handle_digest: launch.handle.handle_digest, payload: 'worker-output' }));
      await connection.send(createProviderAuthIpcFrame({ correlation_id: 'worker-runtime', sequence: 3, network_id: 'network-cli', node_id: 'node-1', provider_runtime_id: 'provider-runtime-1', provider_id: 'codex', execution_id: 'execution-cli', attempt: 1, kind: 'stderr', launch_handle_digest: launch.handle.handle_digest, payload: '' }));
      await connection.send(createProviderAuthIpcFrame({ correlation_id: 'worker-runtime', sequence: 4, network_id: 'network-cli', node_id: 'node-1', provider_runtime_id: 'provider-runtime-1', provider_id: 'codex', execution_id: 'execution-cli', attempt: 1, kind: 'result', launch_handle_digest: launch.handle.handle_digest, payload: { schema: 'zj-loop.provider_ipc_result.v1', status: 'completed', success: true, pid: 321, exit_code: 0, signal: null, provider_result: { schema: 'zj-loop.provider_result.v1', status: 'completed', success: true, exit_code: 0, signal: null, stdout_digest: 'sha256:' + 'a'.repeat(64), stderr_digest: 'sha256:' + 'b'.repeat(64) } } }));
    } else if (request.kind === 'cleanup') {
      assert.ok(launchHandle);
      const cleanup = await runtime.cleanup({ handle: launchHandle, network_id: 'network-cli', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-cli', attempt: 1, cleaned_at: '2026-08-01T12:01:00.000Z' });
      assert.equal(cleanup.status, 'cleaned');
      await connection.send(createProviderAuthIpcFrame({ correlation_id: 'worker-runtime', sequence: 1, network_id: 'network-cli', node_id: 'node-1', provider_runtime_id: 'provider-runtime-1', provider_id: 'codex', execution_id: 'execution-cli', attempt: 1, kind: 'cleanup', launch_handle_digest: launchHandle.handle_digest, payload: { schema: 'zj-loop.provider_cleanup_response.v1', status: 'cleaned', cleanup_digest: cleanup.proof.cleanup_digest, runtime_identity_fingerprint: cleanup.proof.runtime_identity_fingerprint, runtime_manifest_digest: cleanup.proof.runtime_manifest_digest, provider_capabilities_digest: cleanup.proof.provider_capabilities_digest } }));
    }
  } });
  const trustedRunnerSocketPath = path.join(root, 'trusted-runner.sock');
  const trustedRunner = createTrustedRunnerPostRunProofServer({ socket_path: trustedRunnerSocketPath, correlation_id: 'trusted-worker-runtime', expected_peer_identity_digest: 'a'.repeat(64), verify_peer: createInMemoryTrustedRunnerPeerIdentityVerifier({ identity: { schema: 'zj-loop.trusted_runner_peer_identity.v1', platform: 'darwin', kind: 'process-audit', identity_digest: 'a'.repeat(64), process_id: 42 } }), issue: async (request) => createFakeRealAgentDogfoodPostRunProof({ ...request, runner_id: 'trusted-fixture' }) });
  try {
    await server.start();
    await trustedRunner.start();
    await store.createNetwork({ network_id: 'network-cli', owner_id: 'human-1', now: '2026-08-01T12:00:00.000Z' });
    const draft = createRealAgentDogfoodDraft({ network_id: 'network-cli', dogfood_id: 'dogfood-cli', execution_id: 'execution-cli', attempt: 1, provider_id: 'codex', adapter_version: 'codex-agent-provider.v1', created_at: '2026-08-01T12:00:00.000Z' });
    const ready = createRealAgentDogfoodTransition({ lifecycle: draft.lifecycle, to: 'preflight-ready', event_id: 'ready-cli', occurred_at: '2026-08-01T12:00:01.000Z', fact_digest: 'sha256:' + 'a'.repeat(64), next_action: 'human-approval' });
    const awaiting = createRealAgentDogfoodTransition({ lifecycle: ready.lifecycle, to: 'awaiting-human-approval', event_id: 'awaiting-cli', occurred_at: '2026-08-01T12:00:02.000Z', fact_digest: 'sha256:' + 'a'.repeat(64), next_action: 'human-approval' });
    let revision = 1;
    for (const event of [draft.event, ready.event, awaiting.event]) await appendRealAgentDogfoodEvent({ stateStore: store, expected_revision: revision++, event });
    const invocationArgs = ['exec', '--json', '--ephemeral', '--sandbox', 'read-only', '--cd', worktree];
    const bindingDigest = (await createRealAgentDogfoodExecutionBinding({ executable, args: invocationArgs, cwd: worktree, worktree_path: worktree, lease_id: 'lease-placeholder' })).execution_binding_digest;
    const lease = await acquireRealAgentDogfoodWorkerLease({ stateStore: store, network_id: 'network-cli', execution_id: 'execution-cli', worker_id: 'worker-cli', execution_binding_digest: bindingDigest, now: new Date().toISOString(), ttl_ms: 600_000 });
    assert.equal(lease.status, 'acquired');
    const running = createRealAgentDogfoodTransition({ lifecycle: awaiting.lifecycle, to: 'running', event_id: 'running-cli', occurred_at: '2026-08-01T12:00:04.000Z', approval_digest: 'sha256:' + 'b'.repeat(64), next_action: 'provider-execution' });
    await appendRealAgentDogfoodEvent({ stateStore: store, expected_revision: lease.revision, event: running.event });
    const binding = await createRealAgentDogfoodExecutionBinding({ executable, args: invocationArgs, cwd: worktree, worktree_path: worktree, lease_id: lease.lease_id });
    const capabilities = ['process-boundary', 'output-bounds'];
    const admission_bound_execution = createAdmissionBoundExecution({
      preflight: { network_id: 'network-cli', plan_id: 'plan-cli', plan_revision: 1, task_id: 'task-cli', execution_id: 'execution-cli', attempt: 1, provider_id: 'codex', adapter_version: 'codex-agent-provider.v1', executable, executable_digest: 'sha256:' + 'a'.repeat(64), args: ['exec'], argv_digest: 'sha256:' + 'b'.repeat(64), cwd: worktree, cwd_digest: 'sha256:' + 'c'.repeat(64), env_allowlist: [], env_policy_digest: 'sha256:' + 'd'.repeat(64), sandbox_policy_digest: 'sha256:' + 'e'.repeat(64), network_policy: { mode: 'network-denied', policy_digest: 'sha256:' + 'f'.repeat(64) }, timeout_ms: 30_000, termination_grace_ms: 1_000, max_stdout_bytes: 1024 * 1024, max_stderr_bytes: 1024 * 1024, orchestration_preflight_digest: 'sha256:' + '1'.repeat(64), issued_at: '2026-08-01T12:00:00.000Z', expires_at: '2026-08-01T13:00:00.000Z' },
      execution: { helper: { helper_id: 'helper-cli', helper_version: '1', protocol_version: 'zj-loop.trusted_runner_protocol.v1', executable_digest: 'sha256:' + '2'.repeat(64) } },
      admission: { status: 'admitted', binding: { network_id: 'network-cli', runner_id: 'runner-cli', registry_revision: 1, registry_snapshot_digest: 'sha256:' + '3'.repeat(64), required_capabilities: ['process-boundary'], capabilities, capabilities_digest: trustedRunnerCapabilitiesDigest(capabilities), provider_auth_ref: issued.ref } },
      runtime_binding: runtimeBinding,
    });
    const contextPath = path.join(root, 'worker-context.json');
    await writeFile(contextPath, JSON.stringify({ schema: 'zj-loop.real_agent_dogfood_worker_context.v1', provider_id: 'codex', provider_auth_ref: admission_bound_execution.binding.provider_auth_ref, runtime_binding: runtimeBinding, adapter_contract_digest: 'sha256:' + '4'.repeat(64), provider_runtime_ipc: { socket_path: socketPath, correlation_id: 'worker-runtime', contract_digest: 'sha256:' + '5'.repeat(64), runtime_binding: runtimeBinding }, trusted_runner_post_run_ipc: { socket_path: trustedRunnerSocketPath, correlation_id: 'trusted-worker-runtime' }, state_store: statePath, evidence_store: evidencePath, network_id: 'network-cli', dogfood_id: 'dogfood-cli', execution_id: 'execution-cli', worker_id: 'worker-cli', lease_id: lease.lease_id, execution_binding_digest: bindingDigest, binding, admission_bound_execution, worktree_path: worktree, executable, goal: 'run the atom', expected_revision: lease.revision + 1 }));
    const stdout = [];
    const stderr = [];
    const exitCode = await runRealAgentDogfoodWorkerCli(['worker', '--provider-id', 'codex', '--context', contextPath], { stdout: (message) => stdout.push(message), stderr: (message) => stderr.push(message) });
    assert.deepEqual(stderr, []);
    assert.equal(exitCode, 0);
    const result = JSON.parse(stdout[0]);
    assert.equal(result.status, 'verification-pending');
    assert.equal(result.verifier_started, true);
    assert.match(result.stdout_digest, /^sha256:/);
    let finalStatus;
    for (let attempt = 0; attempt < 30; attempt++) {
      const snapshot = await store.readEvents({ network_id: 'network-cli', aggregate_type: 'real-agent-dogfood', aggregate_id: 'dogfood-cli' });
      finalStatus = projectRealAgentDogfoodLifecycle(snapshot.events).status;
      if (finalStatus === 'review-pending' || finalStatus === 'outcome-uncertain' || finalStatus === 'blocked') break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(finalStatus, 'review-pending');
    const evidence = await createContentAddressedEvidenceStore({ root: evidencePath });
    assert.equal((await evidence.read({ digest: result.stdout_digest, actor: 'test' })).toString(), 'worker-output');
  } finally {
    await server.close();
    await trustedRunner.close();
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});
