export declare const CONFIRM_PR_STEWARD_ISSUE_FIX_REQUEST = "CONFIRM_PR_STEWARD_ISSUE_FIX_REQUEST";
export declare function buildGitLabPrStewardIssueFixRequest(report: any): {
    schema: string;
    request_id: string;
    status: string;
    created_at: string;
    source_signal: {
        signal_id: string;
        source: string;
        provider: string;
        summary: string;
        source_url: string;
        provider_metadata: {
            mr_iid: number;
            pipeline_id: any;
            failed_jobs: any;
        };
    };
    subject: {
        type: string;
        provider: string;
        repo: string;
        mr_iid: number;
        head_sha: string;
        base_branch: string;
        source_url: string;
        provider_metadata: {
            mr_iid: number;
            pipeline_id: any;
        };
    };
    route_decision: {
        route_id: string;
        request_kind: string;
        target_consumer: string;
        dedupe_key: string;
    };
    dedupe_key: string;
    requested_consumer: {
        consumer_id: string;
        capability: string;
    };
    fix_scope: {
        repo: string;
        files_or_areas: string[];
        non_goals: string[];
    };
    acceptance_criteria: string[];
    verification_gate: {
        commands: {
            id: string;
            command: string;
            args: string[];
        }[];
    };
    failure_policy: {
        on_failure: string;
        retry: string;
    };
    lifecycle: {
        linked_pr: null;
        consumed_by: null;
        closed_at: null;
    };
};
export declare function createGitLabPrStewardIssueFixRequest(input: {
    projectPath: string;
    report: any;
    token?: string;
    confirmationPhrase?: string;
    apiBaseUrl?: string;
    fetchImpl?: typeof fetch;
}): Promise<{
    schema: string;
    status: string;
    reason: string;
    audit: Record<string, unknown>;
    issue: null;
    side_effects_executed: boolean;
} | {
    schema: string;
    status: string;
    outcome: string;
    audit: Record<string, unknown>;
    issue: {
        iid: number;
        url: string;
    };
    side_effects_executed: boolean;
}>;
