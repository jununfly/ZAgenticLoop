export const ACTIVATION_SCHEMA_VERSION = 1;

export const ALLOWED_ACTIVATION_PATTERNS = ['roadmap-sliced-development'];
export const ALLOWED_ACTIVATION_PERMISSIONS = ['admin', 'maintain', 'write'];

export const ACTIVATION_KINDS = {
  request: 'zj-loop.activation-request',
  consumed: 'zj-loop.activation-consumed',
  failed: 'zj-loop.activation-failed',
  denied: 'zj-loop.activation-denied',
  duplicate: 'zj-loop.activation-duplicate',
  unsupportedPattern: 'zj-loop.unsupported-pattern',
};

const STRUCTURED_COMMENT_PATTERN = /<!--\s*zj-loop(?<body>[\s\S]*?)-->/g;

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

  for (const comment of comments) {
    const body = String(comment.body ?? '');
    for (const match of body.matchAll(STRUCTURED_COMMENT_PATTERN)) {
      const fields = parseFields(match.groups.body);
      if (!fields.kind || !String(fields.kind).startsWith('zj-loop.')) continue;
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
    if (issue !== undefined && String(fields.source_issue) !== issue) continue;
    if (pattern !== undefined && fields.pattern !== pattern) continue;

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
      } else {
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

    if (
      fields.kind === ACTIVATION_KINDS.consumed ||
      fields.kind === ACTIVATION_KINDS.failed
    ) {
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

  return {
    action: 'create-request',
    pattern: command.pattern,
  };
}

export function buildActivationRequestComment(input) {
  const fields = {
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
  };
  assertRequiredFields(fields, [
    'request_id',
    'source_issue',
    'pattern',
    'requested_by',
    'requested_by_permission',
    'requested_at',
    'command_comment_id',
    'command_text',
  ]);

  return formatStructuredComment(fields, 'Roadmap-Sliced Development activation requested.');
}

export function buildActivationConsumedComment(input) {
  const fields = {
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
  };
  assertRequiredFields(fields, [
    'request_id',
    'source_issue',
    'pattern',
    'consumed_at',
    'roadmap_branch',
    'roadmap_file',
    'roadmap_view',
    'next_action',
  ]);

  return formatStructuredComment(fields, 'Activation consumed by Roadmap-Sliced Development.');
}

export function buildActivationFailedComment(input) {
  const fields = {
    kind: ACTIVATION_KINDS.failed,
    version: ACTIVATION_SCHEMA_VERSION,
    request_id: input.requestId,
    source_issue: input.sourceIssue,
    pattern: input.pattern,
    failed_at: input.failedAt,
    reason: input.reason,
    next_action: input.nextAction,
  };
  assertRequiredFields(fields, [
    'request_id',
    'source_issue',
    'pattern',
    'failed_at',
    'reason',
    'next_action',
  ]);

  return formatStructuredComment(fields, 'Activation request failed before Roadmap-Sliced execution.');
}

export function buildActivationDeniedComment(input) {
  const fields = {
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
  };
  assertRequiredFields(fields, [
    'source_issue',
    'pattern',
    'denied_at',
    'command_comment_id',
    'command_text',
    'requested_by',
    'requested_by_permission',
    'reason',
  ]);

  return formatStructuredComment(
    fields,
    'Activation denied. Only maintainers or collaborators may start Roadmap-Sliced Development.',
  );
}

export function buildActivationDuplicateComment(input) {
  const fields = {
    kind: ACTIVATION_KINDS.duplicate,
    version: ACTIVATION_SCHEMA_VERSION,
    source_issue: input.sourceIssue,
    pattern: input.pattern,
    duplicate_at: input.duplicateAt,
    command_comment_id: input.commandCommentId,
    command_text: input.commandText,
    existing_request_id: input.existingRequestId,
  };
  assertRequiredFields(fields, [
    'source_issue',
    'pattern',
    'duplicate_at',
    'command_comment_id',
    'command_text',
    'existing_request_id',
  ]);

  return formatStructuredComment(fields, 'Duplicate activation request ignored.');
}

export function buildUnsupportedPatternComment(input) {
  const fields = {
    kind: ACTIVATION_KINDS.unsupportedPattern,
    version: ACTIVATION_SCHEMA_VERSION,
    source_issue: input.sourceIssue,
    unsupported_pattern: input.unsupportedPattern,
    command_comment_id: input.commandCommentId,
    command_text: input.commandText,
    rejected_at: input.rejectedAt,
    reason: 'unsupported-pattern',
  };
  assertRequiredFields(fields, [
    'source_issue',
    'unsupported_pattern',
    'command_comment_id',
    'command_text',
    'rejected_at',
    'reason',
  ]);

  return formatStructuredComment(fields, 'Unsupported ZAgenticLoop activation pattern.');
}

function finalizeRequestState(record) {
  if (!record.request) {
    return { ...record, currentState: 'inconsistent' };
  }

  const terminalEvents = record.lifecycle.filter((event) =>
    event.fields.kind === ACTIVATION_KINDS.consumed ||
    event.fields.kind === ACTIVATION_KINDS.failed
  );

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
    return {
      ...record,
      currentState: kind === ACTIVATION_KINDS.consumed ? 'consumed' : 'failed',
    };
  }

  if (record.inconsistent) {
    return { ...record, currentState: 'inconsistent' };
  }

  return record;
}

function parseFields(rawBody) {
  const fields = {};
  for (const rawLine of String(rawBody ?? '').split('\n')) {
    const line = rawLine.trim();
    if (!line || line === 'zj-loop') continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) fields[key] = unquote(value);
  }
  return fields;
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
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
  if (/[:#\n]|^\s|\s$/.test(stringValue)) {
    return JSON.stringify(stringValue);
  }
  return stringValue;
}

function assertRequiredFields(fields, keys) {
  const missing = keys.filter((key) => fields[key] === undefined || fields[key] === '');
  if (missing.length > 0) {
    throw new Error(`Missing required activation field(s): ${missing.join(', ')}`);
  }
}
