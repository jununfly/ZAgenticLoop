import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createNativeCheckpointAdapterInput,
  createNativeCheckpointAdapterOutput,
  nativeCheckpointAdapterInputDigest,
  nativeCheckpointAdapterOutputDigest,
  validateNativeCheckpointAdapterBinding,
  validateNativeCheckpointAdapterInput,
  validateNativeCheckpointAdapterOutput,
} from '../dist/native-checkpoint-adapter.js';

const digest = (digit) => `sha256:${digit.repeat(64)}`;

function request() {
  return createNativeCheckpointAdapterInput({
    adapter_id: 'checkpoint-adapter-langgraph',
    network_id: 'network-checkpoint-adapter-1',
    checkpoint: {
      source_execution_id: 'execution-checkpoint-adapter-1',
      source_task_id: 'task-checkpoint-adapter-1',
      source_attempt: 1,
      source_revision: 9,
      checkpoint_namespace: 'graph:root',
      checkpoint_id: 'checkpoint-adapter-1',
      artifact_ref: digest('1'),
      state_digest: digest('2'),
    },
    native_execution: {
      execution_id: 'execution-checkpoint-adapter-1',
      task_id: 'task-checkpoint-adapter-1',
      attempt: 1,
      agent_id: 'agent-checkpoint-adapter-1',
    },
    authority: {
      resume_admission: 'native-core',
      execution_lifecycle: 'native-core',
      evidence: 'native-core',
      human_acceptance: 'native-core',
    },
  });
}

test('adapter input is provider-neutral, immutable, and bound to native execution metadata', () => {
  const value = request();
  assert.equal(value.schema, 'zj-loop.native_checkpoint_adapter_input.v1');
  assert.equal(value.checkpoint.checkpoint_namespace, 'graph:root');
  assert.equal(value.checkpoint.source_revision, 9);
  assert.equal(value.checkpoint.state_digest, digest('2'));
  assert.equal(value.checkpoint.artifact_ref, digest('1'));
  assert.equal(value.checkpoint.source_execution_id, value.native_execution.execution_id);
  assert.equal(value.checkpoint.source_task_id, value.native_execution.task_id);
  assert.equal(value.checkpoint.source_attempt, value.native_execution.attempt);
  assert.equal(nativeCheckpointAdapterInputDigest(value), value.input_digest);
  assert.equal(validateNativeCheckpointAdapterInput(value).status, 'valid');
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.checkpoint), true);
  assert.equal(Object.isFrozen(value.native_execution), true);
});

test('adapter output binds input digest, source checkpoint, resume identity, and one delivery', () => {
  const input = request();
  const output = createNativeCheckpointAdapterOutput({ input, status: 'resumed', delivery_id: 'delivery-accepted-1' });
  assert.equal(output.schema, 'zj-loop.native_checkpoint_adapter_output.v1');
  assert.equal(output.input_digest, input.input_digest);
  assert.equal(output.checkpoint.source_revision, input.checkpoint.source_revision);
  assert.equal(output.resume.checkpoint_namespace, input.checkpoint.checkpoint_namespace);
  assert.equal(output.resume.checkpoint_id, input.checkpoint.checkpoint_id);
  assert.equal(output.resume.state_digest, input.checkpoint.state_digest);
  assert.equal(output.delivery.disposition, 'accepted');
  assert.equal(nativeCheckpointAdapterOutputDigest(output), output.output_digest);
  assert.equal(validateNativeCheckpointAdapterOutput(output).status, 'valid');
  assert.deepEqual(validateNativeCheckpointAdapterBinding({ input, output }), { status: 'valid' });
});

test('adapter output can report an idempotent duplicate without creating a second execution', () => {
  const input = request();
  const output = createNativeCheckpointAdapterOutput({ input, status: 'duplicate', delivery_id: 'delivery-duplicate-1' });
  assert.equal(output.status, 'duplicate');
  assert.equal(output.delivery.disposition, 'duplicate');
  assert.equal(output.native_execution.execution_id, input.native_execution.execution_id);
  assert.deepEqual(validateNativeCheckpointAdapterBinding({ input, output }), { status: 'valid' });
});

test('binding blocks input digest, source revision, namespace, state, and native identity drift', () => {
  const input = request();
  const output = createNativeCheckpointAdapterOutput({ input, status: 'resumed', delivery_id: 'delivery-accepted-2' });
  const drifted = {
    ...output,
    input_digest: digest('3'),
    checkpoint: {
      ...output.checkpoint,
      source_revision: 10,
      checkpoint_namespace: 'graph:other',
      state_digest: digest('4'),
    },
    native_execution: { ...output.native_execution, execution_id: 'execution-other' },
    output_digest: digest('5'),
  };
  const result = validateNativeCheckpointAdapterBinding({ input, output: drifted });
  assert.equal(result.status, 'blocked');
  assert.ok(result.errors.includes('adapter-output-input-digest-mismatch'));
  assert.ok(result.errors.includes('adapter-output-checkpoint-source_revision-mismatch'));
  assert.ok(result.errors.includes('adapter-output-checkpoint-checkpoint_namespace-mismatch'));
  assert.ok(result.errors.includes('adapter-output-checkpoint-state_digest-mismatch'));
  assert.ok(result.errors.includes('adapter-output-execution-execution_id-mismatch'));
});

test('binding blocks provider authority bypass and digest tampering', () => {
  const input = request();
  const output = createNativeCheckpointAdapterOutput({ input, status: 'resumed', delivery_id: 'delivery-accepted-3' });
  const authorityBypass = {
    ...output,
    authority: { ...output.authority, resume_admission: 'adapter' },
  };
  const result = validateNativeCheckpointAdapterBinding({ input, output: authorityBypass });
  assert.equal(result.status, 'blocked');
  assert.ok(result.errors.includes('adapter-output-authority-invalid'));
  assert.ok(result.errors.includes('adapter-authority-bypass'));
  assert.equal(validateNativeCheckpointAdapterOutput({ ...output, output_digest: digest('f') }).status, 'blocked');
});

test('adapter output rejects status and delivery contradictions', () => {
  const input = request();
  const output = createNativeCheckpointAdapterOutput({ input, status: 'resumed', delivery_id: 'delivery-accepted-4' });
  const contradiction = {
    ...output,
    status: 'duplicate',
    delivery: { ...output.delivery, disposition: 'accepted' },
    output_digest: nativeCheckpointAdapterOutputDigest({
      ...output,
      status: 'duplicate',
      delivery: { ...output.delivery, disposition: 'accepted' },
    }),
  };
  const result = validateNativeCheckpointAdapterOutput(contradiction);
  assert.equal(result.status, 'blocked');
  assert.ok(result.errors.includes('adapter-output-delivery-status-mismatch'));
});

test('malformed adapter envelopes fail closed without throwing from binding validation', () => {
  const input = request();
  const malformed = { schema: 'wrong', output_digest: digest('a') };
  const result = validateNativeCheckpointAdapterBinding({ input, output: malformed });
  assert.equal(result.status, 'blocked');
  assert.ok(result.errors.includes('adapter-output-field-invalid'));
  assert.equal(validateNativeCheckpointAdapterInput({}).status, 'blocked');
});
