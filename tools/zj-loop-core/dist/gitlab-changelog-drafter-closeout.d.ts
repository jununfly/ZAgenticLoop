export declare const CHANGELOG_DRAFTER_CLOSEOUT_CONFIRMATION = "DELETE_MERGED_CHANGELOG_DRAFT_BRANCH_AND_CLOSE_CARRIER";
export declare function closeGitLabChangelogDraft(input: {
    projectPath: string;
    mergeRequestIid: string | number;
    issueIid: string | number;
    requestId: string;
    claimId: string;
    branch: string;
    targetBranch: string;
    confirmationPhrase: string;
    token?: string;
    apiBaseUrl?: string;
    fetchImpl?: typeof fetch;
}): Promise<any>;
