import type { HumanGrill, HumanGrillDecision, HumanGrillDecisionInput } from './human-grill.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export type PersistedHumanGrillDecisionResult = {
    schema: 'zj-loop.human_grill_decision.v1';
    status: 'accepted' | 'duplicate' | 'conflict' | 'stale-decision';
    lifecycle_status: 'decision-recorded';
    decision?: HumanGrillDecision;
    current_decision?: HumanGrillDecision;
    side_effects_executed: false;
    state_revision?: number;
    current_revision: number;
};
export declare function persistHumanGrillDecision(input: {
    stateStore: SqliteStateStore;
    network_id: string;
    expected_revision: number;
    grill: HumanGrill;
    decision: HumanGrillDecisionInput;
    now: string;
}): Promise<PersistedHumanGrillDecisionResult>;
