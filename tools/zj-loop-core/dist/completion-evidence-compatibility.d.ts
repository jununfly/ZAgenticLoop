export declare const COMPLETION_EVIDENCE_COMPATIBILITY_SCHEMA = "zj-loop.completion_evidence_compatibility.v1";
export declare const COMPLETION_EVIDENCE_COMPATIBILITY_DIMENSIONS: readonly ["target_digest", "route_table_digest", "route_digest", "adapter_digest", "runner_digest", "workflow_digest", "protocol_digest", "verification_digest"];
export type CompletionEvidenceCompatibilityDimension = typeof COMPLETION_EVIDENCE_COMPATIBILITY_DIMENSIONS[number];
export type CompletionEvidenceCompatibilityFingerprint = {
    schema: typeof COMPLETION_EVIDENCE_COMPATIBILITY_SCHEMA;
    target_id: string;
    route_id: string;
    adapter_id: string;
    dimensions: Record<CompletionEvidenceCompatibilityDimension, string>;
    fingerprint: string;
};
export type CompletionEvidenceFreshness = {
    schema: 'zj-loop.completion_evidence_freshness.v1';
    status: 'compatible' | 'stale' | 'missing';
    reason: 'compatible' | 'missing-fingerprint' | 'invalid-fingerprint' | 'relevant-change';
    changed_dimensions: CompletionEvidenceCompatibilityDimension[];
    side_effects_executed: false;
};
export type CompletionEvidenceCompatibilityInput = {
    targetId: string;
    routeId: string;
    adapterId: string;
} & Record<CompletionEvidenceCompatibilityDimension, string>;
export declare function buildCompletionEvidenceCompatibility(input: CompletionEvidenceCompatibilityInput): CompletionEvidenceCompatibilityFingerprint;
export declare function deriveCompletionEvidenceFreshness(recorded: CompletionEvidenceCompatibilityFingerprint | undefined, current: CompletionEvidenceCompatibilityFingerprint): CompletionEvidenceFreshness;
