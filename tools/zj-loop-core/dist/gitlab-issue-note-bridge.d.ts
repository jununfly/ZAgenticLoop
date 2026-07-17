export declare const GITLAB_ISSUE_NOTE_BRIDGE_SCHEMA = "zj-loop.gitlab_issue_note_bridge.v1";
export declare const GITLAB_ISSUE_NOTE_EVENT = "Issue Hook";
export declare const GITLAB_BRIDGE_AUTH_SOURCE = "GITLAB_BRIDGE_TRIGGER_TOKEN";
export type GitLabIssueNoteBridgeRoute = {
    routeId: string;
    marker: string;
    targetRoute: string;
    targetRef: string;
};
export type GitLabIssueNoteWebhookInput = {
    headers: {
        event?: string;
        eventId?: string;
        triggerToken?: string;
    };
    payload: unknown;
    projectPath: string;
    expectedProjectPath: string;
    expectedTriggerToken?: string;
    route: GitLabIssueNoteBridgeRoute;
    receivedAt?: string;
};
export type GitLabIssueNoteBridgeEnvelope = {
    schema: typeof GITLAB_ISSUE_NOTE_BRIDGE_SCHEMA;
    event_id: string;
    event_type: typeof GITLAB_ISSUE_NOTE_EVENT;
    project_path: string;
    issue_iid: number;
    note_id: number;
    mr_iid: null;
    source_url: string;
    target_route: string;
    target_ref: string;
    received_at: string;
    dedupe_key: string;
    auth_source: typeof GITLAB_BRIDGE_AUTH_SOURCE;
    trigger_pipeline_id: null;
};
export type GitLabIssueNoteBridgeDecision = {
    schema: typeof GITLAB_ISSUE_NOTE_BRIDGE_SCHEMA;
    status: 'accepted' | 'ignored' | 'blocked';
    reason?: 'unauthorized' | 'project-mismatch' | 'event-not-allowed' | 'event-id-required' | 'issue-note-invalid' | 'route-mismatch';
    side_effects_executed: false;
    envelope: GitLabIssueNoteBridgeEnvelope | null;
};
export declare function buildGitLabIssueNoteBridgeEnvelope(input: GitLabIssueNoteWebhookInput): GitLabIssueNoteBridgeDecision;
