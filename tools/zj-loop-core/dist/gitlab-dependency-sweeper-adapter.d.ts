export declare function validateGitLabDependencySweeperCommitActions(actions: any[], expectedFiles?: string[]): {
    ok: boolean;
    errors: string[];
};
export declare function createGitLabDependencySweeperRepairMr(input: {
    projectPath: string;
    token?: string;
    request: any;
    requestId: string;
    branch: string;
    targetBranch: string;
    commitMessage: string;
    title: string;
    description: string;
    actions: any[];
    apiBaseUrl?: string;
    fetchImpl?: typeof fetch;
}): Promise<{
    schema: string;
    status: string;
    reason: string;
    audit: {
        branch: string;
        target_branch: string;
        auth_source: string | null;
        consumer_id?: string | undefined;
        claim_id?: string | undefined;
        request_id?: string | undefined;
        issue_iid?: number | undefined;
        project_path: string;
    };
    merge_request: null;
} | {
    schema: string;
    status: string;
    outcome: "duplicate" | "created";
    audit: Record<string, unknown>;
    merge_request: {
        iid: number;
        url: string;
        source_branch: string;
        target_branch: string;
    };
}>;
