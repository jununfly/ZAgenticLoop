export declare const PRD_HANDOFF_SCHEMA = "zj-loop.prd_handoff.v1";
export declare const PRD_HANDOFF_MARKER = "<!-- zj-loop:prd-next-command-handoff -->";
export declare const PRD_HANDOFF_MODES: readonly ["report-only", "comment-enabled"];
export type PrdHandoffMode = typeof PRD_HANDOFF_MODES[number];
export type PrdHandoffRequest = {
    schema?: string;
    prd_issue_url: string;
    next_command: string;
    detected_by?: string;
    detected_at?: string;
    mode?: PrdHandoffMode;
    repo?: string;
    issue?: number | string;
};
export declare function readPrdHandoffRequest(path: string): Promise<PrdHandoffRequest>;
export declare function buildPrdHandoffRequest(overrides?: Partial<PrdHandoffRequest>): PrdHandoffRequest;
export declare function runPrdHandoffRunner(input: {
    request: PrdHandoffRequest;
}): {
    kind: string;
    schema: string;
    request_id: string;
    decision: {
        status: string;
        reason: string;
    };
    prd_issue: {
        provider: string;
        repo: string;
        issue: string;
        url: string;
    } | null;
    mode: "report-only" | "comment-enabled" | undefined;
    handoff_locations: string[];
    idempotency: {
        marker: string;
        policy: string;
    };
    comment_body: string;
    manual_command: string;
    side_effects: {
        executed: boolean;
        issue_comment_planned: boolean;
        issue_comment_written: boolean;
        report_only: boolean;
    };
    validation: {
        ok: boolean;
        errors: string[];
    };
};
export declare function buildPrdHandoffCommentBody(request: PrdHandoffRequest): string;
export declare function buildGhIssueCommentCommand(input: {
    repo: string;
    issue: string;
    body: string;
}): string;
