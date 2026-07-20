import type { RouteTableRoute } from './route.js';
export declare const GITLAB_ISSUE_NOTE_BRIDGE_CAPABILITY_SCHEMA = "zj-loop.gitlab_issue_note_bridge_capability.v1";
export declare const GITLAB_ISSUE_NOTE_BRIDGE_CAPABILITY_ROUTE_ID = "gitlab-issue-note-bridge";
export declare const GITLAB_ISSUE_NOTE_BRIDGE_CAPABILITY_PROJECT = "mlive-dev/ai-studio";
export type GitLabIssueNoteBridgeCapabilityArtifact = {
    schema: 'zj-loop.capability.v1';
    route_artifact_schema: typeof GITLAB_ISSUE_NOTE_BRIDGE_CAPABILITY_SCHEMA;
    provider: 'gitlab';
    project_path: string;
    route_id: string;
    status: 'available' | 'unavailable' | 'blocked' | 'unknown';
    planning_status: 'in_scope' | 'deferred' | 'completed' | 'superseded';
    enabled: boolean;
    provider_writes_allowed: false;
    declared_capabilities: string[];
    verified_capabilities: string[];
    verifiers: string[];
    verification: {
        status: 'verified' | 'blocked';
        errors: string[];
    };
    side_effects_executed: false;
    source_ref: {
        path: string;
        field: string;
    };
};
export declare function buildGitLabIssueNoteBridgeCapabilityArtifact(route: RouteTableRoute): GitLabIssueNoteBridgeCapabilityArtifact;
