export declare const PR_STEWARD_VERIFIER_SCOPES: string[];
export declare const PR_STEWARD_VERIFIERS: string[];
export declare function verifyGitLabPrStewardScope(input: {
    projectPath: string;
    issueIid: string | number;
    mergeRequestIid: string | number;
    requestId: string;
    claimId: string;
    currentHeadSha: string;
    requestedScope: string;
    requestedVerifier: string;
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
    verifier: null;
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
    verifier: {
        scope: string;
        verifier: string;
        claim_id: string;
        current_head_sha: string;
        status: string;
    };
    side_effects_executed: boolean;
}>;
