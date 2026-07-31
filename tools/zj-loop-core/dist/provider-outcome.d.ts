export declare const PROVIDER_OUTCOME_SCHEMA: "zj-loop.provider_outcome.v1";
export type ProviderOutcomeKind = 'confirmed-success' | 'confirmed-failure-no-side-effect' | 'partial-success' | 'outcome-uncertain';
export type ProviderOutcomeEvidence = {
    kind: 'receipt';
    receipt_id: string;
    receipt_digest: string;
} | {
    kind: 'no-side-effect-proof';
    proof_id: string;
    proof_digest: string;
} | {
    kind: 'partial-observation';
    completed_resource_scope: string[];
    incomplete_resource_scope: string[];
    observation_digest: string;
} | {
    kind: 'uncertainty';
    reason: string;
    last_known_fact_digest: string;
    frozen_resource_scope: string[];
    allowed_queries: string[];
    forbidden_actions: string[];
    reconciliation_budget: {
        max_queries: number;
        deadline: string;
        query_scope: string[];
        max_cost: number;
    };
};
export type ProviderOutcome = {
    schema: typeof PROVIDER_OUTCOME_SCHEMA;
    outcome: ProviderOutcomeKind;
    network_id: string;
    event_id: string;
    plan_id: string;
    plan_revision: number;
    execution_id: string;
    task_id: string;
    provider_id: string;
    provider_kind: string;
    provider_request_id: string;
    request_digest: string;
    response_digest: string;
    resource_scope: string[];
    observed_at: string;
    side_effects_executed: boolean;
    evidence: ProviderOutcomeEvidence;
    outcome_digest: string;
};
export type ProviderOutcomeValidation = {
    status: 'valid' | 'blocked';
    errors: string[];
    outcome_digest: string;
};
export declare function createProviderOutcome(input: Omit<ProviderOutcome, 'schema' | 'outcome_digest'> & {
    outcome_digest?: string;
}): ProviderOutcome;
export declare function providerOutcomeDigest(outcome: ProviderOutcome): string;
export declare function validateProviderOutcome(outcome: ProviderOutcome): ProviderOutcomeValidation;
export declare function validateProviderOutcomeBinding(input: {
    outcome: ProviderOutcome;
    expected: Pick<ProviderOutcome, 'network_id' | 'event_id' | 'plan_id' | 'plan_revision' | 'execution_id' | 'task_id' | 'provider_request_id' | 'resource_scope'>;
}): ProviderOutcomeValidation;
