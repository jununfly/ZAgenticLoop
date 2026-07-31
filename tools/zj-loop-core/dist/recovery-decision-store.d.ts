import { type RecoveryDecision } from './recovery-decision.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export type PersistedRecoveryDecisionResult = {
    schema: 'zj-loop.recovery_decision.v1';
    status: 'accepted' | 'duplicate' | 'conflict' | 'stale-decision';
    lifecycle_status: 'recovery-decision-recorded';
    decision?: RecoveryDecision;
    current_decision?: RecoveryDecision;
    side_effects_executed: false;
    state_revision?: number;
    current_revision: number;
};
export declare function persistRecoveryDecision(input: {
    stateStore: SqliteStateStore;
    network_id: string;
    expected_revision: number;
    decision: RecoveryDecision;
    now: string;
}): Promise<PersistedRecoveryDecisionResult>;
