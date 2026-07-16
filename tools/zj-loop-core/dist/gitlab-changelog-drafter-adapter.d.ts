export declare const CHANGELOG_CARRIER_SCHEMA = "zj-loop.changelog_draft_request.v1";
export declare const CHANGELOG_CLAIM_CONSUMER = "changelog-drafter";
export declare const CHANGELOG_DRAFT_BRANCH_PATTERN: RegExp;
export declare function validateGitLabChangelogDraftActions(actions: any[], expectedFile: string): {
    ok: boolean;
    errors: string[];
};
export declare function createGitLabChangelogDraftCarrier(input: {
    projectPath: string;
    request: any;
    confirmationPhrase?: string;
    token?: string;
    apiBaseUrl?: string;
    fetchImpl?: typeof fetch;
}): Promise<any>;
export declare function claimGitLabChangelogDraftCarrier(input: {
    projectPath: string;
    issueIid: string | number;
    requestId: string;
    claimId: string;
    token?: string;
    apiBaseUrl?: string;
    fetchImpl?: typeof fetch;
}): Promise<any>;
export declare function createGitLabChangelogDraftMr(input: {
    projectPath: string;
    token?: string;
    request: any;
    issueIid: string | number;
    claimId: string;
    branch: string;
    targetBranch: string;
    draftFile: string;
    actions: any[];
    commitMessage: string;
    title: string;
    description: string;
    apiBaseUrl?: string;
    fetchImpl?: typeof fetch;
}): Promise<any>;
