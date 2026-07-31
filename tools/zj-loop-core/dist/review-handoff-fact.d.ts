import { type ReviewHandoffRecord } from './review-handoff.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const REVIEW_HANDOFF_RECORDED_SCHEMA: "zj-loop.review_handoff_recorded.v1";
export type ReviewHandoffFactResult = {
    schema: typeof REVIEW_HANDOFF_RECORDED_SCHEMA;
    status: 'recorded' | 'duplicate' | 'conflict' | 'blocked';
    event_id: string;
    side_effects_executed: false;
    revision?: number;
    current_revision?: number;
    reason?: string;
};
export declare function recordReviewHandoff(input: {
    stateStore: SqliteStateStore;
    expected_revision: number;
    handoff: ReviewHandoffRecord;
    now: string;
}): Promise<ReviewHandoffFactResult>;
