import { type ProviderOutcomeVerification } from './provider-outcome-verification.js';
import { type NativeOpnTracerVerification } from './native-opn-tracer-verification.js';
export declare const REVIEW_HANDOFF_SCHEMA: "zj-loop.review_handoff.v1";
export type ExternalResourceState = {
    resource_id: string;
    last_known_status: string;
    responsible_party: string;
};
export type ReviewHandoffRecord = {
    schema: typeof REVIEW_HANDOFF_SCHEMA;
    status: 'accepted' | 'blocked';
    outcome_digest: string;
    verification_source?: 'native-opn-graph';
    aggregation_digest?: string;
    verification_digest: string;
    network_id: string;
    event_id: string;
    plan_id: string;
    plan_revision: number;
    execution_id: string;
    task_id: string;
    dependencies_closed: boolean;
    remaining_risks: string[];
    external_resource_states: ExternalResourceState[];
    responsible_party: string;
    accepted_at: string;
    event_completed: false;
    task_completed: false;
    side_effects_executed: false;
    handoff_digest: string;
    reason?: 'verification-not-passed' | 'dependencies-not-closed' | 'unresolved-risks';
};
export declare function createReviewHandoff(input: {
    verification: ProviderOutcomeVerification;
    dependencies_closed: boolean;
    remaining_risks: string[];
    external_resource_states: ExternalResourceState[];
    responsible_party: string;
    accepted_at: string;
}): ReviewHandoffRecord;
export declare function createNativeOpnTracerReviewHandoff(input: {
    verification: NativeOpnTracerVerification;
    dependencies_closed: boolean;
    remaining_risks: string[];
    external_resource_states: ExternalResourceState[];
    responsible_party: string;
    accepted_at: string;
}): ReviewHandoffRecord;
export declare function validateReviewHandoff(value: ReviewHandoffRecord): {
    status: 'valid' | 'blocked';
    errors: string[];
};
