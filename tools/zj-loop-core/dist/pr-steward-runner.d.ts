export declare const PR_STEWARD_RUNNER_ID = "pr-steward";
export declare const PR_STEWARD_ROUTE_ID = "pr-steward-fix-request";
export declare const PR_STEWARD_CONSUMER_KIND = "fix-runner";
export declare const PR_STEWARD_CAPABILITY = "pr-review-and-readiness-fix";
export declare const PR_STEWARD_CONFIRMATION_PHRASE = "CREATE_PR_STEWARD_FIX_PR_OR_ESCALATION";
export declare function defaultPrStewardRunner(command: string, args?: string[]): Promise<{
    command: string;
    args: string[];
    exitCode: number;
    stdout: string;
    stderr: string;
}>;
export declare function readPrStewardIssueFixRequest(path: string): Promise<any>;
export declare function validatePrStewardLiveRequest(input?: {
    request?: any;
    currentPrHeadSha?: string;
}): {
    ok: boolean;
    errors: string[];
};
export declare function buildPrStewardExecutionPlan(input?: {
    request?: any;
    currentPrHeadSha?: string;
    repairCommands?: string[];
    repairFiles?: string[];
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
    status: string;
    completion_mode: string;
    created_at: string;
    request_id: any;
    dedupe_key: any;
    source_review: {
        provider: "github" | "gitlab";
        kind: string;
        repo: any;
        number: any;
        head_sha: any;
        current_head_sha: string;
        base_branch: any;
        source_url: any;
    };
    source_pr: {
        repo: any;
        pr_number: any;
        head_sha: any;
        current_head_sha: string;
        base_branch: any;
        source_url: any;
    } | null;
    branch: string;
    repair_files: string[];
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
export declare function executePrStewardLiveRunner(plan: any, { runner }?: {
    runner?: (command: string, args: string[]) => Promise<any>;
}): Promise<{
    schemaVersion: number;
    kind: string;
    outcome: string;
    plan: any;
    steps: any[];
    runner_evidence: import("./live-runner-contract.js").LiveRunnerEvidence;
}>;
