import { type DispatchIntent } from './dispatch-intent.js';
import { type DispatchSemanticReview } from './dispatch-semantic-review.js';
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
    now?: string;
    claim: {
        status: 'claimed';
        network_id: string;
        plan_digest: string;
        plan_revision: number;
        grant_digest: string;
        task_id: string;
        node_id: string;
    };
    revalidation: {
        status: 'passed';
        network_id: string;
        plan_id: string;
        plan_digest: string;
        plan_revision: number;
        task_id: string;
        node_id: string;
        grant_digest: string;
    };
    verification?: {
        status: 'verified';
        network_id: string;
        plan_id: string;
        task_id: string;
        verifier_id: string;
        plan_digest: string;
        plan_revision: number;
        aggregation_digest: string;
        verification_digest: string;
        review_handoff_status: 'accepted';
        review_handoff_digest?: string;
    };
    semantic_review?: DispatchSemanticReview;
    human_approval?: {
        status: 'accepted';
        network_id?: string;
        plan_id?: string;
        task_id?: string;
        plan_digest: string;
        plan_revision: number;
    };
}): DispatchGateResult;
