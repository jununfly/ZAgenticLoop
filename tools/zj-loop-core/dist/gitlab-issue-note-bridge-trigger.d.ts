import type { GitLabIssueNoteBridgeEnvelope } from './gitlab-issue-note-bridge.js';
export declare const GITLAB_ISSUE_NOTE_BRIDGE_TRIGGER_SCHEMA = "zj-loop.gitlab_issue_note_bridge_trigger.v1";
export declare const GITLAB_BRIDGE_TRIGGER_AUTH_SOURCE = "ZJ_LOOP_GITLAB_BRIDGE_TRIGGER_TOKEN";
export type GitLabIssueNoteBridgeTriggerConfig = {
    projectPath: string;
    routeId: string;
    pipelineRef: string;
    targetRoute: string;
    allowedEventType: string;
    enabled: boolean;
    maturity: string;
};
export type GitLabIssueNoteBridgeTriggerArtifact = {
    schema: typeof GITLAB_ISSUE_NOTE_BRIDGE_TRIGGER_SCHEMA;
    status: 'triggered' | 'failed' | 'uncertain' | 'blocked';
    reason?: string;
    project_path: string;
    route_id: string;
    pipeline_ref: string;
    target_route: string;
    event_id: string;
    dedupe_key: string;
    envelope_ref: string;
    auth_source: typeof GITLAB_BRIDGE_TRIGGER_AUTH_SOURCE | null;
    variable_keys: readonly string[];
    pipeline: {
        id: number;
        url: string;
    } | null;
    provider_http_status: number | null;
    side_effects_executed: boolean;
    recovery: {
        status: 'not-needed' | 'resume-required';
        next_steps: string[];
    };
};
export declare function triggerGitLabIssueNoteBridgePipeline(input: {
    config: GitLabIssueNoteBridgeTriggerConfig;
    envelope: GitLabIssueNoteBridgeEnvelope;
    envelopeRef: string;
    token?: string;
    apiBaseUrl?: string;
    fetchImpl?: typeof fetch;
}): Promise<GitLabIssueNoteBridgeTriggerArtifact>;
