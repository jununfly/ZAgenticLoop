import { type DispatchIntent } from './dispatch-intent.js';
export declare const DISPATCH_GATE_SCHEMA: "zj-loop.dispatch_gate.v1";
export type DispatchGateError = {
    code: string;
    path: string;
    message: string;
    blocking: true;
};
export type DispatchGateResult = {
    schema: typeof DISPATCH_GATE_SCHEMA;
    status: 'dispatch-ready' | 'blocked';
    side_effects_executed: false;
    intent_digest: string;
    errors: DispatchGateError[];
};
export declare function evaluateDispatchGate(input: {
    intent: DispatchIntent;
    claim: {
        status: 'claimed';
        plan_digest: string;
        plan_revision: number;
        task_id: string;
        node_id: string;
    };
    revalidation: {
        status: 'passed';
        plan_digest: string;
        plan_revision: number;
    };
    verification?: {
        status: 'verified';
        plan_digest: string;
        plan_revision: number;
        review_handoff_status: 'accepted';
    };
    human_approval?: {
        status: 'accepted';
        plan_digest: string;
        plan_revision: number;
    };
}): DispatchGateResult;
