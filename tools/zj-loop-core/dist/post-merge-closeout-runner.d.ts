export declare const POST_MERGE_CONTRACT_KIND = "zj-loop.post-merge-contract";
export declare const POST_MERGE_CONTRACT_VERSION = 1;
export declare const POST_MERGE_CONTRACT_CONSUMER = "post-merge-cleanup";
export declare const POST_MERGE_CONTRACT_MODE = "roadmap-closeout";
export declare const CLOSEOUT_EXECUTOR_KIND = "zj-loop.post-merge-roadmap-closeout-executor";
export declare const CLOSEOUT_EXECUTOR_VERSION = 1;
export declare const LIVE_CLEANUP_CONFIRMATION_PHRASE = "DELETE_MERGED_ROADMAP_BRANCH_AND_CLOSE_CARRIER";
export type CommandResult = {
    command: string;
    args: string[];
    exitCode: number;
    stdout: string;
    stderr: string;
};
export type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>;
export type PostMergePullRequest = {
    number?: number;
    url?: string;
    body?: string;
    merged?: boolean;
    mergedAt?: string | null;
    baseRefName?: string;
    headRefName?: string;
    headRepositoryOwner?: string | {
        login?: string;
    };
    baseRepositoryOwner?: string | {
        login?: string;
    };
    baseRepository?: string;
    repository?: string;
    isCrossRepository?: boolean;
};
export type PostMergeContractResult = {
    ok: boolean;
    contract: any | null;
    reason: string;
    errors: string[];
};
export type PostMergeCloseoutPlan = {
    schemaVersion: typeof CLOSEOUT_EXECUTOR_VERSION;
    kind: typeof CLOSEOUT_EXECUTOR_KIND;
    mode: 'dry-run' | 'live';
    status: 'dry-run' | 'ready-for-live-execution' | 'refused';
    side_effects_executed: false;
    pr: {
        number: number | null;
        url: string;
        merged: boolean;
        baseRefName: string;
        headRefName: string;
    };
    repository: {
        expected: string;
        current: string;
    };
    roadmap: {
        id: string;
        branch: string;
    };
    carrier: {
        issue: number | null;
        expectedIssue: number | null;
    };
    contractPlan: any;
    executorGuards: Array<{
        name: string;
        pass: boolean;
        reason: string;
    }>;
    confirmation: {
        required: boolean;
        authorization_source: 'merged-pr-contract' | 'fixed-phrase';
        confirmation_location: string[];
        required_phrase: typeof LIVE_CLEANUP_CONFIRMATION_PHRASE;
        side_effects: string[];
        why_required: string;
        audit_target: string[];
    };
    refusals: Array<{
        layer: string;
        reason: string;
        guard?: string;
    }>;
    actions: any[];
};
export declare function defaultPostMergeRunner(command: string, args?: string[]): Promise<CommandResult>;
export declare function parsePostMergeContractFromPrBody(body: string): PostMergeContractResult;
export declare function validatePostMergeContract(contract: any, { pr }?: {
    pr?: PostMergePullRequest;
}): {
    ok: boolean;
    errors: string[];
    guards: {
        pr_merged: boolean;
        current_roadmap_branch: boolean;
        roadmap_branch_prefix: boolean;
        same_repository: boolean;
        not_protected_branch: boolean;
    };
};
export declare function buildRoadmapCloseoutContractPlan(input: {
    pr: PostMergePullRequest;
    contractResult: PostMergeContractResult;
}): {
    status: string;
    reason: string;
    validation: {
        ok: boolean;
        errors: string[];
    };
    guards: {
        pr_merged: boolean;
        current_roadmap_branch: boolean;
        roadmap_branch_prefix: boolean;
        same_repository: boolean;
        not_protected_branch: boolean;
    };
    actions: never[];
    side_effects_executed: boolean;
} | {
    status: string;
    reason: string;
    validation: {
        ok: boolean;
        errors: string[];
        guards: {
            pr_merged: boolean;
            current_roadmap_branch: boolean;
            roadmap_branch_prefix: boolean;
            same_repository: boolean;
            not_protected_branch: boolean;
        };
    };
    guards: {
        pr_merged: boolean;
        current_roadmap_branch: boolean;
        roadmap_branch_prefix: boolean;
        same_repository: boolean;
        not_protected_branch: boolean;
    };
    actions: ({
        name: string;
        status: string;
        branch: any;
        issue?: undefined;
    } | {
        name: string;
        status: string;
        issue: any;
        branch?: undefined;
    })[];
    side_effects_executed: boolean;
};
export declare function buildPostMergeRoadmapCloseoutExecutionPlan(input: {
    pr: PostMergePullRequest;
    prBody?: string;
    expectedRepo?: string;
    currentRepo?: string;
    gitStatus?: string;
    expectedCarrierIssue?: number;
    live?: boolean;
}): PostMergeCloseoutPlan;
export declare function buildPostMergeLiveRunnerEvidence(result: any, { createdAt }?: {
    createdAt?: string;
}): import("./live-runner-contract.js").LiveRunnerEvidence;
export declare function executePostMergeRoadmapCloseout(plan: PostMergeCloseoutPlan, { runner }?: {
    runner?: CommandRunner;
}): Promise<{
    runner_evidence: import("./live-runner-contract.js").LiveRunnerEvidence;
    status: string;
    side_effects_executed: boolean;
    execution: {
        status: string;
        steps: any[];
    };
    schemaVersion: typeof CLOSEOUT_EXECUTOR_VERSION;
    kind: typeof CLOSEOUT_EXECUTOR_KIND;
    mode: "dry-run" | "live";
    pr: {
        number: number | null;
        url: string;
        merged: boolean;
        baseRefName: string;
        headRefName: string;
    };
    repository: {
        expected: string;
        current: string;
    };
    roadmap: {
        id: string;
        branch: string;
    };
    carrier: {
        issue: number | null;
        expectedIssue: number | null;
    };
    contractPlan: any;
    executorGuards: Array<{
        name: string;
        pass: boolean;
        reason: string;
    }>;
    confirmation: {
        required: boolean;
        authorization_source: "merged-pr-contract" | "fixed-phrase";
        confirmation_location: string[];
        required_phrase: typeof LIVE_CLEANUP_CONFIRMATION_PHRASE;
        side_effects: string[];
        why_required: string;
        audit_target: string[];
    };
    refusals: Array<{
        layer: string;
        reason: string;
        guard?: string;
    }>;
    actions: any[];
}>;
export declare function buildCloseoutEvidenceComment(plan: PostMergeCloseoutPlan): string;
export declare function buildCarrierCloseComment(plan: PostMergeCloseoutPlan): string;
export declare function buildDryRunEvidenceComment(plan: PostMergeCloseoutPlan, { artifactName, liveCommand, }?: {
    artifactName?: string;
    liveCommand?: string;
}): string;
export declare function buildLiveCommand(plan: PostMergeCloseoutPlan): string;
export declare function collectCloseoutInputFromGitHub(input: {
    prNumber: string | number;
    expectedRepo: string;
    runner?: CommandRunner;
}): Promise<{
    pr: {
        merged: boolean;
        headRepositoryOwner: string | {
            login?: string;
        } | undefined;
        baseRepositoryOwner: string | {
            login?: string;
        } | undefined;
        number?: number;
        url?: string;
        body?: string;
        mergedAt?: string | null;
        baseRefName?: string;
        headRefName?: string;
        baseRepository?: string;
        repository?: string;
        isCrossRepository?: boolean;
    };
    prBody: any;
    expectedRepo: string;
    currentRepo: string;
    gitStatus: string;
}>;
export declare function normalizeGhPrView(pr: PostMergePullRequest, { expectedRepo }: {
    expectedRepo: string;
}): {
    merged: boolean;
    headRepositoryOwner: string | {
        login?: string;
    } | undefined;
    baseRepositoryOwner: string | {
        login?: string;
    } | undefined;
    number?: number;
    url?: string;
    body?: string;
    mergedAt?: string | null;
    baseRefName?: string;
    headRefName?: string;
    baseRepository?: string;
    repository?: string;
    isCrossRepository?: boolean;
};
export declare function normalizePr(pr?: PostMergePullRequest): {
    headRepositoryOwner: string | {
        login?: string;
    } | undefined;
    baseRepositoryOwner: string | {
        login?: string;
    } | undefined;
    number?: number;
    url?: string;
    body?: string;
    merged?: boolean;
    mergedAt?: string | null;
    baseRefName?: string;
    headRefName?: string;
    baseRepository?: string;
    repository?: string;
    isCrossRepository?: boolean;
};
export declare function parseRepositoryFromGitRemote(remoteUrl: string): string;
