import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createFakeTrustedRunner,
  trustedRunnerObservationDigest,
} from '../dist/trusted-runner.js';

const digest = (digit) => `sha256:${digit.repeat(64)}`;

function context(runner_id = 'runner-fixture-1') {
  return {
    runner_id,
    registry_revision: 7,
    execution_id: 'execution-runner-1',
    attempt: 1,
    preflight_digest: digest('1'),
    registry_snapshot_digest: digest('2'),
    capabilities_digest: digest('4'),
    helper: {
      helper_id: 'fake-trusted-runner',
      helper_version: 'fixture-1',
      protocol_version: 'zj-loop.trusted_runner_protocol.v1',
      executable_digest: digest('3'),
    },
  };
}

test('fake TrustedRunner closes prepare, launch, observation, and boundary verification', async () => {
  const runner = createFakeTrustedRunner({ runner_id: 'runner-fixture-1', now: () => '2026-08-01T12:00:00.000Z' });
  const execution = context('runner-fixture-1');

  const proof = await runner.prepareExecution({ execution });
  assert.equal(proof.status, 'signed');
  assert.equal(proof.execution_id, execution.execution_id);
  assert.equal(proof.preflight_digest, execution.preflight_digest);
  assert.equal(proof.runner_id, execution.runner_id);
  assert.equal(proof.registry_revision, execution.registry_revision);
  assert.equal(proof.registry_snapshot_digest, execution.registry_snapshot_digest);
  assert.equal(proof.capabilities_digest, execution.capabilities_digest);

  const launch = await runner.launch({ execution, proof });
  assert.equal(launch.status, 'launched');
  assert.equal(launch.process_boundary.kind, 'process-group');

  const observation = await runner.observe({ execution, proof, launch, output: { stdout: 'ok\n', stderr: '' } });
  assert.equal(observation.status, 'signed');
  assert.equal(observation.runner_id, execution.runner_id);
  assert.equal(observation.registry_revision, execution.registry_revision);
  assert.equal(observation.capabilities_digest, execution.capabilities_digest);
  assert.equal(observation.process_boundary.all_descendants_terminated, true);
  assert.equal(runner.verifyBoundary(observation).status, 'proved');
  assert.match(trustedRunnerObservationDigest(observation), /^sha256:[0-9a-f]{64}$/);
});

test('fake TrustedRunner rejects a tampered signed observation', async () => {
  const runner = createFakeTrustedRunner({ runner_id: 'runner-fixture-2', now: () => '2026-08-01T12:00:00.000Z' });
  const execution = context('runner-fixture-2');
  const proof = await runner.prepareExecution({ execution });
  const launch = await runner.launch({ execution, proof });
  const observation = await runner.observe({ execution, proof, launch, output: { stdout: 'ok\n', stderr: '' } });

  observation.process_boundary.all_descendants_terminated = false;
  assert.deepEqual(runner.verifyBoundary(observation), { status: 'blocked', reason: 'trusted-runner-observation-invalid' });
});

test('fake TrustedRunner blocks admission binding drift in proof and observation', async () => {
  const runner = createFakeTrustedRunner({ runner_id: 'runner-fixture-binding', now: () => '2026-08-01T12:00:00.000Z' });
  const execution = context('runner-fixture-binding');
  const proof = await runner.prepareExecution({ execution });

  await assert.rejects(() => runner.launch({ execution, proof: { ...proof, registry_revision: proof.registry_revision + 1 } }), /trusted-runner-proof-invalid/);

  const launch = await runner.launch({ execution, proof });
  const observation = await runner.observe({ execution, proof, launch, output: { stdout: 'ok\n', stderr: '' } });
  observation.capabilities_digest = digest('9');
  assert.deepEqual(runner.verifyBoundary(observation), { status: 'blocked', reason: 'trusted-runner-observation-invalid' });
});

test('fake TrustedRunner preserves a signed but unsafe descendant boundary as blocked', async () => {
  const runner = createFakeTrustedRunner({
    runner_id: 'runner-fixture-3',
    now: () => '2026-08-01T12:00:00.000Z',
    boundary: {
      kind: 'process-group',
      process_group_id: 'pg-unsafe',
      job_object_id: null,
      child_process_count: 3,
      all_descendants_terminated: false,
      termination_sequence_digest: digest('9'),
      orphan_processes_detected: true,
      unknown_descendants_detected: false,
    },
  });
  const execution = context('runner-fixture-3');
  const proof = await runner.prepareExecution({ execution });
  const launch = await runner.launch({ execution, proof });
  const observation = await runner.observe({ execution, proof, launch, output: { stdout: '', stderr: 'still-running' } });

  assert.equal(observation.status, 'signed');
  assert.deepEqual(runner.verifyBoundary(observation), { status: 'blocked', reason: 'trusted-runner-process-boundary-invalid' });
});
