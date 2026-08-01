export declare const PROVIDER_REVIEW_PACKAGE_SCHEMA: "zj-loop.provider_review_package.v1";
declare const STATUSES: readonly ["passed", "blocked", "pending"];
export type ProviderReviewFileRef = {
    repository: string;
    commit: string;
    path: string;
    start_line: number;
    end_line: number;
    content_sha256: string;
};
export type ProviderReviewExcerpt = {
    source_artifact_digest: string;
    start_offset: number;
    end_offset: number;
    content: string;
    excerpt_digest: string;
};
export type ProviderReviewPolicyEvidence = {
    policy_version: string;
    rule_ids: string[];
    match_count: number;
    secret_digests: string[];
    sandbox_policy_digest: string;
    network_evidence_digest: string;
};
export type ProviderReviewPackage = {
    schema: typeof PROVIDER_REVIEW_PACKAGE_SCHEMA;
    network_id: string;
    task_id: string;
    execution_id: string;
    attempt: number;
    task_summary: string;
    verification_conditions: string[];
    verification_status: typeof STATUSES[number];
    policy_evidence: ProviderReviewPolicyEvidence;
    file_refs: ProviderReviewFileRef[];
    artifact_refs: string[];
    risks: string[];
    unknowns: string[];
    excerpts: ProviderReviewExcerpt[];
    package_digest: string;
};
export declare function providerReviewPackageDigest(value: Omit<ProviderReviewPackage, 'package_digest'> | ProviderReviewPackage): string;
export declare function validateProviderReviewPackage(value: unknown): {
    status: 'valid' | 'blocked';
    errors: string[];
};
export declare function createProviderReviewPackage(input: Omit<ProviderReviewPackage, 'schema' | 'package_digest'>): ProviderReviewPackage;
export {};
