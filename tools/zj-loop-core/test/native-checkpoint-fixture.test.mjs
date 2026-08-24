import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createNativeCheckpointFixture,
  evaluateNativeCheckpointResumeOracle,
  NATIVE_CHECKPOINT_AUTHORITY_INVARIANTS,
  NATIVE_CHECKPOINT_EVIDENCE_INVARIANTS,
  nativeCheckpointFixtureDigest,
  validateNativeCheckpointFixture,
} from '../dist/native-checkpoint-fixture.js';

const digest = (digit) => `sha256:${digit.repeat(64)}`;

function fixture() {
  return createNativeCheckpointFixture({
    fixture_id: 'native-checkpoint-fixture-1',
    network_id: 'network-checkpoint-1',
    work_item: {
      task_id: 'task-checkpoint-1',
      execution_id: 'execution-checkpoint-1',
      attempt: 1,
      task_digest: digest('1'),
    },
    execution: {
      execution_id: 'execution-checkpoint-1',
      task_id: 'task-checkpoint-1',
      attempt: 1,
      agent_id: 'agent-checkpoint-1',
    },
    checkpoint: {
      checkpoint_id: 'checkpoint-1',
      source_execution_id: 'execution-checkpoint-1',
      source_task_id: 'task-checkpoint-1',
      source_attempt: 1,
      source_revision: 7,
      artifact_ref: digest('2'),
      state_digest: digest('3'),
    },
    resume: {
      execution_id: 'execution-checkpoint-1',
      task_id: 'task-checkpoint-1',
      attempt: 1,
      agent_id: 'agent-checkpoint-1',
      checkpoint_id: 'checkpoint-1',
      state_digest: digest('3'),
    },
    deliveries: [
      { delivery_id: 'delivery-accepted-1', execution_id: 'execution-checkpoint-1', attempt: 1, disposition: 'accepted' },
      { delivery_id: 'delivery-duplicate-1', execution_id: 'execution-checkpoint-1', attempt: 1, disposition: 'duplicate' },
    ],
    evidence: {
      evidence_id: 'evidence-checkpoint-1',
      evidence_digest: digest('4'),
      execution_id: 'execution-checkpoint-1',
      task_id: 'task-checkpoint-1',
      attempt: 1,
    },
    verification: {
      verification_digest: digest('5'),
      evidence_digest: digest('4'),
      execution_id: 'execution-checkpoint-1',
      task_id: 'task-checkpoint-1',
      attempt: 1,
      status: 'passed',
    },
    human_acceptance: {
      acceptance_digest: digest('6'),
      review_handoff_digest: digest('7'),
      verification_digest: digest('5'),
      execution_id: 'execution-checkpoint-1',
      task_id: 'task-checkpoint-1',
      attempt: 1,
      decision: 'accepted',
      side_effects_executed: false,
    },
    authority: {
      resume_admission: 'native-core',
      execution_lifecycle: 'native-core',
      evidence: 'native-core',
      human_acceptance: 'native-core',
    },
  });
}

function observation(value) {
  return {
    checkpoint: value.checkpoint,
    resume: value.resume,
    deliveries: value.deliveries,
    evidence: value.evidence,
    verification: value.verification,
    human_acceptance: value.human_acceptance,
    authority: value.authority,
  };
}

test('native checkpoint fixture exposes a deterministic, provider-neutral baseline', () => {
  const value = fixture();
  assert.equal(value.schema, 'zj-loop.native_checkpoint_fixture.v1');
  assert.equal(value.checkpoint.state_digest, digest('3'));
  assert.equal(value.resume.execution_id, value.execution.execution_id);
  assert.equal(value.resume.attempt, value.execution.attempt);
  assert.equal(validateNativeCheckpointFixture(value).status, 'valid');
  assert.equal(nativeCheckpointFixtureDigest(value), value.fixture_digest);
});

test('native checkpoint contract records authority and Evidence invariants for adapters', () => {
  const value = fixture();
  assert.deepEqual(value.authority, NATIVE_CHECKPOINT_AUTHORITY_INVARIANTS);
  assert.deepEqual(NATIVE_CHECKPOINT_EVIDENCE_INVARIANTS.evidence_execution_binding, ['execution_id', 'task_id', 'attempt']);
  assert.equal(value.evidence.execution_id, value.execution.execution_id);
  assert.equal(value.evidence.task_id, value.execution.task_id);
  assert.equal(value.evidence.attempt, value.execution.attempt);
  assert.equal(value.verification.evidence_digest, value.evidence.evidence_digest);
  assert.equal(value.human_acceptance.verification_digest, value.verification.verification_digest);
  assert.equal(value.human_acceptance.review_handoff_digest, digest('7'));
  assert.equal(value.human_acceptance.side_effects_executed, NATIVE_CHECKPOINT_EVIDENCE_INVARIANTS.human_acceptance_side_effects_executed);
});

test('resume oracle passes the native identity, duplicate, Evidence, and Human acceptance baseline', () => {
  const value = fixture();
  const result = evaluateNativeCheckpointResumeOracle({ fixture: value, observation: observation(value) });
  assert.equal(result.schema, 'zj-loop.native_checkpoint_resume_oracle.v1');
  assert.equal(result.status, 'passed');
  assert.equal(result.hard_stop, false);
  assert.deepEqual(result.violations, []);
  assert.equal(result.fixture_digest, value.fixture_digest);
  assert.match(result.oracle_digest, /^sha256:[0-9a-f]{64}$/);
});

test('resume oracle hard-stops when resume changes native execution identity or checkpoint state', () => {
  const value = fixture();
  const result = evaluateNativeCheckpointResumeOracle({
    fixture: value,
    observation: {
      ...observation(value),
      resume: { ...value.resume, execution_id: 'execution-other', attempt: 2, state_digest: digest('8') },
    },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.hard_stop, true);
  assert.deepEqual(result.violations, [
    'resume-execution-identity-mismatch',
    'resume-attempt-mismatch',
    'resume-state-digest-mismatch',
  ]);
});

test('resume oracle rejects duplicate delivery that creates a second execution authority', () => {
  const value = fixture();
  const result = evaluateNativeCheckpointResumeOracle({
    fixture: value,
    observation: {
      ...observation(value),
      deliveries: [...value.deliveries, { delivery_id: 'delivery-second-authority', execution_id: 'execution-other', attempt: 1, disposition: 'accepted' }],
    },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.hard_stop, true);
  assert.deepEqual(result.violations, ['duplicate-created-second-execution-authority']);
});

test('resume oracle rejects Evidence or Human acceptance that no longer binds to the resumed execution', () => {
  const value = fixture();
  const result = evaluateNativeCheckpointResumeOracle({
    fixture: value,
    observation: {
      ...observation(value),
      evidence: { ...value.evidence, execution_id: 'execution-other' },
      verification: { ...value.verification, evidence_digest: digest('8') },
      human_acceptance: { ...value.human_acceptance, verification_digest: digest('9') },
    },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.hard_stop, true);
  assert.deepEqual(result.violations, [
    'evidence-execution-binding-mismatch',
    'verification-evidence-binding-mismatch',
    'human-acceptance-verification-binding-mismatch',
  ]);
});

test('resume oracle keeps Human acceptance bound to the exact Review Handoff', () => {
  const value = fixture();
  const result = evaluateNativeCheckpointResumeOracle({
    fixture: value,
    observation: {
      ...observation(value),
      human_acceptance: { ...value.human_acceptance, review_handoff_digest: digest('8') },
    },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.hard_stop, true);
  assert.deepEqual(result.violations, ['human-acceptance-review-handoff-binding-mismatch']);
});

test('resume oracle rejects provider authority bypass and tampered fixture digests', () => {
  const value = fixture();
  const result = evaluateNativeCheckpointResumeOracle({
    fixture: value,
    observation: {
      ...observation(value),
      authority: { ...value.authority, resume_admission: 'adapter' },
    },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.hard_stop, true);
  assert.deepEqual(result.violations, ['authority-bypass']);
  assert.equal(validateNativeCheckpointFixture({ ...value, fixture_digest: digest('f') }).status, 'blocked');
});
