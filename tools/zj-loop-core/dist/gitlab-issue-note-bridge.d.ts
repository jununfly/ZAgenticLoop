export declare const GITLAB_ISSUE_NOTE_BRIDGE_SCHEMA = "zj-loop.gitlab_issue_note_bridge.v1";
export declare const GITLAB_ISSUE_NOTE_EVENT = "Note Hook";
export declare const GITLAB_ISSUE_NOTE_LEGACY_EVENT = "Issue Hook";
export declare const GITLAB_ISSUE_NOTE_EVENTS: readonly ["Note Hook", "Issue Hook"];
export declare const GITLAB_BRIDGE_AUTH_SOURCE = "GITLAB_WEBHOOK_SECRET";
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
        webhookSecret?: string;
    };
    payload: unknown;
    projectPath: string;
    expectedProjectPath: string;
    expectedWebhookSecret?: string;
    route: GitLabIssueNoteBridgeRoute;
    receivedAt?: string;
};
export type GitLabIssueNoteBridgeEnvelope = {
    schema: typeof GITLAB_ISSUE_NOTE_BRIDGE_SCHEMA;
    event_id: string;
    event_type: (typeof GITLAB_ISSUE_NOTE_EVENTS)[number];
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
