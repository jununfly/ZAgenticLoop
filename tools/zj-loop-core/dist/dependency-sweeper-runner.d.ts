export declare const DEPENDENCY_SWEEPER_RUNNER_ID = "dependency-sweeper";
export declare const DEPENDENCY_SWEEPER_ROUTE_ID = "dependency-sweeper";
export declare const DEPENDENCY_SWEEPER_CONSUMER_KIND = "fix-runner";
export declare const DEPENDENCY_SWEEPER_CONFIRMATION_PHRASE = "CREATE_DEPENDENCY_SWEEPER_FIX_PR";
export declare function defaultDependencySweeperRunner(command: string, args?: string[]): Promise<{
    command: string;
    args: string[];
    exitCode: number;
    stdout: string;
    stderr: string;
}>;
export declare function readIssueFixRequest(path: string): Promise<any>;
export declare function validateDependencySweeperLiveRequest(request: any): {
    ok: boolean;
    errors: string[];
};
export declare function buildDependencySweeperExecutionPlan(input?: {
    request?: any;
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
    created_at: string;
    request_id: any;
    dedupe_key: any;
    provider: "github" | "gitlab";
    source_signal: {
        provider: "github" | "gitlab";
        id: any;
        source_url: any;
        provider_metadata: {
            dependency_alert_id: any;
            dependency_alert_url: any;
        } | undefined;
    };
    subject: {
        provider: "github" | "gitlab";
        ecosystem: any;
        package_name: any;
        current_version: any;
        target_version: any;
        update_type: any;
        dependency_section: any;
        manifest_files: any;
    };
    branch: string;
    refusals: {
        layer: string;
        reason: string;
    }[];
    actions: any[];
};
export declare function executeDependencySweeperLiveRunner(plan: any, { runner }?: {
    runner?: (command: string, args: string[]) => Promise<any>;
}): Promise<{
    schemaVersion: number;
    kind: string;
    outcome: string;
    plan: any;
    steps: any[];
    runner_evidence: import("./live-runner-contract.js").LiveRunnerEvidence;
}>;
