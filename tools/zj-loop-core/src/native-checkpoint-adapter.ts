import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import {
  NATIVE_CHECKPOINT_AUTHORITY_INVARIANTS,
  type NativeCheckpointAuthority,
} from './native-checkpoint-fixture.js';

export const NATIVE_CHECKPOINT_ADAPTER_INPUT_SCHEMA = 'zj-loop.native_checkpoint_adapter_input.v1' as const;
export const NATIVE_CHECKPOINT_ADAPTER_OUTPUT_SCHEMA = 'zj-loop.native_checkpoint_adapter_output.v1' as const;

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ID = /^[^\s]{1,256}$/;

export type NativeCheckpointAdapterCheckpointBinding = {
  source_execution_id: string;
  source_task_id: string;
  source_attempt: number;
  source_revision: number;
  checkpoint_namespace: string;
  checkpoint_id: string;
  artifact_ref: string;
  state_digest: string;
};

export type NativeCheckpointAdapterExecutionIdentity = {
  execution_id: string;
  task_id: string;
  attempt: number;
  agent_id: string;
};

export type NativeCheckpointAdapterResume = {
  execution_id: string;
  task_id: string;
  attempt: number;
  agent_id: string;
  checkpoint_namespace: string;
  checkpoint_id: string;
  state_digest: string;
};

export type NativeCheckpointAdapterInput = {
  schema: typeof NATIVE_CHECKPOINT_ADAPTER_INPUT_SCHEMA;
  adapter_id: string;
  network_id: string;
  checkpoint: NativeCheckpointAdapterCheckpointBinding;
  native_execution: NativeCheckpointAdapterExecutionIdentity;
  authority: NativeCheckpointAuthority;
  input_digest: string;
};

export type NativeCheckpointAdapterOutput = {
  schema: typeof NATIVE_CHECKPOINT_ADAPTER_OUTPUT_SCHEMA;
  adapter_id: string;
  network_id: string;
  input_digest: string;
  checkpoint: NativeCheckpointAdapterCheckpointBinding;
  native_execution: NativeCheckpointAdapterExecutionIdentity;
  resume: NativeCheckpointAdapterResume;
  status: 'resumed' | 'duplicate';
  delivery: {
    delivery_id: string;
    disposition: 'accepted' | 'duplicate';
  };
  authority: NativeCheckpointAuthority;
  output_digest: string;
};

export type NativeCheckpointAdapterInputResult =
  | { status: 'valid'; value: NativeCheckpointAdapterInput }
  | { status: 'blocked'; errors: string[] };

export type NativeCheckpointAdapterOutputResult =
  | { status: 'valid'; value: NativeCheckpointAdapterOutput }
  | { status: 'blocked'; errors: string[] };

export type NativeCheckpointAdapterBindingResult =
  | { status: 'valid' }
  | { status: 'blocked'; errors: string[] };

const INPUT_KEYS = ['schema', 'adapter_id', 'network_id', 'checkpoint', 'native_execution', 'authority', 'input_digest'];
const OUTPUT_KEYS = ['schema', 'adapter_id', 'network_id', 'input_digest', 'checkpoint', 'native_execution', 'resume', 'status', 'delivery', 'authority', 'output_digest'];
const CHECKPOINT_KEYS = ['source_execution_id', 'source_task_id', 'source_attempt', 'source_revision', 'checkpoint_namespace', 'checkpoint_id', 'artifact_ref', 'state_digest'];
const EXECUTION_KEYS = ['execution_id', 'task_id', 'attempt', 'agent_id'];
const RESUME_KEYS = ['execution_id', 'task_id', 'attempt', 'agent_id', 'checkpoint_namespace', 'checkpoint_id', 'state_digest'];
const DELIVERY_KEYS = ['delivery_id', 'disposition'];
const AUTHORITY_KEYS = ['resume_admission', 'execution_lifecycle', 'evidence', 'human_acceptance'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}

function id(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

function digest(value: unknown): value is string {
  return typeof value === 'string' && DIGEST.test(value);
}

function positiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1;
}

function canonical(value: unknown): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('native-checkpoint-adapter-canonicalization-invalid');
  return json;
}

function calculateDigest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`;
}

function withoutInputDigest(value: NativeCheckpointAdapterInput): Omit<NativeCheckpointAdapterInput, 'input_digest'> {
  const { input_digest: _, ...unsigned } = value;
  return unsigned;
}

function withoutOutputDigest(value: NativeCheckpointAdapterOutput): Omit<NativeCheckpointAdapterOutput, 'output_digest'> {
  const { output_digest: _, ...unsigned } = value;
  return unsigned;
}

function push(errors: string[], condition: boolean, reason: string): void {
  if (!condition && !errors.includes(reason)) errors.push(reason);
}

function validateAuthority(value: unknown, error: string): string[] {
  if (!isRecord(value) || !exactKeys(value, AUTHORITY_KEYS)) return [error];
  return AUTHORITY_KEYS.every((key) => value[key] === NATIVE_CHECKPOINT_AUTHORITY_INVARIANTS[key]) ? [] : [error];
}

function validateCheckpoint(value: unknown, error: string): string[] {
  if (!isRecord(value) || !exactKeys(value, CHECKPOINT_KEYS)) return [error];
  return id(value.source_execution_id) && id(value.source_task_id) && positiveInteger(value.source_attempt) &&
    positiveInteger(value.source_revision) && id(value.checkpoint_namespace) && id(value.checkpoint_id) &&
    digest(value.artifact_ref) && digest(value.state_digest) ? [] : [error];
}

function validateExecution(value: unknown, error: string): string[] {
  if (!isRecord(value) || !exactKeys(value, EXECUTION_KEYS)) return [error];
  return id(value.execution_id) && id(value.task_id) && positiveInteger(value.attempt) && id(value.agent_id) ? [] : [error];
}

function validateResume(value: unknown, error: string): string[] {
  if (!isRecord(value) || !exactKeys(value, RESUME_KEYS)) return [error];
  return id(value.execution_id) && id(value.task_id) && positiveInteger(value.attempt) && id(value.agent_id) &&
    id(value.checkpoint_namespace) && id(value.checkpoint_id) && digest(value.state_digest) ? [] : [error];
}

function validateInputShape(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value) || !exactKeys(value, INPUT_KEYS)) return ['adapter-input-field-invalid'];
  push(errors, value.schema === NATIVE_CHECKPOINT_ADAPTER_INPUT_SCHEMA, 'adapter-input-schema-invalid');
  push(errors, id(value.adapter_id) && id(value.network_id), 'adapter-input-identity-invalid');
  errors.push(...validateCheckpoint(value.checkpoint, 'adapter-input-checkpoint-invalid'));
  errors.push(...validateExecution(value.native_execution, 'adapter-input-execution-invalid'));
  errors.push(...validateAuthority(value.authority, 'adapter-input-authority-invalid'));
  push(errors, digest(value.input_digest), 'adapter-input-digest-invalid');

  if (isRecord(value.checkpoint) && isRecord(value.native_execution)) {
    push(errors,
      value.checkpoint.source_execution_id === value.native_execution.execution_id &&
      value.checkpoint.source_task_id === value.native_execution.task_id &&
      value.checkpoint.source_attempt === value.native_execution.attempt,
      'adapter-input-execution-binding-invalid');
  }

  if (digest(value.input_digest)) {
    push(errors, value.input_digest === calculateDigest(withoutInputDigest(value as NativeCheckpointAdapterInput)), 'adapter-input-digest-mismatch');
  }
  return [...new Set(errors)];
}

function validateOutputShape(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value) || !exactKeys(value, OUTPUT_KEYS)) return ['adapter-output-field-invalid'];
  push(errors, value.schema === NATIVE_CHECKPOINT_ADAPTER_OUTPUT_SCHEMA, 'adapter-output-schema-invalid');
  push(errors, id(value.adapter_id) && id(value.network_id), 'adapter-output-identity-invalid');
  push(errors, digest(value.input_digest), 'adapter-output-input-digest-invalid');
  errors.push(...validateCheckpoint(value.checkpoint, 'adapter-output-checkpoint-invalid'));
  errors.push(...validateExecution(value.native_execution, 'adapter-output-execution-invalid'));
  errors.push(...validateResume(value.resume, 'adapter-output-resume-invalid'));
  push(errors, value.status === 'resumed' || value.status === 'duplicate', 'adapter-output-status-invalid');

  const delivery = value.delivery;
  if (!isRecord(delivery) || !exactKeys(delivery, DELIVERY_KEYS) || !id(delivery.delivery_id) || !['accepted', 'duplicate'].includes(delivery.disposition as string)) {
    errors.push('adapter-output-delivery-invalid');
  } else {
    push(errors,
      (value.status === 'resumed' && delivery.disposition === 'accepted') ||
      (value.status === 'duplicate' && delivery.disposition === 'duplicate'),
      'adapter-output-delivery-status-mismatch');
  }

  errors.push(...validateAuthority(value.authority, 'adapter-output-authority-invalid'));
  push(errors, digest(value.output_digest), 'adapter-output-digest-invalid');

  if (isRecord(value.checkpoint) && isRecord(value.native_execution)) {
    push(errors,
      value.checkpoint.source_execution_id === value.native_execution.execution_id &&
      value.checkpoint.source_task_id === value.native_execution.task_id &&
      value.checkpoint.source_attempt === value.native_execution.attempt,
      'adapter-output-execution-binding-invalid');
  }
  if (isRecord(value.resume) && isRecord(value.native_execution)) {
    push(errors,
      value.resume.execution_id === value.native_execution.execution_id &&
      value.resume.task_id === value.native_execution.task_id &&
      value.resume.attempt === value.native_execution.attempt &&
      value.resume.agent_id === value.native_execution.agent_id,
      'adapter-output-resume-identity-binding-invalid');
  }
  if (isRecord(value.resume) && isRecord(value.checkpoint)) {
    push(errors,
      value.resume.checkpoint_namespace === value.checkpoint.checkpoint_namespace &&
      value.resume.checkpoint_id === value.checkpoint.checkpoint_id &&
      value.resume.state_digest === value.checkpoint.state_digest,
      'adapter-output-resume-checkpoint-binding-invalid');
  }
  if (digest(value.output_digest)) {
    push(errors, value.output_digest === calculateDigest(withoutOutputDigest(value as NativeCheckpointAdapterOutput)), 'adapter-output-digest-mismatch');
  }
  return [...new Set(errors)];
}

function freezeInput(value: NativeCheckpointAdapterInput): NativeCheckpointAdapterInput {
  return Object.freeze({
    ...value,
    checkpoint: Object.freeze({ ...value.checkpoint }),
    native_execution: Object.freeze({ ...value.native_execution }),
    authority: Object.freeze({ ...value.authority }),
  });
}

function freezeOutput(value: NativeCheckpointAdapterOutput): NativeCheckpointAdapterOutput {
  return Object.freeze({
    ...value,
    checkpoint: Object.freeze({ ...value.checkpoint }),
    native_execution: Object.freeze({ ...value.native_execution }),
    resume: Object.freeze({ ...value.resume }),
    delivery: Object.freeze({ ...value.delivery }),
    authority: Object.freeze({ ...value.authority }),
  });
}

export function nativeCheckpointAdapterInputDigest(value: NativeCheckpointAdapterInput): string {
  return calculateDigest(withoutInputDigest(value));
}

export function nativeCheckpointAdapterOutputDigest(value: NativeCheckpointAdapterOutput): string {
  return calculateDigest(withoutOutputDigest(value));
}

export function createNativeCheckpointAdapterInput(input: Omit<NativeCheckpointAdapterInput, 'schema' | 'input_digest'>): NativeCheckpointAdapterInput {
  const unsigned = { schema: NATIVE_CHECKPOINT_ADAPTER_INPUT_SCHEMA, ...structuredClone(input) } as Omit<NativeCheckpointAdapterInput, 'input_digest'>;
  const value = freezeInput({ ...unsigned, input_digest: calculateDigest(unsigned) });
  const validation = validateNativeCheckpointAdapterInput(value);
  if (validation.status !== 'valid') throw new Error(validation.errors[0]);
  return value;
}

export function createNativeCheckpointAdapterOutput(input: {
  input: NativeCheckpointAdapterInput;
  status: 'resumed' | 'duplicate';
  delivery_id: string;
  resume?: NativeCheckpointAdapterResume;
}): NativeCheckpointAdapterOutput {
  const request = structuredClone(input.input);
  const resume = input.resume ? structuredClone(input.resume) : {
    execution_id: request.native_execution.execution_id,
    task_id: request.native_execution.task_id,
    attempt: request.native_execution.attempt,
    agent_id: request.native_execution.agent_id,
    checkpoint_namespace: request.checkpoint.checkpoint_namespace,
    checkpoint_id: request.checkpoint.checkpoint_id,
    state_digest: request.checkpoint.state_digest,
  };
  const unsigned = {
    schema: NATIVE_CHECKPOINT_ADAPTER_OUTPUT_SCHEMA,
    adapter_id: request.adapter_id,
    network_id: request.network_id,
    input_digest: request.input_digest,
    checkpoint: request.checkpoint,
    native_execution: request.native_execution,
    resume,
    status: input.status,
    delivery: {
      delivery_id: input.delivery_id,
      disposition: input.status === 'resumed' ? 'accepted' : 'duplicate',
    },
    authority: request.authority,
  } as Omit<NativeCheckpointAdapterOutput, 'output_digest'>;
  const value = freezeOutput({ ...unsigned, output_digest: calculateDigest(unsigned) });
  const validation = validateNativeCheckpointAdapterOutput(value);
  if (validation.status !== 'valid') throw new Error(validation.errors[0]);
  const binding = validateNativeCheckpointAdapterBinding({ input: request, output: value });
  if (binding.status !== 'valid') throw new Error(binding.errors[0]);
  return value;
}

export function validateNativeCheckpointAdapterInput(value: unknown): NativeCheckpointAdapterInputResult {
  const errors = validateInputShape(value);
  return errors.length > 0 ? { status: 'blocked', errors } : { status: 'valid', value: value as NativeCheckpointAdapterInput };
}

export function validateNativeCheckpointAdapterOutput(value: unknown): NativeCheckpointAdapterOutputResult {
  const errors = validateOutputShape(value);
  return errors.length > 0 ? { status: 'blocked', errors } : { status: 'valid', value: value as NativeCheckpointAdapterOutput };
}

export function validateNativeCheckpointAdapterBinding(input: {
  input: NativeCheckpointAdapterInput;
  output: NativeCheckpointAdapterOutput;
}): NativeCheckpointAdapterBindingResult {
  const errors: string[] = [];
  const inputValidation = validateNativeCheckpointAdapterInput(input.input);
  const outputValidation = validateNativeCheckpointAdapterOutput(input.output);
  if (inputValidation.status === 'blocked') errors.push(...inputValidation.errors);
  if (outputValidation.status === 'blocked') errors.push(...outputValidation.errors);
  if (inputValidation.status === 'blocked' || !isRecord(input.output)) return { status: 'blocked', errors: [...new Set(errors)] };

  const expected = input.input;
  const actual = input.output;
  push(errors, actual.input_digest === expected.input_digest, 'adapter-output-input-digest-mismatch');
  push(errors, actual.adapter_id === expected.adapter_id, 'adapter-output-adapter-identity-mismatch');
  push(errors, actual.network_id === expected.network_id, 'adapter-output-network-mismatch');
  const actualAuthority: Record<string, unknown> = isRecord(actual.authority) ? actual.authority : {};
  push(errors, actualAuthority.resume_admission === NATIVE_CHECKPOINT_AUTHORITY_INVARIANTS.resume_admission &&
    actualAuthority.execution_lifecycle === NATIVE_CHECKPOINT_AUTHORITY_INVARIANTS.execution_lifecycle &&
    actualAuthority.evidence === NATIVE_CHECKPOINT_AUTHORITY_INVARIANTS.evidence &&
    actualAuthority.human_acceptance === NATIVE_CHECKPOINT_AUTHORITY_INVARIANTS.human_acceptance,
  'adapter-authority-bypass');

  const actualCheckpoint: Record<string, unknown> = isRecord(actual.checkpoint) ? actual.checkpoint : {};
  const checkpointKeys: Array<keyof NativeCheckpointAdapterCheckpointBinding> = [
    'source_execution_id', 'source_task_id', 'source_attempt', 'source_revision',
    'checkpoint_namespace', 'checkpoint_id', 'artifact_ref', 'state_digest',
  ];
  for (const key of checkpointKeys) push(errors, actualCheckpoint[key] === expected.checkpoint[key], `adapter-output-checkpoint-${key}-mismatch`);

  const actualExecution: Record<string, unknown> = isRecord(actual.native_execution) ? actual.native_execution : {};
  const executionKeys: Array<keyof NativeCheckpointAdapterExecutionIdentity> = ['execution_id', 'task_id', 'attempt', 'agent_id'];
  for (const key of executionKeys) push(errors, actualExecution[key] === expected.native_execution[key], `adapter-output-execution-${key}-mismatch`);

  const actualResume: Record<string, unknown> = isRecord(actual.resume) ? actual.resume : {};
  push(errors, actualResume.execution_id === expected.native_execution.execution_id, 'adapter-output-resume-execution-mismatch');
  push(errors, actualResume.task_id === expected.native_execution.task_id, 'adapter-output-resume-task-mismatch');
  push(errors, actualResume.attempt === expected.native_execution.attempt, 'adapter-output-resume-attempt-mismatch');
  push(errors, actualResume.agent_id === expected.native_execution.agent_id, 'adapter-output-resume-agent-mismatch');
  push(errors, actualResume.checkpoint_namespace === expected.checkpoint.checkpoint_namespace, 'adapter-output-resume-namespace-mismatch');
  push(errors, actualResume.checkpoint_id === expected.checkpoint.checkpoint_id, 'adapter-output-resume-checkpoint-mismatch');
  push(errors, actualResume.state_digest === expected.checkpoint.state_digest, 'adapter-output-resume-state-digest-mismatch');

  return errors.length > 0 ? { status: 'blocked', errors } : { status: 'valid' };
}
