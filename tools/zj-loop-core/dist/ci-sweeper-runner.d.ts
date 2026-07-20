export declare const GITLAB_CI_SWEEPER_ISSUE_FIX_REQUEST_SCHEMA = "zj-loop.gitlab_issue_fix_request_live.v1";
export type CommandStep = {
    command: string;
    args: string[];
    cwd?: string;
};
export type CiSweeperRepairPlan = {
    schema: 'zj-loop.ci_sweeper_repair_plan.v1';
    package_directories: string[];
    commands: CommandStep[];
};
export declare function buildCiSweeperIssueFixRequestBody(input: {
    routeDecision: any;
    repo: string;
    provider?: 'github' | 'gitlab';
    workflowName?: string;
    runId?: string;
    sourceUrl?: string;
    createdAt?: string;
    repairActions?: any[];
}): string;
export declare function createGitLabCiSweeperIssueFixRequest(input: {
    projectPath: string;
    token?: string;
    title: string;
    requestBody: string;
    pipelineSource?: string;
    carrierEnabled?: string | boolean;
    carrierConfirmation?: string;
    breakerState?: 'armed' | 'tripped';
    apiBaseUrl?: string;
    fetchImpl?: typeof fetch;
}): Promise<{
    schema: string;
    status: string;
    reason: string;
    audit: {
        dedupe_key: any;
        auth_source: string | null;
        consumer_id?: string | undefined;
        claim_id?: string | undefined;
        request_id?: string | undefined;
        issue_iid?: number | undefined;
        project_path: string;
    };
    issue: null;
} | {
    schema: string;
    status: string;
    outcome: "duplicate" | "created" | "recovered-duplicate";
    audit: Record<string, unknown>;
    issue: {
        iid: number;
        url: string;
    };
}>;
export declare function claimGitLabCiSweeperIssueFixRequest(input: {
    projectPath: string;
    issueIid: string | number;
    token?: string;
    requestId: string;
    claimId: string;
    sourcePipelineId: string;
    consumerId?: string;
    route?: any;
    apiBaseUrl?: string;
    fetchImpl?: typeof fetch;
}): Promise<{
    schema: string;
    status: string;
    reason: string;
    audit: {
        auth_source: string | null;
        consumer_id?: string | undefined;
        claim_id?: string | undefined;
        request_id?: string | undefined;
        issue_iid?: number | undefined;
        project_path: string;
    };
    claim: null;
} | {
    schema: string;
    status: string;
    outcome: string;
    audit: {
        request_id: any;
    };
    claim: any;
}>;
export declare function appendGitLabCiSweeperLifecycleEvidence(input: {
    projectPath: string;
    issueIid: string | number;
    token?: string;
    requestId: string;
    claimId: string;
    status: 'running' | 'completed' | 'failed';
    evidence?: Record<string, unknown>;
    apiBaseUrl?: string;
    fetchImpl?: typeof fetch;
}): Promise<{
    schema: string;
    status: string;
    reason: string;
    audit: {
        auth_source: string | null;
        consumer_id?: string | undefined;
        claim_id?: string | undefined;
        request_id?: string | undefined;
        issue_iid?: number | undefined;
        project_path: string;
    };
    lifecycle: null;
    http_status?: undefined;
    outcome?: undefined;
} | {
    schema: string;
    status: string;
    reason: string;
    audit: {
        auth_source: string | null;
        consumer_id?: string | undefined;
        claim_id?: string | undefined;
        request_id?: string | undefined;
        issue_iid?: number | undefined;
        project_path: string;
    };
    lifecycle: null;
    http_status: number;
    outcome?: undefined;
} | {
    schema: string;
    status: string;
    outcome: string;
    audit: {
        auth_source: string | null;
        consumer_id?: string | undefined;
        claim_id?: string | undefined;
        request_id?: string | undefined;
        issue_iid?: number | undefined;
        project_path: string;
    };
    lifecycle: {
        schema: string;
        request_id: string;
        claim_id: string;
        status: "completed" | "failed" | "running";
        evidence: Record<string, unknown>;
        recorded_at: string;
    };
    reason?: undefined;
    http_status?: undefined;
}>;
export declare function buildCiSweeperVerifierPlan(input: {
    request?: any;
    route?: any;
}): {
    schema: string;
    status: string;
    commands: any[];
    refusals: string[];
};
export declare function buildCiSweeperRepairActionGate(input: {
    request?: any;
    route?: any;
    changedFiles?: string[];
}): {
    schema: string;
    status: string;
    actions: any[];
    changed_files: string[];
    refusals: string[];
};
export declare function createGitLabCiSweeperRepairMr(input: {
    projectPath: string;
    token?: string;
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
        project_path: string;
        branch: string;
        target_branch: string;
        auth_source: string | null;
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
export declare function triggerGitLabCiSweeperConsumerPipeline(input: {
    projectPath: string;
    token?: string;
    ref: string;
    issueIid: string | number;
    requestId: string;
    claimId: string;
    apiBaseUrl?: string;
    fetchImpl?: typeof fetch;
}): Promise<{
    schema: string;
    status: string;
    reason: string;
    audit: {
        project_path: string;
        ref: string;
        issue_iid: number;
        request_id: string;
        claim_id: string;
        auth_source: string | null;
    };
    pipeline: null;
} | {
    schema: string;
    status: string;
    outcome: string;
    audit: {
        project_path: string;
        ref: string;
        issue_iid: number;
        request_id: string;
        claim_id: string;
        auth_source: string | null;
    };
    pipeline: {
        id: number;
        url: string;
        ref: string;
        source: string;
    };
}>;
export declare function executeGitLabCiSweeperCloseout(input: {
    projectPath: string;
    mergeRequestIid: string | number;
    issueIid: string | number;
    requestId: string;
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
        branch: string;
        target_branch: string;
        auth_source: string | null;
    };
    side_effects_executed: boolean;
    steps: any[];
}>;
export declare function executeGitLabCiSweeperRepairMr(input: {
    projectPath: string;
    issueIid: string | number;
    requestId: string;
    claimId: string;
    sourcePipelineId: string;
    token?: string;
    route?: any;
    branch: string;
    targetBranch: string;
    commitMessage: string;
    title: string;
    description: string;
    apiBaseUrl?: string;
    fetchImpl?: typeof fetch;
}): Promise<{
    schema: string;
    status: string;
    reason: string;
    audit: {
        project_path: string;
        issue_iid: number;
        request_id: string;
        claim_id: string;
        source_pipeline_id: string;
        auth_source: string | null;
    };
    claim: null;
    repair_mr: null;
} | {
    schema: string;
    status: string;
    outcome: any;
    audit: {
        project_path: string;
        issue_iid: number;
        request_id: string;
        claim_id: string;
        source_pipeline_id: string;
        auth_source: string | null;
    };
    claim: {
        schema: string;
        status: string;
        reason: string;
        audit: {
            auth_source: string | null;
            consumer_id?: string | undefined;
            claim_id?: string | undefined;
            request_id?: string | undefined;
            issue_iid?: number | undefined;
            project_path: string;
        };
        claim: null;
    } | {
        schema: string;
        status: string;
        outcome: string;
        audit: {
            request_id: any;
        };
        claim: any;
    };
    repair_mr: {
        schema: string;
        status: string;
        reason: string;
        audit: {
            project_path: string;
            branch: string;
            target_branch: string;
            auth_source: string | null;
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
    };
    lifecycle: {
        schema: string;
        status: string;
        reason: string;
        audit: {
            auth_source: string | null;
            consumer_id?: string | undefined;
            claim_id?: string | undefined;
            request_id?: string | undefined;
            issue_iid?: number | undefined;
            project_path: string;
        };
        lifecycle: null;
        http_status?: undefined;
        outcome?: undefined;
    } | {
        schema: string;
        status: string;
        reason: string;
        audit: {
            auth_source: string | null;
            consumer_id?: string | undefined;
            claim_id?: string | undefined;
            request_id?: string | undefined;
            issue_iid?: number | undefined;
            project_path: string;
        };
        lifecycle: null;
        http_status: number;
        outcome?: undefined;
    } | {
        schema: string;
        status: string;
        outcome: string;
        audit: {
            auth_source: string | null;
            consumer_id?: string | undefined;
            claim_id?: string | undefined;
            request_id?: string | undefined;
            issue_iid?: number | undefined;
            project_path: string;
        };
        lifecycle: {
            schema: string;
            request_id: string;
            claim_id: string;
            status: "completed" | "failed" | "running";
            evidence: Record<string, unknown>;
            recorded_at: string;
        };
        reason?: undefined;
        http_status?: undefined;
    };
}>;
export declare function getCiSweeperPackageBuildPlan(packages: Array<{
    directory: string;
}>): string[];
export declare function buildCiSweeperRepairCommands(input?: {
    root?: string;
    packageDirectories?: string[];
    rootInstallCommand?: [string, string[]] | null;
    rootCommands?: Array<[string, string[]]>;
}): Promise<CommandStep[]>;
export declare function buildCiSweeperRepairPlan(input?: {
    root?: string;
    packageDirectories?: string[];
    rootInstallCommand?: [string, string[]] | null;
    rootCommands?: Array<[string, string[]]>;
}): Promise<CiSweeperRepairPlan>;
export declare function formatCommandStep(step: CommandStep): string;
