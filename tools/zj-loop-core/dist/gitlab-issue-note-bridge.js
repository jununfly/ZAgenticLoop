import { createHash, timingSafeEqual } from 'node:crypto';
export const GITLAB_ISSUE_NOTE_BRIDGE_SCHEMA = 'zj-loop.gitlab_issue_note_bridge.v1';
export const GITLAB_ISSUE_NOTE_EVENT = 'Note Hook';
export const GITLAB_ISSUE_NOTE_LEGACY_EVENT = 'Issue Hook';
export const GITLAB_ISSUE_NOTE_EVENTS = [GITLAB_ISSUE_NOTE_EVENT, GITLAB_ISSUE_NOTE_LEGACY_EVENT];
export const GITLAB_BRIDGE_AUTH_SOURCE = 'GITLAB_WEBHOOK_SECRET';
export function buildGitLabIssueNoteBridgeEnvelope(input) {
    const blocked = (reason) => ({
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
    if (!isGitLabIssueNoteEvent(input.headers.event)) {
        return blocked('event-not-allowed');
    }
    if (!input.headers.eventId?.trim()) {
        return blocked('event-id-required');
    }
    const payload = input.payload;
    if (stringValue(payload?.project?.path_with_namespace) !== input.projectPath) {
        return blocked('project-mismatch');
    }
    const attributes = payload?.object_attributes;
    if (attributes?.noteable_type !== 'Issue') {
        return {
            schema: GITLAB_ISSUE_NOTE_BRIDGE_SCHEMA,
            status: 'ignored',
            reason: undefined,
            side_effects_executed: false,
            envelope: null,
        };
    }
    const actionIsValid = input.headers.event === GITLAB_ISSUE_NOTE_EVENT
        ? attributes?.action === undefined || attributes.action === 'create'
        : attributes?.action === 'create';
    if (!['note', 'issue'].includes(String(payload?.object_kind))
        || !actionIsValid) {
        return blocked('issue-note-invalid');
    }
    const issueIid = positiveInteger(attributes.noteable_iid ?? payload.issue?.iid);
    const noteId = positiveInteger(attributes.id);
    const note = typeof attributes.note === 'string' ? attributes.note : '';
    if (!issueIid || !noteId)
        return blocked('issue-note-invalid');
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
            event_type: input.headers.event,
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
function isGitLabIssueNoteEvent(event) {
    return event !== undefined && GITLAB_ISSUE_NOTE_EVENTS.includes(event);
}
function positiveInteger(value) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
function stringValue(value) {
    return typeof value === 'string' && value.trim() ? value : null;
}
function tokensEqual(actual, expected) {
    if (!actual)
        return false;
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
function stableHash(value) {
    return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
