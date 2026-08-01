import { type HumanSigner, type HumanSignerIdentity, type HumanSignature } from './human-signer.js';
import { type RealAgentDogfoodReviewPackage } from './real-agent-dogfood-review-package.js';
import { type RealAgentDogfoodLifecycle, type RealAgentDogfoodEvent } from './real-agent-dogfood-lifecycle.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const REAL_AGENT_DOGFOOD_REVIEW_DECISION_SCHEMA: "zj-loop.real_agent_dogfood_review_decision.v1";
export type RealAgentDogfoodReviewDecision = {
    schema: typeof REAL_AGENT_DOGFOOD_REVIEW_DECISION_SCHEMA;
    package_digest: string;
    lifecycle_revision: number;
    human_id: string;
    signer_fingerprint: string;
    decision: 'accept' | 'reject' | 'request-revision';
    comment: string;
    decided_at: string;
    canonical_payload_digest: string;
    signature: HumanSignature;
    side_effects_executed: false;
};
export declare function createRealAgentDogfoodReviewDecision(input: {
    signer: HumanSigner;
    review_package: RealAgentDogfoodReviewPackage;
    decision: RealAgentDogfoodReviewDecision['decision'];
    comment: string;
    decided_at: string;
}): Promise<RealAgentDogfoodReviewDecision>;
export declare function validateRealAgentDogfoodReviewDecision(input: {
    decision: RealAgentDogfoodReviewDecision;
    identity: HumanSignerIdentity;
    review_package: RealAgentDogfoodReviewPackage;
}): {
    status: 'valid' | 'blocked';
    errors: string[];
};
export declare function recordRealAgentDogfoodReviewDecision(input: {
    stateStore: SqliteStateStore;
    lifecycle: RealAgentDogfoodLifecycle;
    review_package: RealAgentDogfoodReviewPackage;
    decision: RealAgentDogfoodReviewDecision;
    identity: HumanSignerIdentity;
    expected_revision: number;
    now?: string;
}): Promise<{
    status: 'accepted' | 'rejected' | 'request-revision';
    revision: number;
    event: RealAgentDogfoodEvent;
}>;
