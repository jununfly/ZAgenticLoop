export declare const CHANGELOG_DRAFTER_RUNNER_ID = "changelog-drafter";
export declare const CHANGELOG_DRAFTER_ROUTE_ID = "changelog-drafter-draft-request";
export declare const CHANGELOG_DRAFTER_CONSUMER_KIND = "draft-consumer";
export declare const CHANGELOG_DRAFTER_CONFIRMATION_PHRASE = "CREATE_CHANGELOG_DRAFT_PR_OR_EVIDENCE";
export declare const CHANGELOG_DRAFT_REQUEST_SCHEMA = "zj-loop.changelog_draft_request.v1";
export declare function defaultChangelogDrafterRunner(command: string, args?: string[]): Promise<{
    command: string;
    args: string[];
    exitCode: number;
    stdout: string;
    stderr: string;
}>;
export declare function readChangelogDraftRequest(path: string): Promise<any>;
export declare function validateChangelogDrafterLiveRequest(draftRequest: any): {
    ok: boolean;
    errors: string[];
};
export declare function buildChangelogDrafterExecutionPlan(input?: {
    draftRequest?: any;
    draftMode?: string;
    draftFile?: string;
    live?: boolean;
    confirmationPhrase?: string;
    gitStatus?: string;
    createdAt?: string;
}): {
    schemaVersion: number;
    kind: string;
    runner_id: string;
    route_id: string;
    mode: string;
    draft_mode: string;
    status: string;
    created_at: string;
    request_id: any;
    dedupe_key: any;
    release_window: {
        provider: "github" | "gitlab";
        repo: any;
        base_branch: any;
        since_ref: any;
        until_ref: any;
        item_count: any;
    };
    branch: string;
    draft_file: string;
    refusals: {
        layer: string;
        reason: string;
    }[];
    actions: ({
        name: string;
        command: string;
        args: string[];
        expectedExitCodes?: undefined;
    } | {
        name: string;
        command: string;
        args: string[];
        expectedExitCodes: number[];
    })[];
};
export declare function executeChangelogDrafterLiveRunner(plan: any, { runner }?: {
    runner?: (command: string, args: string[]) => Promise<any>;
}): Promise<{
    schemaVersion: number;
    kind: string;
    outcome: string;
    plan: any;
    steps: any[];
    runner_evidence: import("./live-runner-contract.js").LiveRunnerEvidence;
}>;
