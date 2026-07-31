import { type ProviderOutcome } from './provider-outcome.js';
export declare const PROVIDER_OUTCOME_VERIFICATION_SCHEMA: "zj-loop.provider_outcome_verification.v1";
export type ProviderOutcomeVerification = {
    schema: typeof PROVIDER_OUTCOME_VERIFICATION_SCHEMA;
    status: 'passed' | 'failed' | 'blocked';
    outcome_digest: string;
    network_id: string;
    event_id: string;
    plan_id: string;
    plan_revision: number;
    execution_id: string;
    task_id: string;
    verifier_id: string;
    verification_conditions: string[];
    satisfied_conditions: string[];
    failed_conditions: string[];
    evidence_digest: string;
    checked_at: string;
    review_handoff_required: true;
    provider_retry_allowed: false;
    side_effects_executed: false;
    verification_digest: string;
};
export declare function createProviderOutcomeVerification(input: {
    outcome: ProviderOutcome;
    verifier_id: string;
    verification_conditions: string[];
    satisfied_conditions: string[];
    failed_conditions: string[];
    evidence_digest: string;
    checked_at: string;
}): ProviderOutcomeVerification;
export declare function validateProviderOutcomeVerification(value: ProviderOutcomeVerification): {
    status: 'valid' | 'blocked';
    errors: string[];
};
