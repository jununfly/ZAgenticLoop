declare const PROFILE: "provider-neutral-v1";
export type RedactedRealAgentDogfoodEvidence = {
    profile: typeof PROFILE;
    content: string;
    content_digest: string;
    redaction_digest: string;
};
export type RealAgentDogfoodScopedEvidenceRef = {
    schema: 'zj-loop.real_agent_dogfood_scoped_evidence_ref.v1';
    digest: string;
    kind: string;
    execution_id: string;
    attempt: number;
    provenance: string;
};
export type RealAgentDogfoodDigestOnlyReceipt = {
    schema: 'zj-loop.real_agent_dogfood_digest_only_receipt.v1';
    network_id: string;
    dogfood_id: string;
    execution_id: string;
    attempt: number;
    status: 'review-pending' | 'blocked' | 'outcome-uncertain';
    input_commit: string;
    manifest_digest: string;
    provider_proof_digest: string;
    verifier_fact_digest: string;
    review_package_digest: string;
    evidence_refs: RealAgentDogfoodScopedEvidenceRef[];
    receipt_digest: string;
};
export declare function redactRealAgentDogfoodEvidence(input: {
    content: string;
    profile: typeof PROFILE;
}): RedactedRealAgentDogfoodEvidence;
export declare function createRealAgentDogfoodScopedEvidenceRef(input: {
    digest: string;
    kind: string;
    execution_id: string;
    attempt: number;
    provenance: string;
}): RealAgentDogfoodScopedEvidenceRef;
export declare function createRealAgentDogfoodDigestOnlyReceipt(input: Omit<RealAgentDogfoodDigestOnlyReceipt, 'schema' | 'receipt_digest'> | RealAgentDogfoodDigestOnlyReceipt): RealAgentDogfoodDigestOnlyReceipt;
export {};
