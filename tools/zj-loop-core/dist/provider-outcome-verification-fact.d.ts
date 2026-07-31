import { type ProviderOutcomeVerification } from './provider-outcome-verification.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const PROVIDER_VERIFICATION_RECORDED_SCHEMA: "zj-loop.provider_verification_recorded.v1";
export type ProviderVerificationFactResult = {
    schema: typeof PROVIDER_VERIFICATION_RECORDED_SCHEMA;
    status: 'recorded' | 'duplicate' | 'conflict' | 'blocked';
    event_id: string;
    side_effects_executed: false;
    revision?: number;
    current_revision?: number;
    reason?: string;
};
export declare function recordProviderOutcomeVerification(input: {
    stateStore: SqliteStateStore;
    expected_revision: number;
    verification: ProviderOutcomeVerification;
    now: string;
}): Promise<ProviderVerificationFactResult>;
