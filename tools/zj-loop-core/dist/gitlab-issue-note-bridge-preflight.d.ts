export declare const GITLAB_ISSUE_NOTE_BRIDGE_PREFLIGHT_SCHEMA = "zj-loop.gitlab_issue_note_bridge_verification.v1";
export declare const GITLAB_ISSUE_NOTE_BRIDGE_PREFLIGHT_EXIT_CODES: {
    readonly ready: 0;
    readonly blocked: 10;
    readonly uncertain: 20;
    readonly failed: 30;
};
export type GitLabIssueNoteBridgePreflightManifest = {
    schema: typeof GITLAB_ISSUE_NOTE_BRIDGE_PREFLIGHT_SCHEMA;
    gitlab_api_url: string;
    project_path: string;
    project_id: string;
    hook_id: string;
    hook_url: string;
    bridge_http_url: string;
    pipeline_ref: string;
    target_route: string;
    marker: string;
};
export type GitLabIssueNoteBridgePreflightResult = {
    schema: typeof GITLAB_ISSUE_NOTE_BRIDGE_PREFLIGHT_SCHEMA;
    status: 'ready' | 'blocked' | 'uncertain' | 'failed';
    reason?: string;
    project_path?: string | null;
    project_id?: string | null;
    hook_id?: string | null;
    side_effects_executed: false;
    checks?: Record<string, string>;
    route?: Pick<GitLabIssueNoteBridgePreflightManifest, 'pipeline_ref' | 'target_route' | 'marker'>;
};
type FetchLike = (input: string, init?: {
    headers?: Record<string, string>;
}) => Promise<ResponseLike>;
type ResponseLike = {
    status: number;
    json(): Promise<unknown>;
};
export declare function validateGitLabIssueNoteBridgePreflightManifest(value: unknown): GitLabIssueNoteBridgePreflightManifest;
export declare function runGitLabIssueNoteBridgePreflight(input: {
    config: unknown;
    token?: string;
    fetchImpl?: FetchLike;
}): Promise<GitLabIssueNoteBridgePreflightResult>;
export {};
