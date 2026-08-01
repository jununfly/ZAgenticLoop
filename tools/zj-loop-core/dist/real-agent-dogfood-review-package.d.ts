import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
export declare const REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_SCHEMA: "zj-loop.real_agent_dogfood_review_package.v1";
export declare const REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_EVIDENCE_SCHEMA: "zj-loop.real_agent_dogfood_review_package_evidence.v1";
declare const DECISIONS: readonly ["accept", "reject", "request-revision"];
export type RealAgentDogfoodReviewPackage = {
    schema: typeof REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_SCHEMA;
    network_id: string;
    dogfood_id: string;
    execution_id: string;
    attempt: number;
    lifecycle_revision: number;
    lifecycle_digest: string;
    provider_id: string;
    provider_fact_digest: string;
    verification_digest: string;
    worktree_path: string;
    base_commit: string;
    branch: string;
    risks: string[];
    available_decisions: typeof DECISIONS;
    generated_at: string;
    package_digest: string;
};
type ReviewPackageInput = Omit<RealAgentDogfoodReviewPackage, 'schema' | 'package_digest'>;
export declare function createRealAgentDogfoodReviewPackage(input: ReviewPackageInput): RealAgentDogfoodReviewPackage;
export declare function validateRealAgentDogfoodReviewPackage(value: RealAgentDogfoodReviewPackage): {
    status: 'valid' | 'blocked';
    errors: string[];
};
export declare function persistRealAgentDogfoodReviewPackage(input: {
    evidenceStore: ContentAddressedEvidenceStore;
    review_package: RealAgentDogfoodReviewPackage;
}): Promise<{
    evidence_digest: string;
    package_digest: string;
    size: number;
    path: string;
}>;
export declare function readRealAgentDogfoodReviewPackage(input: {
    evidenceStore: ContentAddressedEvidenceStore;
    evidence_digest: string;
    actor: string;
}): Promise<RealAgentDogfoodReviewPackage>;
export {};
