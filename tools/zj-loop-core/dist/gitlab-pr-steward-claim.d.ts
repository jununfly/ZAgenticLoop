export declare function claimGitLabPrStewardIssueFixRequest(input: {
    projectPath: string;
    issueIid: string | number;
    mergeRequestIid: string | number;
    requestId: string;
    claimId: string;
    currentHeadSha: string;
    token?: string;
    apiBaseUrl?: string;
    fetchImpl?: typeof fetch;
}): Promise<{
    schema: string;
    status: string;
    reason: string;
    audit: Record<string, unknown>;
    claim: null;
    side_effects_executed: boolean;
} | {
    schema: string;
    status: string;
    outcome: string;
    audit: Record<string, unknown>;
    claim: any;
    side_effects_executed: boolean;
}>;
