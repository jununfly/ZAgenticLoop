export declare const DEPENDENCY_SWEEPER_CLOSEOUT_CONFIRMATION_PHRASE = "DELETE_MERGED_DEPENDENCY_SWEEPER_BRANCH_AND_CLOSE_CARRIER";
export declare function executeGitLabDependencySweeperCloseout(input: {
    projectPath: string;
    mergeRequestIid: string | number;
    issueIid: string | number;
    requestId: string;
    claimId: string;
    branch: string;
    targetBranch: string;
    token?: string;
    confirmationPhrase?: string;
    apiBaseUrl?: string;
    fetchImpl?: typeof fetch;
}): Promise<{
    schema: string;
    status: string;
    reason: string;
    audit: {
        project_path: string;
        merge_request_iid: number;
        issue_iid: number;
        request_id: string;
        claim_id: string;
        branch: string;
        target_branch: string;
        auth_source: string | null;
    };
    side_effects_executed: boolean;
} | {
    schema: string;
    status: string;
    outcome: string;
    audit: {
        project_path: string;
        merge_request_iid: number;
        issue_iid: number;
        request_id: string;
        claim_id: string;
        branch: string;
        target_branch: string;
        auth_source: string | null;
    };
    side_effects_executed: boolean;
    steps: any[];
}>;
