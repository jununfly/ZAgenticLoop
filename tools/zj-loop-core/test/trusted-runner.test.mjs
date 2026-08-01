import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createFakeTrustedRunner,
  trustedRunnerObservationDigest,
} from '../dist/trusted-runner.js';

const digest = (digit) => `sha256:${digit.repeat(64)}`;

function context() {
  return {
    execution_id: 'execution-runner-1',
    attempt: 1,
    preflight_digest: digest('1'),
    registry_snapshot_digest: digest('2'),
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
  const execution = context();

  const proof = await runner.prepareExecution({ execution });
  assert.equal(proof.status, 'signed');
  assert.equal(proof.execution_id, execution.execution_id);
  assert.equal(proof.preflight_digest, execution.preflight_digest);

  const launch = await runner.launch({ execution, proof });
  assert.equal(launch.status, 'launched');
  assert.equal(launch.process_boundary.kind, 'process-group');

  const observation = await runner.observe({ execution, proof, launch, output: { stdout: 'ok\n', stderr: '' } });
  assert.equal(observation.status, 'signed');
  assert.equal(observation.process_boundary.all_descendants_terminated, true);
  assert.equal(runner.verifyBoundary(observation).status, 'proved');
  assert.match(trustedRunnerObservationDigest(observation), /^sha256:[0-9a-f]{64}$/);
});

test('fake TrustedRunner rejects a tampered signed observation', async () => {
  const runner = createFakeTrustedRunner({ runner_id: 'runner-fixture-2', now: () => '2026-08-01T12:00:00.000Z' });
  const execution = context();
  const proof = await runner.prepareExecution({ execution });
  const launch = await runner.launch({ execution, proof });
  const observation = await runner.observe({ execution, proof, launch, output: { stdout: 'ok\n', stderr: '' } });

  observation.process_boundary.all_descendants_terminated = false;
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
  const execution = context();
  const proof = await runner.prepareExecution({ execution });
  const launch = await runner.launch({ execution, proof });
  const observation = await runner.observe({ execution, proof, launch, output: { stdout: '', stderr: 'still-running' } });

  assert.equal(observation.status, 'signed');
  assert.deepEqual(runner.verifyBoundary(observation), { status: 'blocked', reason: 'trusted-runner-process-boundary-invalid' });
});
