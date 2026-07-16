export declare const DEPENDENCY_SWEEPER_RUNNER_ID = "dependency-sweeper";
export declare const DEPENDENCY_SWEEPER_ROUTE_ID = "dependency-sweeper";
export declare const DEPENDENCY_SWEEPER_CONSUMER_KIND = "fix-runner";
export declare const DEPENDENCY_SWEEPER_CONFIRMATION_PHRASE = "CREATE_DEPENDENCY_SWEEPER_FIX_PR";
export declare function buildDependencySweeperFixtureContract(): {
    readonly schema: "zj-loop.dependency_sweeper_fixture.v1";
    readonly package_name: "yaml";
    readonly current_version: "2.8.0";
    readonly target_version: "2.8.1";
    readonly update_type: "patch";
    readonly dependency_section: "dependencies";
    readonly manifest_files: readonly ["package.json", "package-lock.json"];
    readonly verification_commands: readonly [{
        readonly command: "npm";
        readonly args: readonly ["ci"];
        readonly cwd: ".";
    }, {
        readonly command: "npm";
        readonly args: readonly ["test"];
        readonly cwd: ".";
    }];
};
export declare function validateDependencySweeperFixtureContract(input: {
    contract?: ReturnType<typeof buildDependencySweeperFixtureContract>;
    request?: any;
    changedFiles?: string[];
}): {
    ok: boolean;
    errors: string[];
};
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
    existingRepairPullRequestUrl?: string;
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
    existing_repair_pull_request_url: string;
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
