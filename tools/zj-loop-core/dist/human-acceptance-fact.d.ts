import { type HumanAcceptanceRecord } from './human-acceptance.js';
import type { HumanSignerIdentity } from './human-signer.js';
import type { ReviewHandoffRecord } from './review-handoff.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const HUMAN_ACCEPTANCE_RECORDED_SCHEMA: "zj-loop.human_acceptance_recorded.v1";
export type HumanAcceptanceFactResult = {
    schema: typeof HUMAN_ACCEPTANCE_RECORDED_SCHEMA;
    status: 'recorded' | 'duplicate' | 'conflict' | 'blocked';
    event_id: string;
    side_effects_executed: false;
    revision?: number;
    current_revision?: number;
    reason?: string;
};
export declare function recordHumanAcceptance(input: {
    stateStore: SqliteStateStore;
    expected_revision: number;
    acceptance: HumanAcceptanceRecord;
    identity: HumanSignerIdentity;
    handoff: ReviewHandoffRecord;
    now: string;
}): Promise<HumanAcceptanceFactResult>;
