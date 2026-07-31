import { type ProviderOutcome } from './provider-outcome.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const PROVIDER_OUTCOME_RECORDED_SCHEMA: "zj-loop.provider_outcome_recorded.v1";
export type ProviderOutcomeFactResult = {
    schema: typeof PROVIDER_OUTCOME_RECORDED_SCHEMA;
    status: 'recorded' | 'duplicate' | 'conflict' | 'blocked';
    event_id: string;
    side_effects_executed: false;
    revision?: number;
    current_revision?: number;
    reason?: string;
};
export declare function recordProviderOutcome(input: {
    stateStore: SqliteStateStore;
    expected_revision: number;
    outcome: ProviderOutcome;
    now: string;
}): Promise<ProviderOutcomeFactResult>;
