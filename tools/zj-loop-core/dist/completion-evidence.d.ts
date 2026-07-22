export declare const COMPLETION_EVIDENCE_SCHEMA = "zj-loop.completion_evidence.v1";
export declare const COMPLETION_STATUSES: readonly ["planned", "executed_to_review_artifact", "hard_stopped", "duplicate", "resume"];
export type CompletionStatus = typeof COMPLETION_STATUSES[number];
export type CompletionEvidenceRecord = {
    schema: typeof COMPLETION_EVIDENCE_SCHEMA;
    orchestration_id: string;
    signal_id: string;
    route_id: string;
    request_id: string;
    carrier: {
        kind: string;
        id?: string;
        url?: string;
    };
    consumer_id: string;
    current_head_sha: string;
    status: CompletionStatus;
    review_artifact: {
        kind: string;
        path?: string;
        schema?: string;
    } | null;
    stop_reason: string | null;
    side_effects_executed: boolean;
    evidence_refs: Array<{
        kind: string;
        path?: string;
        url?: string;
    }>;
    resume_anchor: string | null;
    provenance: Record<string, unknown>;
    duplicate_of?: string;
};
export type CompletionEvidenceValidation = {
    ok: boolean;
    status: 'valid' | 'hard_stop';
    errors: string[];
    side_effects_executed: boolean;
    evidence?: CompletionEvidenceRecord;
};
export declare function buildCompletionEvidence(input: {
    orchestrationId: string;
    signalId: string;
    routeId: string;
    requestId: string;
    carrier: CompletionEvidenceRecord['carrier'];
    consumerId: string;
    currentHeadSha: string;
    status: CompletionStatus;
    reviewArtifact: CompletionEvidenceRecord['review_artifact'];
    stopReason?: string | null;
    resumeAnchor?: string | null;
    evidenceRefs: CompletionEvidenceRecord['evidence_refs'];
    provenance: Record<string, unknown>;
    sideEffectsExecuted?: boolean;
    duplicateOf?: string;
}): CompletionEvidenceRecord;
type CompletionValidationOptions = {
    expected?: Partial<Pick<CompletionEvidenceRecord, 'orchestration_id' | 'signal_id' | 'route_id' | 'request_id' | 'consumer_id' | 'current_head_sha'>>;
    allowSideEffects?: boolean;
};
export declare function validateCompletionEvidence(value: unknown, options?: CompletionValidationOptions): CompletionEvidenceValidation;
export {};
