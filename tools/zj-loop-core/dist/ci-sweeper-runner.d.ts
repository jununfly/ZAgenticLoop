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
}): string;
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
