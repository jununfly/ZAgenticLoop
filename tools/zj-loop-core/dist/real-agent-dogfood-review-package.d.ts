import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
export declare const REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_SCHEMA: "zj-loop.real_agent_dogfood_review_package.v1";
export declare const REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_EVIDENCE_SCHEMA: "zj-loop.real_agent_dogfood_review_package_evidence.v1";
export declare const REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_MAX_BYTES: number;
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
    goal: string;
    success_criteria: string[];
    input_manifest_digest: string;
    result_envelope_digest: string;
    receipt_digest: string;
    evidence_refs: Array<{
        schema: 'zj-loop.real_agent_dogfood_scoped_evidence_ref.v1';
        digest: string;
        kind: string;
        execution_id: string;
        attempt: number;
        provenance: string;
    }>;
    findings: Array<{
        finding_id: string;
        severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
        claim: string;
        status: 'verified' | 'warning';
        key_claim: boolean;
        evidence_refs: string[];
        verification_refs: string[];
    }>;
    decisionability: 'ready' | 'blocked';
    package_digest: string;
};
export type RealAgentDogfoodReviewFinding = RealAgentDogfoodReviewPackage['findings'][number];
type ReviewPackageInput = Omit<RealAgentDogfoodReviewPackage, 'schema' | 'package_digest'>;
export declare function isRealAgentDogfoodReviewKeyClaim(finding: Pick<RealAgentDogfoodReviewFinding, 'severity' | 'key_claim'>): boolean;
export declare function getRealAgentDogfoodReviewWarningIds(value: Pick<RealAgentDogfoodReviewPackage, 'findings'>): string[];
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
