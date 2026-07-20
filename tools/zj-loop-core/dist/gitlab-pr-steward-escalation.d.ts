export declare function appendGitLabPrStewardEscalation(input: {
    projectPath: string;
    issueIid: string | number;
    mergeRequestIid: string | number;
    requestId: string;
    claimId: string;
    currentHeadSha: string;
    reason: string;
    token?: string;
    apiBaseUrl?: string;
    fetchImpl?: typeof fetch;
}): Promise<{
    schema: string;
    status: string;
    reason: string;
    audit: {
        project_path: string;
        issue_iid: number;
        merge_request_iid: number;
        request_id: string;
        claim_id: string;
        auth_source: string | null;
    };
    escalation: null;
    side_effects_executed: boolean;
} | {
    schema: string;
    status: string;
    outcome: string;
    audit: {
        project_path: string;
        issue_iid: number;
        merge_request_iid: number;
        request_id: string;
        claim_id: string;
        auth_source: string | null;
    };
    escalation: any;
    side_effects_executed: boolean;
}>;
