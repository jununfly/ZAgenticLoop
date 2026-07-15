export interface GitLabBacklogScanInput {
    projectPath: string;
    apiBaseUrl?: string;
    token?: string;
    jobToken?: string;
    limit?: number;
    pipelineUrl?: string;
    fetchImpl?: typeof fetch;
}
export declare function scanGitLabIssueBacklog(input: GitLabBacklogScanInput): Promise<{
    side_effects: {
        labels: boolean;
        comments: boolean;
        state: boolean;
        requests: boolean;
    };
    schema: string;
    provider: string;
    project_path: string;
    pipeline_url: string;
    route: string;
    source: string;
    issue_count: number;
    recommendations: {
        provider: string;
        repo: string;
        project_path: string;
        issue: any;
        issue_iid: any;
        issue_url: string;
        labels: any;
        assignees: any;
        recommendation: string;
        reason: string;
        request: any;
    }[];
}>;
