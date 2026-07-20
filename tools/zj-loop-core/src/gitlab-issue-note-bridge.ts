import { createHash, timingSafeEqual } from 'node:crypto';

export const GITLAB_ISSUE_NOTE_BRIDGE_SCHEMA = 'zj-loop.gitlab_issue_note_bridge.v1';
export const GITLAB_ISSUE_NOTE_EVENT = 'Issue Hook';
export const GITLAB_BRIDGE_AUTH_SOURCE = 'GITLAB_WEBHOOK_SECRET';

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

type GitLabIssueNotePayload = {
  object_kind?: unknown;
  object_attributes?: {
    note?: unknown;
    id?: unknown;
    url?: unknown;
    noteable_type?: unknown;
    noteable_iid?: unknown;
    action?: unknown;
  };
  project?: { path_with_namespace?: unknown; web_url?: unknown };
  issue?: { iid?: unknown; web_url?: unknown };
};

export function buildGitLabIssueNoteBridgeEnvelope(input: GitLabIssueNoteWebhookInput): GitLabIssueNoteBridgeDecision {
  const blocked = (reason: NonNullable<GitLabIssueNoteBridgeDecision['reason']>): GitLabIssueNoteBridgeDecision => ({
    schema: GITLAB_ISSUE_NOTE_BRIDGE_SCHEMA,
    status: 'blocked',
    reason,
    side_effects_executed: false,
    envelope: null,
  });

  if (!input.expectedWebhookSecret || !tokensEqual(input.headers.webhookSecret, input.expectedWebhookSecret)) {
    return blocked('unauthorized');
  }
  if (!input.projectPath.trim() || input.projectPath !== input.expectedProjectPath) {
    return blocked('project-mismatch');
  }
  if (input.headers.event !== GITLAB_ISSUE_NOTE_EVENT) {
    return blocked('event-not-allowed');
  }
  if (!input.headers.eventId?.trim()) {
    return blocked('event-id-required');
  }

  const payload = input.payload as GitLabIssueNotePayload;
  if (stringValue(payload?.project?.path_with_namespace) !== input.projectPath) {
    return blocked('project-mismatch');
  }
  const attributes = payload?.object_attributes;
  if (
    payload?.object_kind !== 'issue'
    || attributes?.noteable_type !== 'Issue'
    || attributes.action !== 'create'
  ) {
    return blocked('issue-note-invalid');
  }

  const issueIid = positiveInteger(attributes.noteable_iid ?? payload.issue?.iid);
  const noteId = positiveInteger(attributes.id);
  const note = typeof attributes.note === 'string' ? attributes.note : '';
  if (!issueIid || !noteId) return blocked('issue-note-invalid');

  if (!note.includes(input.route.marker)) {
    return {
      schema: GITLAB_ISSUE_NOTE_BRIDGE_SCHEMA,
      status: 'ignored',
      reason: undefined,
      side_effects_executed: false,
      envelope: null,
    };
  }

  const sourceUrl = stringValue(attributes.url)
    ?? stringValue(payload.issue?.web_url)
    ?? stringValue(payload.project?.web_url)
    ?? '';
  const dedupeKey = stableHash([input.projectPath, input.route.routeId, issueIid, noteId, input.route.marker].join(':'));
  return {
    schema: GITLAB_ISSUE_NOTE_BRIDGE_SCHEMA,
    status: 'accepted',
    side_effects_executed: false,
    envelope: {
      schema: GITLAB_ISSUE_NOTE_BRIDGE_SCHEMA,
      event_id: input.headers.eventId,
      event_type: GITLAB_ISSUE_NOTE_EVENT,
      project_path: input.projectPath,
      issue_iid: issueIid,
      note_id: noteId,
      mr_iid: null,
      source_url: sourceUrl,
      target_route: input.route.targetRoute,
      target_ref: input.route.targetRef,
      received_at: input.receivedAt ?? new Date().toISOString(),
      dedupe_key: `gln_${dedupeKey}`,
      auth_source: GITLAB_BRIDGE_AUTH_SOURCE,
      trigger_pipeline_id: null,
    },
  };
}

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function tokensEqual(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function stableHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
