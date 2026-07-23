export type GitLabIssueNoteBridgeConfig = {
    projectPath?: string;
    routeId?: string;
    pipelineRef?: string;
    targetRoute?: string;
    marker?: string;
    allowedEventType?: string;
    enabled?: boolean;
    maturity?: string;
};
type Environment = Record<string, string | undefined>;
export declare function readGitLabIssueNoteBridgeConfig(env: Environment): GitLabIssueNoteBridgeConfig;
export {};
