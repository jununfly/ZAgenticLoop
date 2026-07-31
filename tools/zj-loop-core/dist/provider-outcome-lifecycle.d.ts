import { type ProviderOutcome } from './provider-outcome.js';
export declare const PROVIDER_OUTCOME_LIFECYCLE_SCHEMA: "zj-loop.provider_outcome_lifecycle.v1";
export type ProviderOutcomeLifecycleStatus = 'verification-required' | 'recovery-required' | 'needs-human-grill' | 'blocked';
export type ProviderOutcomeLifecycleResult = {
    schema: typeof PROVIDER_OUTCOME_LIFECYCLE_SCHEMA;
    status: ProviderOutcomeLifecycleStatus | 'blocked-input';
    outcome_digest: string;
    task_completed: false;
    resources_frozen: boolean;
    next_action: 'independent-verification' | 'create-recovery-decision' | 'submit-human-grill' | 'bounded-reconciliation-or-human-grill';
    side_effects_executed: false;
    reason?: string;
};
export declare function mapProviderOutcomeLifecycle(outcome: ProviderOutcome): ProviderOutcomeLifecycleResult;
