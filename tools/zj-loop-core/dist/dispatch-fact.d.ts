import type { DispatchGateResult } from './dispatch-gate.js';
import type { DispatchIntent } from './dispatch-intent.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const TASK_DISPATCHED_SCHEMA: "zj-loop.task_dispatched.v1";
export type TaskDispatchedResult = {
    schema: typeof TASK_DISPATCHED_SCHEMA;
    status: 'recorded' | 'duplicate' | 'conflict' | 'blocked';
    event_id: string;
    side_effects_executed: false;
    revision?: number;
    current_revision?: number;
    reason?: string;
};
export declare function recordTaskDispatched(input: {
    stateStore: SqliteStateStore;
    network_id: string;
    expected_revision: number;
    intent: DispatchIntent;
    gate: DispatchGateResult;
    now: string;
}): Promise<TaskDispatchedResult>;
