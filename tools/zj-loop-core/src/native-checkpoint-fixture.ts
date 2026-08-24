import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';

export const NATIVE_CHECKPOINT_FIXTURE_SCHEMA = 'zj-loop.native_checkpoint_fixture.v1' as const;
export const NATIVE_CHECKPOINT_RESUME_ORACLE_SCHEMA = 'zj-loop.native_checkpoint_resume_oracle.v1' as const;

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ID = /^[^\s]{1,256}$/;
const NATIVE_CORE = 'native-core' as const;
export type NativeCheckpointAuthorityOwner = typeof NATIVE_CORE | 'adapter';

export type NativeCheckpointWorkItem = {
  task_id: string;
  execution_id: string;
  attempt: number;
  task_digest: string;
};

export type NativeCheckpointExecutionIdentity = {
  execution_id: string;
  task_id: string;
  attempt: number;
  agent_id: string;
};

export type NativeCheckpointMetadata = {
  checkpoint_id: string;
  source_execution_id: string;
  source_task_id: string;
  source_attempt: number;
  source_revision: number;
  artifact_ref: string;
  state_digest: string;
};

export type NativeCheckpointResume = {
  execution_id: string;
  task_id: string;
  attempt: number;
  agent_id: string;
  checkpoint_id: string;
  state_digest: string;
};

export type NativeCheckpointDelivery = {
  delivery_id: string;
  execution_id: string;
  attempt: number;
  disposition: 'accepted' | 'duplicate';
};

export type NativeCheckpointEvidenceBinding = {
  evidence_id: string;
  evidence_digest: string;
  execution_id: string;
  task_id: string;
  attempt: number;
};

export type NativeCheckpointVerificationBinding = {
  verification_digest: string;
  evidence_digest: string;
  execution_id: string;
  task_id: string;
  attempt: number;
  status: 'passed';
};

export type NativeCheckpointHumanAcceptanceBinding = {
  acceptance_digest: string;
  review_handoff_digest: string;
  verification_digest: string;
  execution_id: string;
  task_id: string;
  attempt: number;
  decision: 'accepted';
  side_effects_executed: false;
};

export type NativeCheckpointAuthority = {
  resume_admission: NativeCheckpointAuthorityOwner;
  execution_lifecycle: NativeCheckpointAuthorityOwner;
  evidence: NativeCheckpointAuthorityOwner;
  human_acceptance: NativeCheckpointAuthorityOwner;
};

/**
 * The native core is the sole authority for these checkpoint boundaries.
 * Adapters may provide observations, but they cannot claim ownership here.
 */
export const NATIVE_CHECKPOINT_AUTHORITY_INVARIANTS = Object.freeze({
  resume_admission: NATIVE_CORE,
  execution_lifecycle: NATIVE_CORE,
  evidence: NATIVE_CORE,
  human_acceptance: NATIVE_CORE,
} as const);

/**
 * The Evidence chain must remain bound to the resumed native execution and
 * must not authorize side effects before Human acceptance.
 */
export const NATIVE_CHECKPOINT_EVIDENCE_INVARIANTS = Object.freeze({
  evidence_execution_binding: Object.freeze(['execution_id', 'task_id', 'attempt'] as const),
  verification_evidence_binding: 'evidence_digest',
  human_acceptance_verification_binding: 'verification_digest',
  human_acceptance_review_handoff_binding: 'review_handoff_digest',
  human_acceptance_side_effects_executed: false,
} as const);

export type NativeCheckpointFixture = {
  schema: typeof NATIVE_CHECKPOINT_FIXTURE_SCHEMA;
  fixture_id: string;
  network_id: string;
  work_item: NativeCheckpointWorkItem;
  execution: NativeCheckpointExecutionIdentity;
  checkpoint: NativeCheckpointMetadata;
  resume: NativeCheckpointResume;
  deliveries: readonly NativeCheckpointDelivery[];
  evidence: NativeCheckpointEvidenceBinding;
  verification: NativeCheckpointVerificationBinding;
  human_acceptance: NativeCheckpointHumanAcceptanceBinding;
  authority: NativeCheckpointAuthority;
  fixture_digest: string;
};

export type NativeCheckpointFixtureInput = Omit<NativeCheckpointFixture, 'schema' | 'fixture_digest'>;

export type NativeCheckpointResumeObservation = {
  checkpoint: NativeCheckpointMetadata;
  resume: NativeCheckpointResume;
  deliveries: readonly NativeCheckpointDelivery[];
  evidence: NativeCheckpointEvidenceBinding;
  verification: NativeCheckpointVerificationBinding;
  human_acceptance: NativeCheckpointHumanAcceptanceBinding;
  authority: NativeCheckpointAuthority;
};

export type NativeCheckpointResumeOracleResult = {
  schema: typeof NATIVE_CHECKPOINT_RESUME_ORACLE_SCHEMA;
  status: 'passed' | 'blocked';
  hard_stop: boolean;
  violations: string[];
  fixture_digest: string;
  oracle_digest: string;
};

const FIXTURE_KEYS = ['schema', 'fixture_id', 'network_id', 'work_item', 'execution', 'checkpoint', 'resume', 'deliveries', 'evidence', 'verification', 'human_acceptance', 'authority', 'fixture_digest'];
const WORK_ITEM_KEYS = ['task_id', 'execution_id', 'attempt', 'task_digest'];
const EXECUTION_KEYS = ['execution_id', 'task_id', 'attempt', 'agent_id'];
const CHECKPOINT_KEYS = ['checkpoint_id', 'source_execution_id', 'source_task_id', 'source_attempt', 'source_revision', 'artifact_ref', 'state_digest'];
const RESUME_KEYS = ['execution_id', 'task_id', 'attempt', 'agent_id', 'checkpoint_id', 'state_digest'];
const DELIVERY_KEYS = ['delivery_id', 'execution_id', 'attempt', 'disposition'];
const EVIDENCE_KEYS = ['evidence_id', 'evidence_digest', 'execution_id', 'task_id', 'attempt'];
const VERIFICATION_KEYS = ['verification_digest', 'evidence_digest', 'execution_id', 'task_id', 'attempt', 'status'];
const ACCEPTANCE_KEYS = ['acceptance_digest', 'review_handoff_digest', 'verification_digest', 'execution_id', 'task_id', 'attempt', 'decision', 'side_effects_executed'];
const AUTHORITY_KEYS = ['resume_admission', 'execution_lifecycle', 'evidence', 'human_acceptance'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
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
  if (typeof json !== 'string') throw new Error('native-checkpoint-canonicalization-invalid');
  return json;
}

function calculateDigest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`;
}

function withoutFixtureDigest(value: NativeCheckpointFixture): Omit<NativeCheckpointFixture, 'fixture_digest'> {
  const { fixture_digest: _, ...unsigned } = value;
  return unsigned;
}

function push(errors: string[], condition: boolean, reason: string): void {
  if (!condition && !errors.includes(reason)) errors.push(reason);
}

function validateFixtureShape(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value) || !exactKeys(value, FIXTURE_KEYS)) return ['fixture-field-invalid'];
  push(errors, value.schema === NATIVE_CHECKPOINT_FIXTURE_SCHEMA, 'fixture-schema-invalid');
  push(errors, id(value.fixture_id) && id(value.network_id), 'fixture-identity-invalid');

  const work = value.work_item;
  if (!isRecord(work) || !exactKeys(work, WORK_ITEM_KEYS)) errors.push('work-item-field-invalid');
  else {
    push(errors, id(work.task_id) && id(work.execution_id) && positiveInteger(work.attempt) && digest(work.task_digest), 'work-item-identity-invalid');
  }

  const execution = value.execution;
  if (!isRecord(execution) || !exactKeys(execution, EXECUTION_KEYS)) errors.push('execution-field-invalid');
  else {
    push(errors, id(execution.execution_id) && id(execution.task_id) && positiveInteger(execution.attempt) && id(execution.agent_id), 'execution-identity-invalid');
  }

  const checkpoint = value.checkpoint;
  if (!isRecord(checkpoint) || !exactKeys(checkpoint, CHECKPOINT_KEYS)) errors.push('checkpoint-field-invalid');
  else {
    push(errors, id(checkpoint.checkpoint_id) && id(checkpoint.source_execution_id) && id(checkpoint.source_task_id) && positiveInteger(checkpoint.source_attempt) && positiveInteger(checkpoint.source_revision) && digest(checkpoint.artifact_ref) && digest(checkpoint.state_digest), 'checkpoint-fields-invalid');
  }

  const resume = value.resume;
  if (!isRecord(resume) || !exactKeys(resume, RESUME_KEYS)) errors.push('resume-field-invalid');
  else {
    push(errors, id(resume.execution_id) && id(resume.task_id) && positiveInteger(resume.attempt) && id(resume.agent_id) && id(resume.checkpoint_id) && digest(resume.state_digest), 'resume-fields-invalid');
  }

  const evidence = value.evidence;
  if (!isRecord(evidence) || !exactKeys(evidence, EVIDENCE_KEYS)) errors.push('evidence-field-invalid');
  else {
    push(errors, id(evidence.evidence_id) && digest(evidence.evidence_digest) && id(evidence.execution_id) && id(evidence.task_id) && positiveInteger(evidence.attempt), 'evidence-fields-invalid');
  }

  const verification = value.verification;
  if (!isRecord(verification) || !exactKeys(verification, VERIFICATION_KEYS)) errors.push('verification-field-invalid');
  else {
    push(errors, digest(verification.verification_digest) && digest(verification.evidence_digest) && id(verification.execution_id) && id(verification.task_id) && positiveInteger(verification.attempt) && verification.status === 'passed', 'verification-fields-invalid');
  }

  const acceptance = value.human_acceptance;
  if (!isRecord(acceptance) || !exactKeys(acceptance, ACCEPTANCE_KEYS)) errors.push('human-acceptance-field-invalid');
  else {
    push(errors, digest(acceptance.acceptance_digest) && digest(acceptance.review_handoff_digest) && digest(acceptance.verification_digest) && id(acceptance.execution_id) && id(acceptance.task_id) && positiveInteger(acceptance.attempt) && acceptance.decision === 'accepted' && acceptance.side_effects_executed === false, 'human-acceptance-fields-invalid');
  }

  const authority = value.authority;
  if (!isRecord(authority) || !exactKeys(authority, AUTHORITY_KEYS)) errors.push('authority-field-invalid');
  else push(errors, AUTHORITY_KEYS.every((key) => authority[key] === NATIVE_CHECKPOINT_AUTHORITY_INVARIANTS[key]), 'authority-invalid');

  const deliveries = value.deliveries;
  if (!Array.isArray(deliveries) || deliveries.length < 2) errors.push('delivery-history-incomplete');
  else {
    const ids = new Set<string>();
    let accepted = 0;
    let duplicate = 0;
    for (const delivery of deliveries) {
      if (!isRecord(delivery) || !exactKeys(delivery, DELIVERY_KEYS) || !id(delivery.delivery_id) || !id(delivery.execution_id) || !positiveInteger(delivery.attempt) || !['accepted', 'duplicate'].includes(delivery.disposition as string)) {
        errors.push('delivery-field-invalid');
        continue;
      }
      if (ids.has(delivery.delivery_id)) errors.push('delivery-id-duplicate');
      ids.add(delivery.delivery_id);
      if (delivery.disposition === 'accepted') accepted += 1;
      else duplicate += 1;
    }
    push(errors, accepted === 1, 'execution-authority-not-unique');
    push(errors, duplicate >= 1, 'duplicate-delivery-not-recorded');
  }

  if (isRecord(work) && isRecord(execution)) {
    push(errors, work.execution_id === execution.execution_id && work.task_id === execution.task_id && work.attempt === execution.attempt, 'work-item-execution-binding-invalid');
  }
  if (Array.isArray(deliveries) && isRecord(execution)) {
    push(errors, deliveries.every((delivery) => isRecord(delivery) && delivery.execution_id === execution.execution_id && delivery.attempt === execution.attempt), 'delivery-execution-binding-invalid');
  }
  if (isRecord(work) && isRecord(execution) && isRecord(checkpoint)) {
    push(errors, checkpoint.source_execution_id === execution.execution_id && checkpoint.source_task_id === work.task_id && checkpoint.source_attempt === work.attempt, 'checkpoint-source-binding-invalid');
  }
  if (isRecord(execution) && isRecord(checkpoint) && isRecord(resume)) {
    push(errors, resume.execution_id === execution.execution_id && resume.task_id === execution.task_id && resume.attempt === execution.attempt && resume.agent_id === execution.agent_id && resume.checkpoint_id === checkpoint.checkpoint_id && resume.state_digest === checkpoint.state_digest, 'resume-binding-invalid');
  }
  if (isRecord(execution) && isRecord(evidence)) {
    push(errors, evidence.execution_id === execution.execution_id && evidence.task_id === execution.task_id && evidence.attempt === execution.attempt, 'evidence-execution-binding-invalid');
  }
  if (isRecord(execution) && isRecord(verification) && isRecord(evidence)) {
    push(errors, verification.execution_id === execution.execution_id && verification.task_id === execution.task_id && verification.attempt === execution.attempt && verification.evidence_digest === evidence.evidence_digest, 'verification-evidence-binding-invalid');
  }
  if (isRecord(execution) && isRecord(acceptance) && isRecord(verification)) {
    push(errors, acceptance.execution_id === execution.execution_id && acceptance.task_id === execution.task_id && acceptance.attempt === execution.attempt && acceptance.verification_digest === verification.verification_digest, 'human-acceptance-verification-binding-invalid');
  }
  if (isRecord(value) && typeof value.fixture_digest === 'string') {
    const unsigned = { ...value } as Omit<NativeCheckpointFixture, 'fixture_digest'>;
    delete (unsigned as Partial<NativeCheckpointFixture>).fixture_digest;
    push(errors, value.fixture_digest === calculateDigest(unsigned), 'fixture-digest-invalid');
  } else errors.push('fixture-digest-invalid');
  return [...new Set(errors)];
}

export function createNativeCheckpointFixture(input: NativeCheckpointFixtureInput): NativeCheckpointFixture {
  const candidate = { schema: NATIVE_CHECKPOINT_FIXTURE_SCHEMA, ...structuredClone(input), fixture_digest: `sha256:${'0'.repeat(64)}` } as NativeCheckpointFixture;
  const errors = validateFixtureShape(candidate);
  if (errors.length > 0 && !(errors.length === 1 && errors[0] === 'fixture-digest-invalid')) throw new Error(errors[0]);
  const unsigned = withoutFixtureDigest(candidate);
  return Object.freeze({
    ...unsigned,
    work_item: Object.freeze({ ...unsigned.work_item }),
    execution: Object.freeze({ ...unsigned.execution }),
    checkpoint: Object.freeze({ ...unsigned.checkpoint }),
    resume: Object.freeze({ ...unsigned.resume }),
    deliveries: Object.freeze(unsigned.deliveries.map((delivery) => Object.freeze({ ...delivery }))),
    evidence: Object.freeze({ ...unsigned.evidence }),
    verification: Object.freeze({ ...unsigned.verification }),
    human_acceptance: Object.freeze({ ...unsigned.human_acceptance }),
    authority: Object.freeze({ ...unsigned.authority }),
    fixture_digest: calculateDigest(unsigned),
  });
}

export function nativeCheckpointFixtureDigest(value: NativeCheckpointFixture): string {
  return calculateDigest(withoutFixtureDigest(value));
}

export function validateNativeCheckpointFixture(value: unknown): { status: 'valid' } | { status: 'blocked'; errors: string[] } {
  const errors = validateFixtureShape(value);
  return errors.length === 0 ? { status: 'valid' } : { status: 'blocked', errors };
}

function compareIdentity(errors: string[], actual: Record<string, unknown>, expected: Record<string, unknown>, prefix: string): void {
  if (actual.execution_id !== expected.execution_id) errors.push(`${prefix}-execution-identity-mismatch`);
  if (actual.task_id !== expected.task_id) errors.push(`${prefix}-task-identity-mismatch`);
  if (actual.attempt !== expected.attempt) errors.push(`${prefix}-attempt-mismatch`);
}

function compareObservation(value: NativeCheckpointFixture, observation: NativeCheckpointResumeObservation): string[] {
  const errors: string[] = [];
  if (!isRecord(observation) || !isRecord(observation.checkpoint) || !isRecord(observation.resume) || !Array.isArray(observation.deliveries) || !isRecord(observation.evidence) || !isRecord(observation.verification) || !isRecord(observation.human_acceptance) || !isRecord(observation.authority)) return ['observation-invalid'];
  const expectedExecution = value.execution as unknown as Record<string, unknown>;
  const expectedCheckpoint = value.checkpoint as unknown as Record<string, unknown>;
  const actualCheckpoint = observation.checkpoint;
  if (actualCheckpoint.checkpoint_id !== expectedCheckpoint.checkpoint_id) errors.push('checkpoint-identity-mismatch');
  if (actualCheckpoint.source_execution_id !== expectedCheckpoint.source_execution_id || actualCheckpoint.source_task_id !== expectedCheckpoint.source_task_id || actualCheckpoint.source_attempt !== expectedCheckpoint.source_attempt) errors.push('checkpoint-source-binding-mismatch');
  if (actualCheckpoint.source_revision !== expectedCheckpoint.source_revision) errors.push('checkpoint-source-revision-mismatch');
  if (actualCheckpoint.artifact_ref !== expectedCheckpoint.artifact_ref) errors.push('checkpoint-artifact-binding-mismatch');
  if (actualCheckpoint.state_digest !== expectedCheckpoint.state_digest) errors.push('checkpoint-state-digest-mismatch');

  const actualResume = observation.resume;
  const expectedResume = value.resume as unknown as Record<string, unknown>;
  if (actualResume.execution_id !== expectedResume.execution_id) errors.push('resume-execution-identity-mismatch');
  if (actualResume.task_id !== expectedResume.task_id) errors.push('resume-task-identity-mismatch');
  if (actualResume.attempt !== expectedResume.attempt) errors.push('resume-attempt-mismatch');
  if (actualResume.agent_id !== expectedResume.agent_id) errors.push('resume-agent-identity-mismatch');
  if (actualResume.checkpoint_id !== expectedResume.checkpoint_id) errors.push('resume-checkpoint-mismatch');
  if (actualResume.state_digest !== expectedResume.state_digest) errors.push('resume-state-digest-mismatch');

  const accepted = observation.deliveries.filter((delivery) => delivery.disposition === 'accepted');
  const acceptedExecutionIds = new Set(accepted.map((delivery) => delivery.execution_id));
  const hasOtherAuthority = observation.deliveries.some((delivery) => delivery.execution_id !== value.execution.execution_id || delivery.attempt !== value.execution.attempt);
  if (hasOtherAuthority || acceptedExecutionIds.size > 1) errors.push('duplicate-created-second-execution-authority');
  else if (accepted.length !== 1 || accepted[0]?.execution_id !== value.execution.execution_id || accepted[0]?.attempt !== value.execution.attempt) errors.push('duplicate-delivery-not-idempotent');
  if (!observation.deliveries.some((delivery) => delivery.disposition === 'duplicate' && delivery.execution_id === value.execution.execution_id && delivery.attempt === value.execution.attempt)) errors.push('duplicate-delivery-not-observed');

  const actualEvidence = observation.evidence;
  const expectedEvidence = value.evidence as unknown as Record<string, unknown>;
  if (actualEvidence.evidence_digest !== expectedEvidence.evidence_digest) errors.push('evidence-digest-mismatch');
  if (actualEvidence.execution_id !== expectedExecution.execution_id) errors.push('evidence-execution-binding-mismatch');
  if (actualEvidence.task_id !== expectedExecution.task_id) errors.push('evidence-task-binding-mismatch');
  if (actualEvidence.attempt !== expectedExecution.attempt) errors.push('evidence-attempt-binding-mismatch');

  const actualVerification = observation.verification;
  const expectedVerification = value.verification as unknown as Record<string, unknown>;
  if (actualVerification.verification_digest !== expectedVerification.verification_digest) errors.push('verification-digest-mismatch');
  if (actualVerification.evidence_digest !== actualEvidence.evidence_digest) errors.push('verification-evidence-binding-mismatch');
  if (actualVerification.evidence_digest !== expectedEvidence.evidence_digest) errors.push('verification-evidence-binding-mismatch');
  compareIdentity(errors, actualVerification, expectedExecution, 'verification');
  if (actualVerification.status !== 'passed') errors.push('verification-not-passed');

  const actualAcceptance = observation.human_acceptance;
  const expectedAcceptance = value.human_acceptance as unknown as Record<string, unknown>;
  if (actualAcceptance.acceptance_digest !== expectedAcceptance.acceptance_digest) errors.push('human-acceptance-digest-mismatch');
  if (actualAcceptance.review_handoff_digest !== expectedAcceptance.review_handoff_digest) errors.push('human-acceptance-review-handoff-binding-mismatch');
  if (actualAcceptance.verification_digest !== actualVerification.verification_digest || actualAcceptance.verification_digest !== expectedVerification.verification_digest) errors.push('human-acceptance-verification-binding-mismatch');
  compareIdentity(errors, actualAcceptance, expectedExecution, 'human-acceptance');
  if (actualAcceptance.decision !== 'accepted') errors.push('human-acceptance-not-accepted');
  if (actualAcceptance.side_effects_executed !== false) errors.push('human-acceptance-side-effects-invalid');

  const actualAuthority = observation.authority;
  if (actualAuthority.resume_admission !== NATIVE_CORE || actualAuthority.execution_lifecycle !== NATIVE_CORE || actualAuthority.evidence !== NATIVE_CORE || actualAuthority.human_acceptance !== NATIVE_CORE) errors.push('authority-bypass');
  return [...new Set(errors)];
}

function oracleDigest(value: Omit<NativeCheckpointResumeOracleResult, 'oracle_digest'>): string {
  return calculateDigest(value);
}

export function evaluateNativeCheckpointResumeOracle(input: { fixture: NativeCheckpointFixture; observation: NativeCheckpointResumeObservation }): NativeCheckpointResumeOracleResult {
  const fixtureValidation = validateNativeCheckpointFixture(input.fixture);
  const violations = fixtureValidation.status === 'valid' ? compareObservation(input.fixture, input.observation) : ['fixture-invalid'];
  const unsigned = {
    schema: NATIVE_CHECKPOINT_RESUME_ORACLE_SCHEMA,
    status: violations.length === 0 ? 'passed' as const : 'blocked' as const,
    hard_stop: violations.length > 0,
    violations,
    fixture_digest: input.fixture.fixture_digest,
  };
  return { ...unsigned, oracle_digest: oracleDigest(unsigned) };
}
