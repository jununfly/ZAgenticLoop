export declare const NATIVE_CHECKPOINT_FIXTURE_SCHEMA: "zj-loop.native_checkpoint_fixture.v1";
export declare const NATIVE_CHECKPOINT_RESUME_ORACLE_SCHEMA: "zj-loop.native_checkpoint_resume_oracle.v1";
declare const NATIVE_CORE: "native-core";
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
export declare const NATIVE_CHECKPOINT_AUTHORITY_INVARIANTS: Readonly<{
    readonly resume_admission: "native-core";
    readonly execution_lifecycle: "native-core";
    readonly evidence: "native-core";
    readonly human_acceptance: "native-core";
}>;
/**
 * The Evidence chain must remain bound to the resumed native execution and
 * must not authorize side effects before Human acceptance.
 */
export declare const NATIVE_CHECKPOINT_EVIDENCE_INVARIANTS: Readonly<{
    readonly evidence_execution_binding: readonly ["execution_id", "task_id", "attempt"];
    readonly verification_evidence_binding: "evidence_digest";
    readonly human_acceptance_verification_binding: "verification_digest";
    readonly human_acceptance_review_handoff_binding: "review_handoff_digest";
    readonly human_acceptance_side_effects_executed: false;
}>;
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
export declare function createNativeCheckpointFixture(input: NativeCheckpointFixtureInput): NativeCheckpointFixture;
export declare function nativeCheckpointFixtureDigest(value: NativeCheckpointFixture): string;
export declare function validateNativeCheckpointFixture(value: unknown): {
    status: 'valid';
} | {
    status: 'blocked';
    errors: string[];
};
export declare function evaluateNativeCheckpointResumeOracle(input: {
    fixture: NativeCheckpointFixture;
    observation: NativeCheckpointResumeObservation;
}): NativeCheckpointResumeOracleResult;
export {};
