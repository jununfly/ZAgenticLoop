import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ROUTE_DECISION_SCHEMA } from './issue-fix-request-contract.js';
export const ACTIVATION_SCHEMA_VERSION = 1;
export const ALLOWED_ACTIVATION_PATTERNS = ['roadmap-sliced-development'];
export const ALLOWED_ACTIVATION_PERMISSIONS = ['admin', 'maintain', 'write'];
export const ACTIVATION_KINDS = {
    request: 'zj-loop.activation-request',
    consumed: 'zj-loop.activation-consumed',
    failed: 'zj-loop.activation-failed',
    denied: 'zj-loop.activation-denied',
    duplicate: 'zj-loop.activation-duplicate',
    resumeExisting: 'zj-loop.activation-resume-existing',
    resumeBlocked: 'zj-loop.activation-resume-blocked',
    unsupportedPattern: 'zj-loop.unsupported-pattern',
};
const RESUME_ANCHOR_FIELDS = ['roadmap_branch', 'roadmap_file', 'roadmap_view', 'next_action'];
const STRUCTURED_COMMENT_PATTERN = /<!--\s*zj-loop(?<body>[\s\S]*?)-->/g;
export async function readActivationComments(path) {
    return JSON.parse(await readFile(path, 'utf8'));
}
export function parseStartCommand(commandText) {
    const trimmed = String(commandText ?? '').trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length !== 3 || parts[0] !== '/zj-loop' || parts[1] !== 'start') {
        return { ok: false, reason: 'invalid-command-shape', commandText: trimmed };
    }
    const pattern = parts[2];
    if (!ALLOWED_ACTIVATION_PATTERNS.includes(pattern)) {
        return { ok: false, reason: 'unsupported-pattern', commandText: trimmed, pattern };
    }
    return { ok: true, commandText: trimmed, pattern };
}
export function isAllowedActivationPermission(permission) {
    return ALLOWED_ACTIVATION_PERMISSIONS.includes(String(permission ?? '').toLowerCase());
}
export function parseStructuredActivationComments(comments) {
    const parsed = [];
    for (const comment of Array.isArray(comments) ? comments : []) {
        const body = String(comment.body ?? '');
        for (const match of body.matchAll(STRUCTURED_COMMENT_PATTERN)) {
            const fields = parseFields(match.groups?.body);
            if (!fields.kind || !String(fields.kind).startsWith('zj-loop.'))
                continue;
            parsed.push({
                commentId: comment.id,
                author: comment.author,
                createdAt: comment.createdAt,
                fields,
            });
        }
    }
    return parsed;
}
export function deriveActivationState(comments, options = {}) {
    const events = Array.isArray(comments) && comments.some((comment) => comment.fields)
        ? comments
        : parseStructuredActivationComments(comments);
    const issue = options.sourceIssue === undefined ? undefined : String(options.sourceIssue);
    const pattern = options.pattern;
    const byRequestId = new Map();
    const auditEvents = [];
    for (const event of events) {
        const { fields } = event;
        if (issue !== undefined && String(fields.source_issue) !== issue)
            continue;
        if (pattern !== undefined && fields.pattern !== pattern)
            continue;
        if (fields.kind === ACTIVATION_KINDS.request) {
            const requestId = fields.request_id;
            if (!requestId) {
                auditEvents.push({ ...event, currentState: 'inconsistent', reason: 'missing-request-id' });
                continue;
            }
            const existing = byRequestId.get(requestId);
            if (existing?.request) {
                existing.inconsistent = true;
                existing.reasons.push('duplicate-request-event');
            }
            else {
                byRequestId.set(requestId, {
                    requestId,
                    request: event,
                    lifecycle: [],
                    currentState: 'pending',
                    inconsistent: false,
                    reasons: [],
                });
            }
            continue;
        }
        if (fields.kind === ACTIVATION_KINDS.consumed || fields.kind === ACTIVATION_KINDS.failed) {
            const requestId = fields.request_id;
            if (!requestId) {
                auditEvents.push({ ...event, currentState: 'inconsistent', reason: 'missing-request-id' });
                continue;
            }
            const record = byRequestId.get(requestId) ?? {
                requestId,
                request: null,
                lifecycle: [],
                currentState: 'inconsistent',
                inconsistent: true,
                reasons: ['lifecycle-before-request'],
            };
            record.lifecycle.push(event);
            byRequestId.set(requestId, record);
            continue;
        }
        auditEvents.push({ ...event, currentState: 'audit-only' });
    }
    const requests = [...byRequestId.values()].map(finalizeRequestState);
    return {
        requests,
        auditEvents,
        pendingRequests: requests.filter((request) => request.currentState === 'pending'),
        inconsistentRequests: requests.filter((request) => request.currentState === 'inconsistent'),
    };
}
export function evaluateActivationCommand(input) {
    const command = parseStartCommand(input.commandText);
    if (!command.ok) {
        return {
            action: command.reason === 'unsupported-pattern' ? 'unsupported-pattern' : 'invalid-command',
            pattern: command.pattern,
            reason: command.reason,
        };
    }
    if (!isAllowedActivationPermission(input.requestedByPermission)) {
        return {
            action: 'denied',
            pattern: command.pattern,
            reason: 'insufficient-permission',
        };
    }
    const state = deriveActivationState(input.comments ?? [], {
        sourceIssue: input.sourceIssue,
        pattern: command.pattern,
    });
    if (state.inconsistentRequests.length > 0) {
        return {
            action: 'blocked',
            pattern: command.pattern,
            reason: 'ambiguous-activation-state',
            inconsistentRequestIds: state.inconsistentRequests.map((request) => request.requestId),
        };
    }
    if (state.pendingRequests.length > 0) {
        return {
            action: 'duplicate',
            pattern: command.pattern,
            existingRequestId: state.pendingRequests[0].requestId,
        };
    }
    const consumedRequests = state.requests.filter((request) => request.currentState === 'consumed');
    if (consumedRequests.length > 0) {
        const consumed = consumedRequests[0];
        const consumedEvent = consumed.lifecycle.find((event) => event.fields.kind === ACTIVATION_KINDS.consumed);
        const missingResumeAnchors = missingResumeAnchorFields(consumedEvent?.fields);
        if (missingResumeAnchors.length > 0) {
            return {
                action: 'blocked',
                pattern: command.pattern,
                reason: 'missing-resume-anchors',
                existingRequestId: consumed.requestId,
                consumedCommentId: consumedEvent?.commentId,
                missingResumeAnchors,
            };
        }
        return {
            action: 'resume-existing',
            pattern: command.pattern,
            existingRequestId: consumed.requestId,
            consumedCommentId: consumedEvent?.commentId,
            resumeAnchors: normalizeResumeAnchors(consumedEvent.fields),
        };
    }
    return {
        action: 'create-request',
        pattern: command.pattern,
    };
}
export function dispatchRoadmapActivationCommand(input) {
    const now = input.now ?? new Date().toISOString();
    const requestId = input.requestId ?? `rsd-${input.sourceIssue}-${stableTimestamp(now)}`;
    const command = parseStartCommand(input.commandText);
    const routeDecision = buildRoadmapActivationRouteDecision({
        route: input.route,
        commandText: input.commandText,
        requestedByPermission: input.requestedByPermission,
        sourceIssue: input.sourceIssue,
    });
    if (!routeDecision.allowed) {
        if (routeDecision.reason === 'insufficient-permission' && command.ok) {
            return {
                action: 'denied',
                routeDecision,
                commentBody: buildActivationDeniedComment({
                    sourceIssue: input.sourceIssue,
                    pattern: command.pattern,
                    deniedAt: now,
                    commandCommentId: input.commandCommentId,
                    commandText: input.commandText,
                    requestedBy: input.requestedBy,
                    requestedByPermission: input.requestedByPermission,
                    reason: routeDecision.reason,
                }),
            };
        }
        if (routeDecision.reason === 'unsupported-pattern') {
            return {
                action: 'unsupported-pattern',
                routeDecision,
                commentBody: buildUnsupportedPatternComment({
                    sourceIssue: input.sourceIssue,
                    unsupportedPattern: command.pattern,
                    commandCommentId: input.commandCommentId,
                    commandText: input.commandText,
                    rejectedAt: now,
                }),
            };
        }
        return { action: 'route-denied', routeDecision, commentBody: null };
    }
    const evaluation = evaluateActivationCommand({
        commandText: input.commandText,
        requestedByPermission: input.requestedByPermission,
        sourceIssue: input.sourceIssue,
        comments: input.comments ?? [],
    });
    if (evaluation.action === 'create-request') {
        return {
            action: 'create-request',
            routeDecision,
            commentBody: buildActivationRequestComment({
                requestId,
                sourceIssue: input.sourceIssue,
                pattern: evaluation.pattern,
                requestedBy: input.requestedBy,
                requestedByPermission: input.requestedByPermission,
                requestedAt: now,
                commandCommentId: input.commandCommentId,
                commandText: input.commandText,
            }),
        };
    }
    if (evaluation.action === 'duplicate') {
        return {
            action: 'duplicate',
            routeDecision,
            commentBody: buildActivationDuplicateComment({
                sourceIssue: input.sourceIssue,
                pattern: evaluation.pattern,
                duplicateAt: now,
                commandCommentId: input.commandCommentId,
                commandText: input.commandText,
                existingRequestId: evaluation.existingRequestId,
            }),
        };
    }
    if (evaluation.action === 'resume-existing') {
        return {
            action: 'resume-existing',
            routeDecision,
            commentBody: buildActivationResumeExistingComment({
                sourceIssue: input.sourceIssue,
                pattern: evaluation.pattern,
                requestId: evaluation.existingRequestId,
                resumedAt: now,
                commandCommentId: input.commandCommentId,
                commandText: input.commandText,
                consumedCommentId: evaluation.consumedCommentId,
                resumeAnchors: evaluation.resumeAnchors,
            }),
        };
    }
    if (evaluation.action === 'blocked' && evaluation.reason === 'missing-resume-anchors') {
        return {
            action: 'blocked',
            routeDecision,
            reason: evaluation.reason,
            commentBody: buildActivationResumeBlockedComment({
                sourceIssue: input.sourceIssue,
                pattern: evaluation.pattern,
                requestId: evaluation.existingRequestId,
                blockedAt: now,
                commandCommentId: input.commandCommentId,
                commandText: input.commandText,
                consumedCommentId: evaluation.consumedCommentId,
                reason: evaluation.reason,
                missingResumeAnchors: evaluation.missingResumeAnchors,
            }),
        };
    }
    return {
        action: evaluation.action,
        routeDecision,
        commentBody: null,
        reason: evaluation.reason,
    };
}
export function buildRoadmapActivationRouteDecision(input) {
    const command = parseStartCommand(input.commandText);
    const normalizedPermission = String(input.requestedByPermission ?? '').toLowerCase();
    const routeEnabled = input.route?.enabled === true;
    const requestKindAllowed = input.route?.request_kind === 'activation-comment';
    const consumerAllowed = input.route?.consumer === 'roadmap-sliced-development';
    const permissionAllowed = ALLOWED_ACTIVATION_PERMISSIONS.includes(normalizedPermission);
    const signalId = `issue:${input.sourceIssue}:activation-command`;
    const allowed = command.ok && routeEnabled && requestKindAllowed && consumerAllowed && permissionAllowed;
    const reason = routeDecisionReason({
        command,
        route: input.route,
        routeEnabled,
        requestKindAllowed,
        consumerAllowed,
        permissionAllowed,
    });
    return {
        schema: ROUTE_DECISION_SCHEMA,
        decision_id: `rd_activation_${stableHash(`${signalId}:${command.pattern ?? command.commandText}`)}`,
        source_signal_id: signalId,
        signal_id: signalId,
        source: 'issue',
        subject: `issue #${input.sourceIssue}`,
        priority: 'P2',
        state: 'none',
        route: 'roadmap-sliced-development',
        request_kind: input.route?.request_kind ?? 'activation-comment',
        requested_action: 'activate',
        target_consumer: input.route?.consumer ?? 'roadmap-sliced-development',
        allowed,
        status: allowed ? 'pending' : 'denied',
        guards: {
            route_enabled: routeEnabled,
            request_kind_allowed: requestKindAllowed,
            permission_allowed: permissionAllowed,
            consumer_allowed: consumerAllowed,
        },
        risk: 'medium',
        confidence: allowed ? 'high' : 'medium',
        evidence: [`issue:${input.sourceIssue}`],
        producer: input.producer ?? 'daily-triage',
        dedupe_key: `issue:${input.sourceIssue}:roadmap-sliced-development`,
        reason,
        source_run_id: input.sourceRunId ?? 'roadmap-activation-runner',
        created_at: '2026-07-06T00:00:00Z',
    };
}
export function buildActivationRequestComment(input) {
    return formatStructuredComment({
        kind: ACTIVATION_KINDS.request,
        version: ACTIVATION_SCHEMA_VERSION,
        request_id: input.requestId,
        source_issue: input.sourceIssue,
        pattern: input.pattern,
        requested_by: input.requestedBy,
        requested_by_permission: input.requestedByPermission,
        requested_at: input.requestedAt,
        request_status: 'pending',
        command_comment_id: input.commandCommentId,
        command_text: input.commandText,
    }, 'Roadmap-Sliced Development activation requested.');
}
export function buildActivationConsumedComment(input) {
    return formatStructuredComment({
        kind: ACTIVATION_KINDS.consumed,
        version: ACTIVATION_SCHEMA_VERSION,
        request_id: input.requestId,
        source_issue: input.sourceIssue,
        pattern: input.pattern,
        consumed_at: input.consumedAt,
        consumer: 'roadmap-sliced-development',
        roadmap_branch: input.roadmapBranch,
        roadmap_file: input.roadmapFile,
        roadmap_view: input.roadmapView,
        next_action: input.nextAction,
    }, 'Activation consumed by Roadmap-Sliced Development.');
}
export function buildActivationFailedComment(input) {
    return formatStructuredComment({
        kind: ACTIVATION_KINDS.failed,
        version: ACTIVATION_SCHEMA_VERSION,
        request_id: input.requestId,
        source_issue: input.sourceIssue,
        pattern: input.pattern,
        failed_at: input.failedAt,
        reason: input.reason,
        next_action: input.nextAction,
    }, 'Activation request failed before Roadmap-Sliced execution.');
}
function buildActivationDeniedComment(input) {
    return formatStructuredComment({
        kind: ACTIVATION_KINDS.denied,
        version: ACTIVATION_SCHEMA_VERSION,
        source_issue: input.sourceIssue,
        pattern: input.pattern,
        denied_at: input.deniedAt,
        command_comment_id: input.commandCommentId,
        command_text: input.commandText,
        requested_by: input.requestedBy,
        requested_by_permission: input.requestedByPermission,
        reason: input.reason ?? 'insufficient-permission',
    }, 'Activation denied. Only maintainers or collaborators may start Roadmap-Sliced Development.');
}
function buildActivationDuplicateComment(input) {
    return formatStructuredComment({
        kind: ACTIVATION_KINDS.duplicate,
        version: ACTIVATION_SCHEMA_VERSION,
        source_issue: input.sourceIssue,
        pattern: input.pattern,
        duplicate_at: input.duplicateAt,
        command_comment_id: input.commandCommentId,
        command_text: input.commandText,
        existing_request_id: input.existingRequestId,
    }, 'Duplicate activation request ignored.');
}
function buildActivationResumeExistingComment(input) {
    const anchors = input.resumeAnchors ?? {};
    return formatStructuredComment({
        kind: ACTIVATION_KINDS.resumeExisting,
        version: ACTIVATION_SCHEMA_VERSION,
        source_issue: input.sourceIssue,
        pattern: input.pattern,
        request_id: input.requestId,
        resumed_at: input.resumedAt,
        command_comment_id: input.commandCommentId,
        command_text: input.commandText,
        consumed_comment_id: input.consumedCommentId,
        resume_policy: 'resume-without-new-activation',
        roadmap_branch: anchors.roadmapBranch,
        roadmap_file: anchors.roadmapFile,
        roadmap_view: anchors.roadmapView,
        next_action: anchors.nextAction,
    }, 'Activation already consumed. Resume the existing Roadmap-Sliced Development lifecycle.');
}
function buildActivationResumeBlockedComment(input) {
    return formatStructuredComment({
        kind: ACTIVATION_KINDS.resumeBlocked,
        version: ACTIVATION_SCHEMA_VERSION,
        source_issue: input.sourceIssue,
        pattern: input.pattern,
        request_id: input.requestId,
        blocked_at: input.blockedAt,
        command_comment_id: input.commandCommentId,
        command_text: input.commandText,
        consumed_comment_id: input.consumedCommentId,
        reason: input.reason,
        missing_resume_anchors: (input.missingResumeAnchors ?? []).join(','),
    }, 'Activation resume blocked. Existing consumed activation is missing required resume anchors.');
}
function buildUnsupportedPatternComment(input) {
    return formatStructuredComment({
        kind: ACTIVATION_KINDS.unsupportedPattern,
        version: ACTIVATION_SCHEMA_VERSION,
        source_issue: input.sourceIssue,
        unsupported_pattern: input.unsupportedPattern,
        command_comment_id: input.commandCommentId,
        command_text: input.commandText,
        rejected_at: input.rejectedAt,
        reason: 'unsupported-pattern',
    }, 'Unsupported ZAgenticLoop activation pattern.');
}
function finalizeRequestState(record) {
    if (!record.request)
        return { ...record, currentState: 'inconsistent' };
    const terminalEvents = record.lifecycle.filter((event) => event.fields.kind === ACTIVATION_KINDS.consumed || event.fields.kind === ACTIVATION_KINDS.failed);
    if (terminalEvents.length > 1) {
        return {
            ...record,
            currentState: 'inconsistent',
            inconsistent: true,
            reasons: [...record.reasons, 'multiple-terminal-events'],
        };
    }
    if (terminalEvents.length === 1) {
        const kind = terminalEvents[0].fields.kind;
        return { ...record, currentState: kind === ACTIVATION_KINDS.consumed ? 'consumed' : 'failed' };
    }
    if (record.inconsistent)
        return { ...record, currentState: 'inconsistent' };
    return record;
}
function missingResumeAnchorFields(fields = {}) {
    return RESUME_ANCHOR_FIELDS.filter((field) => !fields[field]);
}
function normalizeResumeAnchors(fields = {}) {
    return {
        roadmapBranch: fields.roadmap_branch,
        roadmapFile: fields.roadmap_file,
        roadmapView: fields.roadmap_view,
        nextAction: fields.next_action,
    };
}
function routeDecisionReason(input) {
    if (!input.command.ok)
        return input.command.reason;
    if (!input.route)
        return 'roadmap-activation-route-missing';
    if (!input.routeEnabled)
        return 'roadmap-activation-route-disabled';
    if (!input.requestKindAllowed)
        return 'roadmap-activation-request-kind-invalid';
    if (!input.consumerAllowed)
        return 'roadmap-activation-consumer-invalid';
    if (!input.permissionAllowed)
        return 'insufficient-permission';
    return 'activation route matched';
}
function parseFields(rawBody) {
    const fields = {};
    for (const rawLine of String(rawBody ?? '').split('\n')) {
        const line = rawLine.trim();
        if (!line || line === 'zj-loop')
            continue;
        const separator = line.indexOf(':');
        if (separator === -1)
            continue;
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        if (key)
            fields[key] = unquote(value);
    }
    return fields;
}
function unquote(value) {
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }
    return value;
}
function formatStructuredComment(fields, visibleText) {
    const lines = Object.entries(fields).map(([key, value]) => `${key}: ${quoteIfNeeded(value)}`);
    return `<!-- zj-loop\n${lines.join('\n')}\n-->\n${visibleText}\n`;
}
function quoteIfNeeded(value) {
    const stringValue = String(value);
    if (/[:#\n]|^\s|\s$/.test(stringValue))
        return JSON.stringify(stringValue);
    return stringValue;
}
function stableTimestamp(value) {
    return String(value ?? '').replace(/[^0-9A-Za-z]+/g, '').slice(0, 14) || 'now';
}
function stableHash(value) {
    return createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}
