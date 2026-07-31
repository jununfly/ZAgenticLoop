import { type ProviderOutcome } from './provider-outcome.js';
export declare const SIMULATED_PROVIDER_RESULT_SCHEMA: "zj-loop.simulated_provider_result.v1";
export type SimulatedProviderScenario = {
    outcome: 'confirmed-success';
    virtual_side_effects: string[];
} | {
    outcome: 'confirmed-failure-no-side-effect';
    failure_reason: string;
} | {
    outcome: 'partial-success';
    completed_resource_scope: string[];
    incomplete_resource_scope: string[];
} | {
    outcome: 'outcome-uncertain';
    reason: string;
    allowed_queries?: string[];
    forbidden_actions?: string[];
    max_queries?: number;
    max_cost?: number;
    deadline: string;
};
export type SimulatedProviderRequest = {
    network_id: string;
    event_id: string;
    plan_id: string;
    plan_revision: number;
    execution_id: string;
    task_id: string;
    provider_request_id: string;
    request_digest: string;
    resource_scope: string[];
    observed_at: string;
    scenario: SimulatedProviderScenario;
};
export type SimulatedProviderResult = {
    schema: typeof SIMULATED_PROVIDER_RESULT_SCHEMA;
    status: 'recorded' | 'duplicate' | 'blocked';
    outcome?: ProviderOutcome;
    provider_kind: 'simulated';
    provider_id: string;
    fixture_state_digest: string;
    virtual_side_effects: string[];
    real_provider_calls: 0;
    side_effects_executed: false;
    reason?: string;
};
export declare function createSimulatedProvider(input: {
    provider_id: string;
    namespace: string;
}): {
    execute(request: SimulatedProviderRequest): Promise<SimulatedProviderResult>;
    reset(): void;
};
