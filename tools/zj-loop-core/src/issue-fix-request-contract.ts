export const ISSUE_FIX_REQUEST_SCHEMA = 'zj-loop.issue_fix_request.v1';
export const ROUTE_DECISION_SCHEMA = 'zj-loop.route_decision.v1';

export const ISSUE_FIX_REQUEST_STATUSES = [
  'requested',
  'duplicate',
  'denied',
  'consumed',
  'pr_opened',
  'failed',
  'completed',
] as const;

export const ISSUE_FIX_REQUEST_KINDS = [
  'issue-fix-request',
  'activation-comment',
  'workflow-dispatch',
  'report-only',
] as const;

const ACTIVE_REQUEST_STATUSES = new Set(['requested', 'consumed', 'pr_opened']);

const ALLOWED_TRANSITIONS = new Map([
  ['requested', new Set(['duplicate', 'denied', 'consumed', 'failed'])],
  ['consumed', new Set(['pr_opened', 'failed'])],
  ['pr_opened', new Set(['completed', 'failed'])],
]);

const ISSUE_FIX_REQUEST_COMMENT_PATTERN =
  /<!--\s*zj-loop:issue-fix-request\s+(?<json>[\s\S]*?)-->/g;

const REQUIRED_TOP_LEVEL_FIELDS = [
  'schema',
  'request_id',
  'status',
  'created_at',
  'source_signal',
  'route_decision',
  'dedupe_key',
  'requested_consumer',
  'fix_scope',
  'acceptance_criteria',
  'verification_gate',
  'failure_policy',
  'lifecycle',
];

export function buildIssueFixRequestComment(request: any): string {
  const validation = validateIssueFixRequest(request);
  if (!validation.ok) {
    throw new Error(`Invalid Issue Fix Request: ${validation.errors.join(', ')}`);
  }

  return [
    '<!-- zj-loop:issue-fix-request',
    JSON.stringify(request, null, 2),
    '-->',
    'Issue Fix Request created for an allowlisted Fix Consumer.',
    '',
  ].join('\n');
}

export function buildIssueFixRequestLifecycleComment(request: any): string {
  const validation = validateIssueFixRequest(request);
  if (!validation.ok) {
    throw new Error(`Invalid Issue Fix Request lifecycle event: ${validation.errors.join(', ')}`);
  }

  return [
    '<!-- zj-loop:issue-fix-request',
    JSON.stringify(request, null, 2),
    '-->',
    `Issue Fix Request lifecycle updated to ${request.status}.`,
    '',
  ].join('\n');
}

export function parseIssueFixRequestComments(comments: any[]) {
  const parsed = [];
  for (const comment of Array.isArray(comments) ? comments : []) {
    const body = String(comment.body ?? '');
    for (const match of body.matchAll(ISSUE_FIX_REQUEST_COMMENT_PATTERN)) {
      try {
        const request = JSON.parse(match.groups?.json.trim() ?? '');
        if (request?.schema !== ISSUE_FIX_REQUEST_SCHEMA) continue;
        parsed.push({
          commentId: comment.id,
          author: comment.author,
          createdAt: comment.createdAt,
          request,
          validation: validateIssueFixRequest(request),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        parsed.push({
          commentId: comment.id,
          author: comment.author,
          createdAt: comment.createdAt,
          request: null,
          validation: { ok: false, errors: [`invalid-json: ${message}`] },
        });
      }
    }
  }
  return parsed;
}

export function validateIssueFixRequest(request: any) {
  const errors: string[] = [];
  if (!request || typeof request !== 'object') {
    return { ok: false, errors: ['request must be an object'] };
  }

  for (const field of REQUIRED_TOP_LEVEL_FIELDS) {
    if (request[field] === undefined || request[field] === null || request[field] === '') {
      errors.push(`missing ${field}`);
    }
  }

  if (request.schema !== ISSUE_FIX_REQUEST_SCHEMA) {
    errors.push(`schema must be ${ISSUE_FIX_REQUEST_SCHEMA}`);
  }
  if (!ISSUE_FIX_REQUEST_STATUSES.includes(request.status)) {
    errors.push(`unsupported status ${request.status}`);
  }
  if (request.route_decision?.request_kind !== 'issue-fix-request') {
    errors.push('route_decision.request_kind must be issue-fix-request');
  }
  if (request.route_decision?.target_consumer !== request.requested_consumer?.consumer_id) {
    errors.push('route_decision.target_consumer must match requested_consumer.consumer_id');
  }
  if (request.route_decision?.dedupe_key !== request.dedupe_key) {
    errors.push('route_decision.dedupe_key must match dedupe_key');
  }
  if (!Array.isArray(request.acceptance_criteria) || request.acceptance_criteria.length === 0) {
    errors.push('acceptance_criteria must be a non-empty array');
  }
  if (!Array.isArray(request.verification_gate?.commands) || request.verification_gate.commands.length === 0) {
    errors.push('verification_gate.commands must be a non-empty array');
  }
  if (request.failure_policy?.retry !== 'new_request_only') {
    errors.push('failure_policy.retry must be new_request_only');
  }

  return { ok: errors.length === 0, errors };
}

export function resolveIssueFixRequestDedupe(input: { existingRequests: any[]; dedupeKey: string }) {
  const duplicate = (Array.isArray(input.existingRequests) ? input.existingRequests : [])
    .find((request) => request?.dedupe_key === input.dedupeKey && ACTIVE_REQUEST_STATUSES.has(request?.status));

  if (!duplicate) return { action: 'create-request' };

  return {
    action: 'duplicate',
    existing_request_id: duplicate.request_id,
    existing_status: duplicate.status,
    existing_request_url: duplicate.issue_url ?? duplicate.source_url ?? duplicate.url ?? '',
  };
}

export function validateIssueFixRequestTransition(fromStatus: string, toStatus: string) {
  if (fromStatus === toStatus && ISSUE_FIX_REQUEST_STATUSES.includes(fromStatus as any)) {
    return { ok: true, errors: [] };
  }
  const allowed = ALLOWED_TRANSITIONS.get(fromStatus);
  if (allowed?.has(toStatus)) return { ok: true, errors: [] };
  return { ok: false, errors: [`invalid transition ${fromStatus} -> ${toStatus}`] };
}

export function deriveIssueFixRequestState(comments: any[]) {
  const events = parseIssueFixRequestComments(comments).filter((event) => event.request);
  const records = new Map();
  const auditEvents = [];

  for (const event of events) {
    const requestId = event.request.request_id;
    if (!requestId) {
      auditEvents.push({ ...event, currentState: 'inconsistent', reason: 'missing-request-id' });
      continue;
    }

    const record = records.get(requestId) ?? {
      requestId,
      dedupeKey: event.request.dedupe_key,
      events: [],
      currentState: event.request.status,
      inconsistent: false,
      reasons: [],
    };

    const previousStatus = record.events.at(-1)?.request?.status;
    if (previousStatus) {
      const transition = validateIssueFixRequestTransition(previousStatus, event.request.status);
      if (!transition.ok) {
        record.inconsistent = true;
        record.reasons.push(...transition.errors);
      }
    }

    record.events.push(event);
    record.currentState = record.inconsistent ? 'inconsistent' : event.request.status;
    records.set(requestId, record);
  }

  const requests = [...records.values()];
  return {
    requests,
    auditEvents,
    activeRequests: requests.filter((request) => ACTIVE_REQUEST_STATUSES.has(request.currentState)),
    inconsistentRequests: requests.filter((request) => request.currentState === 'inconsistent'),
  };
}

export function applyFixConsumerTransition(input: {
  request: any;
  consumerId: string;
  transition: string;
  linkedPr?: string;
  reason?: string;
  at?: string;
}) {
  if (input.request?.requested_consumer?.consumer_id !== input.consumerId) {
    throw new Error(`consumer ${input.consumerId} cannot claim request for ${input.request?.requested_consumer?.consumer_id}`);
  }

  const nextStatus = statusForConsumerTransition(input.transition);
  const transitionValidation = validateIssueFixRequestTransition(input.request.status, nextStatus);
  if (!transitionValidation.ok) {
    throw new Error(transitionValidation.errors.join(', '));
  }

  const next = structuredClone(input.request);
  next.status = nextStatus;
  next.lifecycle = {
    ...next.lifecycle,
    consumed_by: next.lifecycle?.consumed_by ?? input.consumerId,
    updated_at: input.at ?? new Date().toISOString(),
  };

  if (input.transition === 'open_pr') {
    if (!input.linkedPr) throw new Error('linkedPr is required for open_pr');
    next.lifecycle.linked_pr = input.linkedPr;
  }
  if (input.transition === 'fail') {
    next.lifecycle.failure_reason = input.reason ?? 'consumer-failed';
    next.lifecycle.closed_at = input.at ?? new Date().toISOString();
  }
  if (input.transition === 'complete') {
    next.lifecycle.closed_at = input.at ?? new Date().toISOString();
  }

  return next;
}

function statusForConsumerTransition(transition: string) {
  const statuses: Record<string, string> = {
    claim: 'consumed',
    open_pr: 'pr_opened',
    fail: 'failed',
    complete: 'completed',
  };
  const status = statuses[transition];
  if (!status) throw new Error(`unsupported consumer transition ${transition}`);
  return status;
}
