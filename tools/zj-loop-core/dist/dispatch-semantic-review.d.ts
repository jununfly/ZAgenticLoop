import type { DispatchIntent } from './dispatch-intent.js';
export declare const DISPATCH_SEMANTIC_REVIEW_SCHEMA: "zj-loop.dispatch_semantic_review.v1";
export type DispatchSemanticReview = {
    schema: typeof DISPATCH_SEMANTIC_REVIEW_SCHEMA;
    status: 'passed' | 'blocked';
    intent_digest: string;
    network_id: string;
    plan_id: string;
    plan_revision: number;
    task_id: string;
    aggregation_digest: string;
    verification_digest: string;
    review_handoff_digest: string;
    verifier_id: string;
    execution_node_id: string;
    reasons: string[];
    side_effects_executed: false;
    review_digest: string;
};
export type DispatchSemanticReviewInput = {
    intent: DispatchIntent;
    aggregation: {
        status: 'persisted';
        network_id: string;
        plan_id: string;
        plan_revision: number;
        task_id: string;
        aggregation_digest: string;
    };
    verification: {
        status: 'verified';
        network_id: string;
        plan_id: string;
        plan_revision: number;
        task_id: string;
        verifier_id: string;
        execution_node_id: string;
        aggregation_digest: string;
        verification_digest: string;
    };
    review_handoff: {
        status: 'accepted';
        network_id: string;
        plan_id: string;
        plan_revision: number;
        task_id: string;
        aggregation_digest: string;
        verification_digest: string;
        handoff_digest: string;
    };
};
export declare function createDispatchSemanticReview(input: DispatchSemanticReviewInput): DispatchSemanticReview;
export declare function validateDispatchSemanticReview(review: DispatchSemanticReview): {
    status: 'valid' | 'blocked';
    errors: string[];
};
