export declare const LIVE_RUNNER_EVIDENCE_SCHEMA = "zj-loop.live_runner_evidence.v1";
export declare const RUNNER_EVIDENCE_STATUSES: readonly ["completed", "skipped", "failed", "escalated"];
export declare const COMPLETION_FORMS_BY_KIND: {
    readonly 'fix-runner': readonly ["repair-pr", "escalation-issue"];
    readonly 'draft-consumer': readonly ["draft-pr", "draft-evidence", "escalation-issue"];
    readonly 'cleanup-consumer': readonly ["cleanup-done", "cleanup-skipped", "escalation-issue"];
    readonly 'activation-consumer': readonly ["roadmap-branch-pr", "activation-failed", "activation-resumable"];
    readonly 'triage-action-consumer': readonly ["triage-label-applied", "triage-comment-posted", "triage-action-skipped", "escalation-issue"];
};
export declare const LIVE_RUNNER_SIDE_EFFECT_LEVELS: readonly ["none", "evidence", "request", "claim", "issue-comment", "label", "branch", "pr", "draft-pr", "cleanup"];
export type LiveRunnerConsumerKind = keyof typeof COMPLETION_FORMS_BY_KIND;
export type LiveRunnerEvidenceStatus = typeof RUNNER_EVIDENCE_STATUSES[number];
export type LiveRunnerExecutionMode = 'live' | 'dry-run';
export type LiveRunnerEvidence = {
    schema: typeof LIVE_RUNNER_EVIDENCE_SCHEMA;
    runner_id: string;
    route_id: string;
    consumer_kind: LiveRunnerConsumerKind | string;
    execution_mode: LiveRunnerExecutionMode | string;
    completion_form: string;
    status: LiveRunnerEvidenceStatus | string;
    dedupe_key: string;
    created_at: string;
    source: {
        kind?: string;
        id?: string;
        url?: string;
        [key: string]: unknown;
    };
    verifier_evidence: unknown[];
    side_effects: {
        executed?: boolean;
        level?: string;
        actions?: unknown[];
        [key: string]: unknown;
    };
    [key: string]: unknown;
};
export type LiveRunnerEvidenceComment = {
    id?: string;
    body?: string;
    author?: string;
    createdAt?: string;
};
export type LiveRunnerEvidenceParseResult = {
    commentId: string | undefined;
    author: string | undefined;
    createdAt: string | undefined;
    evidence: LiveRunnerEvidence | null;
    validation: {
        ok: boolean;
        errors: string[];
    };
};
export declare function buildLiveRunnerEvidence(input: Omit<LiveRunnerEvidence, 'schema'>): LiveRunnerEvidence;
export declare function validateLiveRunnerEvidence(evidence: unknown): {
    ok: boolean;
    errors: string[];
};
export declare function buildLiveRunnerEvidenceComment(evidence: LiveRunnerEvidence): string;
export declare function parseLiveRunnerEvidenceComments(comments: LiveRunnerEvidenceComment[]): LiveRunnerEvidenceParseResult[];
