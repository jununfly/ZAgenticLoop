export declare function fetchGitLabPrStewardReport(input: {
    projectPath: string;
    mergeRequestIid: string | number;
    signalId: string;
    token?: string;
    apiBaseUrl?: string;
    fetchImpl?: typeof fetch;
}): Promise<{
    schema: string;
    status: string;
    reason: string;
    audit: {
        project_path: string;
        merge_request_iid: number;
        signal_id: string;
        auth_source: string | null;
    };
} | {
    schema: string;
    status: string;
    outcome: string;
    audit: {
        project_path: string;
        merge_request_iid: number;
        signal_id: string;
        auth_source: string | null;
    };
    report: {
        schema: string;
        status: string;
        created_at: string;
        source_review: {
            provider: string;
            kind: string;
            mr_iid: number;
            repo: string;
            url: string;
            source_branch: string;
            target_branch: string;
            head_sha: string;
        };
        observations: {
            checks: string;
            pipeline_status: string;
            pipeline_id: any;
            pipeline_url: string;
            failed_jobs: {
                id: any;
                name: string;
                status: string;
                url: string;
            }[];
        };
        next_action: string;
        side_effects_executed: boolean;
    };
}>;
