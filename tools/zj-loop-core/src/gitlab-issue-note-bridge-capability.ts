import type { RouteTableRoute } from './route.js';

export const GITLAB_ISSUE_NOTE_BRIDGE_CAPABILITY_SCHEMA = 'zj-loop.gitlab_issue_note_bridge_capability.v1';
export const GITLAB_ISSUE_NOTE_BRIDGE_CAPABILITY_ROUTE_ID = 'gitlab-issue-note-bridge';
export const GITLAB_ISSUE_NOTE_BRIDGE_CAPABILITY_PROJECT = 'mlive-dev/ai-studio';

const DECLARED_CAPABILITIES = ['webhook-envelope-validation', 'receipt-dedupe', 'fixed-api-trigger'] as const;
const VERIFIERS = ['route-table', 'disabled-state', 'zero-side-effect'] as const;

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
  verification: { status: 'verified' | 'blocked'; errors: string[] };
  side_effects_executed: false;
  source_ref: { path: string; field: string };
};

export function buildGitLabIssueNoteBridgeCapabilityArtifact(route: RouteTableRoute): GitLabIssueNoteBridgeCapabilityArtifact {
  const declared = stringList(route.declared_capabilities);
  const verified = stringList(route.verified_capabilities);
  const verifiers = stringList(route.capabilities?.verifiers);
  const errors = [
    route.route_id !== GITLAB_ISSUE_NOTE_BRIDGE_CAPABILITY_ROUTE_ID ? 'route_id must be gitlab-issue-note-bridge' : null,
    route.project_path !== GITLAB_ISSUE_NOTE_BRIDGE_CAPABILITY_PROJECT ? 'project_path must be mlive-dev/ai-studio' : null,
    route.enabled !== false ? 'route must be disabled' : null,
    route.capability_status !== 'unavailable' ? 'capability_status must be unavailable' : null,
    route.planning_status !== 'deferred' ? 'planning_status must be deferred' : null,
    route.provider_writes_allowed !== false ? 'provider_writes_allowed must be false' : null,
    JSON.stringify(declared) !== JSON.stringify(DECLARED_CAPABILITIES) ? 'declared_capabilities mismatch' : null,
    verified.length !== 0 ? 'verified_capabilities must be empty' : null,
    JSON.stringify(verifiers) !== JSON.stringify(VERIFIERS) ? 'verifiers mismatch' : null,
  ].filter((error): error is string => error !== null);
  return {
    schema: 'zj-loop.capability.v1',
    route_artifact_schema: GITLAB_ISSUE_NOTE_BRIDGE_CAPABILITY_SCHEMA,
    provider: 'gitlab',
    project_path: typeof route.project_path === 'string' ? route.project_path : '',
    route_id: typeof route.route_id === 'string' ? route.route_id : '',
    status: errors.length === 0 ? 'unavailable' : 'blocked',
    planning_status: 'deferred',
    enabled: route.enabled === true,
    provider_writes_allowed: false,
    declared_capabilities: declared,
    verified_capabilities: verified,
    verifiers,
    verification: { status: errors.length === 0 ? 'verified' : 'blocked', errors },
    side_effects_executed: false,
    source_ref: { path: 'zj-loop/zj-loop-route-table.yaml', field: 'disabled_dispatch_routes.gitlab-issue-note-bridge' },
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? [...value] : [];
}
