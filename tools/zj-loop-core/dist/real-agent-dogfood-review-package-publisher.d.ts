import type { SqliteStateStore } from './sqlite-state-store.js';
import { type RealAgentDogfoodReviewPackage } from './real-agent-dogfood-review-package.js';
export declare const REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_AGGREGATE_TYPE: "real-agent-dogfood-review-package";
export declare const REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_PUBLISHED_SCHEMA: "zj-loop.real_agent_dogfood_review_package_published.v1";
export type RealAgentDogfoodReviewPackagePublishedEvent = {
    event_id: string;
    aggregate_type: typeof REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_AGGREGATE_TYPE;
    aggregate_id: string;
    event_type: 'real-agent-dogfood-review-package.published';
    occurred_at: string;
    payload: {
        schema: typeof REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_PUBLISHED_SCHEMA;
        network_id: string;
        dogfood_id: string;
        execution_id: string;
        attempt: number;
        lifecycle_revision: number;
        lifecycle_digest: string;
        package_digest: string;
        evidence_digest: string;
    };
};
type PublicationResult = {
    status: 'recorded' | 'duplicate' | 'conflict';
    aggregate_id: string;
    revision?: number;
    current_revision: number;
    reason?: string;
};
export declare function publishRealAgentDogfoodReviewPackage(input: {
    stateStore: SqliteStateStore;
    review_package: RealAgentDogfoodReviewPackage;
    evidence_digest: string;
    expected_revision: number;
    now?: string;
}): Promise<PublicationResult>;
export {};
