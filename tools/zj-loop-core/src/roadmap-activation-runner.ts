import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { ROUTE_DECISION_SCHEMA } from './issue-fix-request-contract.js';
import {
  POST_MERGE_CONTRACT_CONSUMER,
  POST_MERGE_CONTRACT_KIND,
  POST_MERGE_CONTRACT_MODE,
  POST_MERGE_CONTRACT_VERSION,
} from './post-merge-closeout-runner.js';
import {
  buildGitLabApiUrl,
  buildGitLabAuthHeaders,
  buildGitLabBranchApiUrl,
  buildGitLabMergeRequestApiUrl,
} from './providers.js';
import { RouteStatus } from './route.js';

export const ACTIVATION_SCHEMA_VERSION = 1;
export const ALLOWED_ACTIVATION_PATTERNS = ['roadmap-sliced-development'];
export const ALLOWED_ACTIVATION_PERMISSIONS = ['admin', 'maintain', 'write'];
export const DEFAULT_BOUNDED_SLICE_MAX_SLICES = 30;
export const ROADMAP_ACTIVATION_LOOP_MARKER = 'zj-loop.generated.roadmap-activation';
export const ACTIVATION_KINDS = {
  request: 'zj-loop.activation-request',
  consumed: 'zj-loop.activation-consumed',
  failed: 'zj-loop.activation-failed',
  denied: 'zj-loop.activation-denied',
  duplicate: 'zj-loop.activation-duplicate',
  resumeExisting: 'zj-loop.activation-resume-existing',
  resumeBlocked: 'zj-loop.activation-resume-blocked',
  unsupportedPattern: 'zj-loop.unsupported-pattern',
} as const;

const RESUME_ANCHOR_FIELDS = ['roadmap_branch', 'roadmap_file', 'roadmap_view', 'next_action'];
const STRUCTURED_COMMENT_PATTERN = /<!--\s*zj-loop(?<body>[\s\S]*?)-->/g;
const BOUNDED_SLICE_CONTINUATION_CONDITIONS = [
  'current leaf exists in the roadmap process file',
  'current leaf is not completed or deferred',
  'current branch is the activation branch',
  'working tree is clean or changes are attributable to the current slice',
  'slice status, notes, and evidence can be updated before commit',
  'at least one verification command can run and be recorded',
  'slice commit can be created with reviewable intent',
  'completed_slices is less than max_slices',
];
const BOUNDED_SLICE_STOP_CONDITIONS = [
  'max_slices reached',
  'no eligible leaf remains',
  'verification failed',
  'high-risk path encountered',
  'roadmap process file is invalid',
  'requirements are ambiguous and need a human decision',
  'dirty worktree cannot be attributed to the current slice',
  'denylisted secret, auth, billing, payment, infrastructure, or migration path encountered',
  'token, budget, or pause gate triggered',
];

export async function readActivationComments(path: string) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export function parseStartCommand(commandText: string) {
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

export function isAllowedActivationPermission(permission: string) {
  return ALLOWED_ACTIVATION_PERMISSIONS.includes(String(permission ?? '').toLowerCase());
}

export function parseStructuredActivationComments(comments: any[]) {
  const parsed = [];

  for (const comment of Array.isArray(comments) ? comments : []) {
    const body = String(comment.body ?? '');
    for (const match of body.matchAll(STRUCTURED_COMMENT_PATTERN)) {
      const fields = parseFields(match.groups?.body);
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

export function deriveActivationState(comments: any[], options: { sourceIssue?: string | number; pattern?: string } = {}) {
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

export function evaluateActivationCommand(input: {
  commandText: string;
  requestedByPermission: string;
  sourceIssue: string | number;
  comments?: any[];
}) {
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
    const consumedEvent = consumed.lifecycle.find((event: any) => event.fields.kind === ACTIVATION_KINDS.consumed);
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

export function dispatchRoadmapActivationCommand(input: {
  route: RouteStatus;
  commandText: string;
  requestedBy: string;
  requestedByPermission: string;
  sourceIssue: string | number;
  commandCommentId: string | number;
  comments?: any[];
  now?: string;
  requestId?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  const requestId = input.requestId ?? buildActivationRequestId({
    sourceIssue: input.sourceIssue,
    commandCommentId: input.commandCommentId,
    commandText: input.commandText,
  });
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

export function buildRoadmapActivationRouteDecision(input: {
  route?: RouteStatus;
  commandText: string;
  requestedByPermission: string;
  sourceIssue: string | number;
  producer?: string;
  sourceRunId?: string;
}) {
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

export function buildActivationRequestComment(input: any) {
  return formatStructuredComment({
    kind: ACTIVATION_KINDS.request,
    version: ACTIVATION_SCHEMA_VERSION,
    request_id: input.requestId,
    activation_request_id: input.requestId,
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

export function buildActivationRequestId(input: {
  sourceIssue: string | number;
  commandCommentId: string | number;
  commandText: string;
}) {
  const sourceIssue = slugPart(input.sourceIssue, 'issue');
  const commentId = slugPart(input.commandCommentId, 'comment');
  const commandHash = stableHash(input.commandText).slice(0, 8);
  return `act-${sourceIssue}-${commentId}-${commandHash}`;
}

export function buildRoadmapActivationBranchName(input: {
  activationRequestId: string;
  title?: string;
  sourceIssue?: string | number;
}) {
  const requestSlug = slugPart(input.activationRequestId, 'activation');
  const fallbackTitle = input.sourceIssue === undefined ? 'activation' : `issue-${input.sourceIssue}`;
  const titleSlug = slugWithFallback(input.title, fallbackTitle);
  return ['zjal', requestSlug, titleSlug].filter(Boolean).join('-').replace(/-+$/g, '');
}

export function buildRoadmapActivationPrTitle(input: { title?: string; sourceIssue?: string | number }) {
  const title = String(input.title ?? `issue #${input.sourceIssue ?? 'unknown'}`).trim();
  return `Roadmap Activation: ${title}`;
}

export type RoadmapActivationReviewProvider = 'github' | 'gitlab';

export function buildRoadmapActivationReviewTitle(input: {
  provider?: RoadmapActivationReviewProvider;
  title?: string;
  sourceIssue?: string | number;
}) {
  const title = String(input.title ?? `issue #${input.sourceIssue ?? 'unknown'}`).trim();
  return `Roadmap Activation: ${title}`;
}

export function buildRoadmapActivationReviewContract(input: {
  provider: RoadmapActivationReviewProvider;
  activationRequestId: string;
  sourceIssue?: string | number;
  sourceCommentId?: string | number;
  sourceIssueUrl: string;
  sourceCommentUrl: string;
  routeId?: string;
  consumerId?: string;
  branchName: string;
  lifecycleState: RoadmapActivationLifecycleState;
  closeoutContract: {
    activationCarrierIssue?: string | number;
    branchName?: string;
    processRoadmapPath?: string;
  };
}) {
  const reviewKind = input.provider === 'gitlab' ? 'merge-request' : 'pull-request';
  const contract = {
    schema: 'zj-loop.roadmap_activation_review_contract.v1',
    provider: input.provider,
    review_kind: reviewKind,
    activation_request_id: input.activationRequestId,
    source_issue: input.sourceIssue ?? '',
    source_comment_id: input.sourceCommentId ?? '',
    source_issue_url: input.sourceIssueUrl,
    source_comment_url: input.sourceCommentUrl,
    route_id: input.routeId ?? 'roadmap-sliced-development',
    consumer_id: input.consumerId ?? 'roadmap-sliced-development',
    branch_name: input.branchName,
    lifecycle_state: input.lifecycleState,
    closeout_contract: {
      activation_carrier_issue: input.closeoutContract.activationCarrierIssue ?? '',
      branch_name: input.closeoutContract.branchName ?? input.branchName,
      process_roadmap_path: input.closeoutContract.processRoadmapPath ?? '',
    },
  };
  const label = input.provider === 'gitlab' ? 'MR' : 'PR';
  const postMergeContract = buildPostMergeCloseoutContractBlock({
    roadmapId: input.activationRequestId,
    branchName: contract.closeout_contract.branch_name,
    carrierIssue: contract.closeout_contract.activation_carrier_issue,
    processRoadmapPath: contract.closeout_contract.process_roadmap_path,
  });
  return [
    '<!-- zj-loop.roadmap-activation-review-contract',
    JSON.stringify(contract, null, 2),
    '-->',
    `### Roadmap Activation ${label} Contract`,
    '',
    `- provider: \`${contract.provider}\``,
    `- review_kind: \`${contract.review_kind}\``,
    `- activation_request_id: \`${contract.activation_request_id}\``,
    `- route_id: \`${contract.route_id}\``,
    `- consumer_id: \`${contract.consumer_id}\``,
    `- branch_name: \`${contract.branch_name}\``,
    `- lifecycle_state: \`${contract.lifecycle_state}\``,
    '',
    postMergeContract,
    '',
  ].join('\n');
}

export function buildRoadmapActivationPrContract(input: {
  activationRequestId: string;
  sourceIssue?: string | number;
  sourceCommentId?: string | number;
  sourceIssueUrl: string;
  sourceCommentUrl: string;
  routeId?: string;
  consumerId?: string;
  branchName: string;
  lifecycleState: RoadmapActivationLifecycleState;
  closeoutContract: {
    activationCarrierIssue?: string | number;
    branchName?: string;
    processRoadmapPath?: string;
  };
}) {
  const contract = {
    schema: 'zj-loop.roadmap_activation_pr_contract.v1',
    activation_request_id: input.activationRequestId,
    source_issue: input.sourceIssue ?? '',
    source_comment_id: input.sourceCommentId ?? '',
    source_issue_url: input.sourceIssueUrl,
    source_comment_url: input.sourceCommentUrl,
    route_id: input.routeId ?? 'roadmap-sliced-development',
    consumer_id: input.consumerId ?? 'roadmap-sliced-development',
    branch_name: input.branchName,
    lifecycle_state: input.lifecycleState,
    closeout_contract: {
      activation_carrier_issue: input.closeoutContract.activationCarrierIssue ?? '',
      branch_name: input.closeoutContract.branchName ?? input.branchName,
      process_roadmap_path: input.closeoutContract.processRoadmapPath ?? '',
    },
  };
  const postMergeContract = buildPostMergeCloseoutContractBlock({
    roadmapId: input.activationRequestId,
    branchName: contract.closeout_contract.branch_name,
    carrierIssue: contract.closeout_contract.activation_carrier_issue,
    processRoadmapPath: contract.closeout_contract.process_roadmap_path,
  });
  return [
    '<!-- zj-loop.roadmap-activation-pr-contract',
    JSON.stringify(contract, null, 2),
    '-->',
    '### Roadmap Activation Contract',
    '',
    `- activation_request_id: \`${contract.activation_request_id}\``,
    `- route_id: \`${contract.route_id}\``,
    `- consumer_id: \`${contract.consumer_id}\``,
    `- branch_name: \`${contract.branch_name}\``,
    `- lifecycle_state: \`${contract.lifecycle_state}\``,
    '',
    postMergeContract,
    '',
  ].join('\n');
}

export async function executeGitLabRoadmapActivation(input: {
  contractPlan: any;
  projectPath?: string;
  apiBaseUrl?: string;
  token?: string;
  targetBranch?: string;
  draft?: boolean;
  live?: boolean;
  fetchImpl?: typeof fetch;
}) {
  const plan = input.contractPlan ?? {};
  const provider = plan.provider;
  const branchName = String(plan.branchName ?? '');
  const projectPath = String(input.projectPath ?? plan.projectPath ?? plan.project_path ?? '');
  const targetBranch = String(input.targetBranch ?? plan.targetBranch ?? plan.target_branch ?? 'main');
  const draft = input.draft !== false;
  const live = input.live === true;
  const token = String(input.token ?? '');
  const refusals: any[] = [];

  if (provider !== 'gitlab') refusals.push({ layer: 'provider', reason: 'contract-plan-provider-is-not-gitlab' });
  if (!branchName.startsWith('zjal-')) refusals.push({ layer: 'branch', reason: 'branch-prefix-must-be-zjal-' });
  if (!projectPath) refusals.push({ layer: 'project', reason: 'gitlab-project-path-required' });
  if (live && !token) refusals.push({ layer: 'credential', reason: 'gitlab-token-required-for-live-execution' });
  if (live) refusals.push(...validateGitLabRoadmapActivationSourceBinding(plan, projectPath));

  const baseResult = {
    schema: 'zj-loop.gitlab_roadmap_activation_execution_result.v1',
    provider: 'gitlab',
    dry_run: !live,
    activation_request_id: String(plan.activationRequestId ?? plan.activation_request_id ?? ''),
    project_path: projectPath,
    branch_name: branchName,
    target_branch: targetBranch,
    review_kind: 'merge-request',
    draft,
    mr_title: String(plan.mrTitle ?? plan.reviewTitle ?? `Roadmap Activation: ${branchName}`),
    mr_description: String(plan.mrContract ?? plan.reviewContract ?? ''),
    refusals,
    operations: [
      { kind: 'find-or-create-branch', branch: branchName, target: targetBranch },
      { kind: 'find-or-create-merge-request', source_branch: branchName, target_branch: targetBranch },
      { kind: 'update-merge-request-description', source_branch: branchName },
    ],
  };

  if (refusals.length > 0) {
    return { ...baseResult, status: 'refused', execution_allowed: false };
  }
  if (!live) {
    return { ...baseResult, status: 'dry-run', execution_allowed: false };
  }

  const fetcher = input.fetchImpl ?? fetch;
  const headers = buildGitLabAuthHeaders({ token });
  const branchUrl = buildGitLabBranchApiUrl({
    apiBaseUrl: input.apiBaseUrl,
    projectPath,
    branch: branchName,
  });
  const branchFound = await fetcher(branchUrl, { headers });
  const liveOperations: any[] = [];
  if (branchFound.status === 404) {
    const createBranch = await fetcher(buildGitLabApiUrl({
      apiBaseUrl: input.apiBaseUrl,
      projectPath,
      path: ['repository', 'branches'],
    }), {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ branch: branchName, ref: targetBranch }),
    });
    liveOperations.push({ kind: 'create-branch', status: createBranch.status });
    if (!createBranch.ok) {
      return { ...baseResult, status: 'failed', execution_allowed: true, live_operations: liveOperations };
    }
  } else {
    liveOperations.push({ kind: 'find-branch', status: branchFound.status });
    if (!branchFound.ok) {
      return { ...baseResult, status: 'failed', execution_allowed: true, live_operations: liveOperations };
    }
  }

  const mrQuery = new URLSearchParams({ state: 'opened', source_branch: branchName }).toString();
  const existingMrs = await fetcher(`${buildGitLabApiUrl({
    apiBaseUrl: input.apiBaseUrl,
    projectPath,
    path: 'merge_requests',
  })}?${mrQuery}`, { headers });
  const mrs = existingMrs.ok ? await existingMrs.json() : [];
  liveOperations.push({ kind: 'find-merge-request', status: existingMrs.status, count: Array.isArray(mrs) ? mrs.length : 0 });
  if (!existingMrs.ok) {
    return { ...baseResult, status: 'failed', execution_allowed: true, live_operations: liveOperations };
  }

  const title = draft && !baseResult.mr_title.startsWith('Draft:') ? `Draft: ${baseResult.mr_title}` : baseResult.mr_title;
  if (Array.isArray(mrs) && mrs[0]?.iid) {
    const update = await fetcher(buildGitLabMergeRequestApiUrl({
      apiBaseUrl: input.apiBaseUrl,
      projectPath,
      iid: mrs[0].iid,
    }), {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ title, description: baseResult.mr_description }),
    });
    liveOperations.push({ kind: 'update-merge-request', status: update.status, iid: mrs[0].iid });
    return {
      ...baseResult,
      status: update.ok ? 'completed' : 'failed',
      execution_allowed: true,
      merge_request_iid: mrs[0].iid,
      merge_request_url: mrs[0].web_url ?? '',
      live_operations: liveOperations,
    };
  }

  const createMr = await fetcher(buildGitLabApiUrl({
    apiBaseUrl: input.apiBaseUrl,
    projectPath,
    path: 'merge_requests',
  }), {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      source_branch: branchName,
      target_branch: targetBranch,
      title,
      description: baseResult.mr_description,
    }),
  });
  const created = createMr.ok ? await createMr.json() : {};
  liveOperations.push({ kind: 'create-merge-request', status: createMr.status, iid: created.iid ?? null });
  return {
    ...baseResult,
    status: createMr.ok ? 'completed' : 'failed',
    execution_allowed: true,
    merge_request_iid: created.iid ?? null,
    merge_request_url: created.web_url ?? '',
    live_operations: liveOperations,
  };
}

function validateGitLabRoadmapActivationSourceBinding(plan: any, projectPath: string) {
  const refusals: any[] = [];
  const sourceIssue = String(plan.sourceIssue ?? plan.source_issue ?? '').trim();
  const sourceCommentId = String(plan.sourceCommentId ?? plan.source_comment_id ?? '').trim();
  const sourceIssueUrl = String(plan.sourceIssueUrl ?? plan.source_issue_url ?? '').trim();
  const sourceCommentUrl = String(plan.sourceCommentUrl ?? plan.source_comment_url ?? '').trim();

  if (!/^\d+$/.test(sourceIssue) || Number(sourceIssue) < 1) {
    refusals.push({ layer: 'source-binding', reason: 'source-issue-iid-required' });
  }
  if (!/^\d+$/.test(sourceCommentId) || Number(sourceCommentId) < 1) {
    refusals.push({ layer: 'source-binding', reason: 'source-comment-id-required' });
  }
  if (!sourceIssueUrl) refusals.push({ layer: 'source-binding', reason: 'source-issue-url-required' });
  if (!sourceCommentUrl) refusals.push({ layer: 'source-binding', reason: 'source-comment-url-required' });
  if (refusals.length > 0) return refusals;

  try {
    const issueUrl = new URL(sourceIssueUrl);
    const commentUrl = new URL(sourceCommentUrl);
    const expectedIssuePath = `/-/issues/${sourceIssue}`;
    const projectPrefix = `/${projectPath}`;
    if (issueUrl.pathname !== `${projectPrefix}${expectedIssuePath}`) {
      refusals.push({ layer: 'source-binding', reason: 'source-issue-project-or-iid-mismatch' });
    }
    if (commentUrl.pathname !== issueUrl.pathname || commentUrl.hash !== `#note_${sourceCommentId}`) {
      refusals.push({ layer: 'source-binding', reason: 'source-comment-issue-or-id-mismatch' });
    }
  } catch {
    refusals.push({ layer: 'source-binding', reason: 'source-binding-url-invalid' });
  }
  return refusals;
}

function buildPostMergeCloseoutContractBlock(input: {
  roadmapId: string;
  branchName: string;
  carrierIssue: string | number;
  processRoadmapPath: string;
}) {
  return [
    '## Post-Merge Contract',
    '',
    '```yaml',
    `kind: ${POST_MERGE_CONTRACT_KIND}`,
    `version: ${POST_MERGE_CONTRACT_VERSION}`,
    `consumer: ${POST_MERGE_CONTRACT_CONSUMER}`,
    `mode: ${POST_MERGE_CONTRACT_MODE}`,
    'roadmap:',
    `  id: ${yamlScalar(input.roadmapId)}`,
    `  branch: ${yamlScalar(input.branchName)}`,
    input.processRoadmapPath ? `  process_roadmap_path: ${yamlScalar(input.processRoadmapPath)}` : '',
    'carrier:',
    `  issue: ${carrierIssueYamlValue(input.carrierIssue)}`,
    'cleanup:',
    '  delete_merged_branch: true',
    '  close_carrier_issue: true',
    'safety:',
    '  require_pr_merged: true',
    '  require_branch_merged: true',
    '  no_pending_followups: true',
    '  missing_contract_behavior: report-only',
    '```',
  ].filter(Boolean).join('\n');
}

function yamlScalar(value: string) {
  return JSON.stringify(String(value ?? ''));
}

function carrierIssueYamlValue(value: string | number) {
  const issue = Number(value);
  return Number.isInteger(issue) && issue > 0 ? String(issue) : 'null';
}

export function buildRoadmapBoundedSlicePack(input: {
  activationRequestId: string;
  roadmapPath: string;
  branchName: string;
  maxSlices?: number;
  leafSlices?: any[];
  allowedPaths?: string[];
  verificationCommands?: string[];
}) {
  const maxSlices = normalizeMaxSlices(input.maxSlices);
  const leafSlices = Array.isArray(input.leafSlices) ? input.leafSlices : [];
  const selectedSlices = leafSlices
    .filter((slice) => isEligibleLeafSlice(slice))
    .slice(0, maxSlices)
    .map((slice, index) => ({
      slice_id: String(slice.slice_id ?? slice.id ?? `slice-${index + 1}`),
      title: String(slice.title ?? slice.name ?? `Slice ${index + 1}`),
      parent_id: slice.parent_id === undefined ? '' : String(slice.parent_id),
      status: String(slice.status ?? 'pending'),
      allowed_paths: Array.isArray(slice.allowed_paths) ? slice.allowed_paths.map(String) : (input.allowedPaths ?? []),
      verification_commands: Array.isArray(slice.verification_commands)
        ? slice.verification_commands.map(String)
        : (input.verificationCommands ?? []),
      commit_intent: String(slice.commit_intent ?? `Implement ${String(slice.title ?? slice.name ?? `slice ${index + 1}`)}`),
    }));

  return {
    schema: 'zj-loop.roadmap_bounded_slice_pack.v1',
    activation_request_id: input.activationRequestId,
    run_mode: 'bounded-slices',
    max_slices: maxSlices,
    branch_name: input.branchName,
    roadmap_path: input.roadmapPath,
    status: selectedSlices.length > 0 ? 'ready' : 'no-eligible-leaf',
    selected_slices: selectedSlices,
    continuation_conditions: [...BOUNDED_SLICE_CONTINUATION_CONDITIONS],
    stop_conditions: [...BOUNDED_SLICE_STOP_CONDITIONS],
    result_requirements: [
      'each selected slice must report status, notes, and evidence',
      'each completed slice must report at least one verification command result',
      'each completed slice must report commit intent and commit hash or equivalent reviewable commit evidence',
      'runner must stop immediately when any fixed stop condition is hit',
    ],
    next_steps: selectedSlices.length > 0
      ? [
          'Pass this pack to the configured external agent executor.',
          'Require the executor to return a gate-backed bounded slice result.',
          'Verify the result with zj-loop-roadmap-activation bounded-slices-verify before continuing.',
        ]
      : [
          'Mark the roadmap activation as blocked or completed after human review.',
          'Do not invent new leaf slices from this runner.',
        ],
  };
}

export function verifyRoadmapBoundedSliceResult(input: { pack: any; result: any }) {
  const errors: string[] = [];
  const pack = input.pack ?? {};
  const result = input.result ?? {};
  const maxSlices = normalizeMaxSlices(pack.max_slices);
  const selectedSlices = Array.isArray(pack.selected_slices) ? pack.selected_slices : [];
  const sliceResults = Array.isArray(result.slice_results) ? result.slice_results : [];

  if (pack.schema !== 'zj-loop.roadmap_bounded_slice_pack.v1') errors.push('pack schema must be zj-loop.roadmap_bounded_slice_pack.v1');
  if (result.schema !== 'zj-loop.roadmap_bounded_slice_result.v1') errors.push('result schema must be zj-loop.roadmap_bounded_slice_result.v1');
  if (result.activation_request_id !== pack.activation_request_id) errors.push('activation_request_id must match pack');
  if (result.branch_name !== pack.branch_name) errors.push('branch_name must match pack');
  if (sliceResults.length > maxSlices) errors.push('slice_results exceeds max_slices');

  const selectedIds = new Set(selectedSlices.map((slice: any) => String(slice.slice_id)));
  for (const slice of sliceResults) {
    const sliceId = String(slice.slice_id ?? '');
    if (!selectedIds.has(sliceId)) errors.push(`slice ${sliceId || '<missing>'} was not selected by pack`);
    if (!['completed', 'deferred', 'blocked'].includes(String(slice.status))) {
      errors.push(`slice ${sliceId || '<missing>'} status must be completed, deferred, or blocked`);
    }
    if (!String(slice.notes ?? '').trim()) errors.push(`slice ${sliceId || '<missing>'} notes are required`);
    if (!Array.isArray(slice.evidence) || slice.evidence.length === 0) {
      errors.push(`slice ${sliceId || '<missing>'} evidence is required`);
    }
    if (slice.status === 'completed') {
      if (!Array.isArray(slice.verification) || slice.verification.length === 0) {
        errors.push(`slice ${sliceId || '<missing>'} verification evidence is required`);
      }
      if (!slice.verification?.some((entry: any) => String(entry.status) === 'passed' || String(entry.exit_code) === '0')) {
        errors.push(`slice ${sliceId || '<missing>'} must include a passed verification command`);
      }
      if (!String(slice.commit?.intent ?? '').trim()) errors.push(`slice ${sliceId || '<missing>'} commit intent is required`);
      if (!String(slice.commit?.hash ?? '').trim() && !String(slice.commit?.evidence ?? '').trim()) {
        errors.push(`slice ${sliceId || '<missing>'} commit hash or reviewable commit evidence is required`);
      }
    }
  }

  const stopReason = String(result.stop_reason ?? '');
  if (stopReason && !BOUNDED_SLICE_STOP_CONDITIONS.includes(stopReason)) {
    errors.push(`stop_reason must be one of the fixed stop conditions: ${stopReason}`);
  }

  return {
    schema: 'zj-loop.roadmap_bounded_slice_verification.v1',
    status: errors.length === 0 ? 'passed' : 'failed',
    errors,
    checked_slices: sliceResults.length,
    max_slices: maxSlices,
  };
}

export type RoadmapActivationLifecycleState =
  | 'requested'
  | 'consumed'
  | 'running'
  | 'blocked'
  | 'failed'
  | 'completed'
  | 'merged';

function normalizeMaxSlices(value: unknown) {
  const parsed = Number(value ?? DEFAULT_BOUNDED_SLICE_MAX_SLICES);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_BOUNDED_SLICE_MAX_SLICES;
  return parsed;
}

function isEligibleLeafSlice(slice: any) {
  const status = String(slice?.status ?? 'pending').toLowerCase();
  return status !== 'completed' && status !== 'deferred';
}

export function classifyRoadmapActivationLifecycleTransition(input: {
  currentState?: string;
  nextState: string;
  verificationFailureKind?: 'technical' | 'decision' | 'red-contract-test';
}) {
  const current = normalizeLifecycleState(input.currentState ?? 'requested');
  const next = normalizeLifecycleState(input.nextState);
  if (!current) {
    return { allowed: false, state: 'requested', nextState: input.nextState, reason: 'unknown-current-lifecycle-state' };
  }
  if (!next) {
    return { allowed: false, state: current, nextState: input.nextState, reason: 'unknown-lifecycle-state' };
  }
  if (input.verificationFailureKind === 'technical') {
    return { allowed: next === 'failed', state: next, nextState: next, reason: 'technical-failure-enters-failed' };
  }
  if (input.verificationFailureKind === 'decision') {
    return { allowed: next === 'blocked', state: next, nextState: next, reason: 'decision-or-risk-enters-blocked' };
  }
  if (input.verificationFailureKind === 'red-contract-test') {
    return { allowed: next === 'running', state: next, nextState: next, reason: 'red-contract-test-is-implementation-signal' };
  }

  const allowed = allowedLifecycleTransitions(current).includes(next);
  return {
    allowed,
    state: allowed ? next : current,
    nextState: next,
    reason: allowed ? 'lifecycle-transition-allowed' : 'lifecycle-transition-denied',
  };
}

export function hasRoadmapActivationLoopMarker(input: { body?: string; author?: string }) {
  const body = String(input.body ?? '');
  return body.includes(ROADMAP_ACTIVATION_LOOP_MARKER) || /<!--\s*zj-loop[\s\S]*generated_by:\s*roadmap-activation/.test(body);
}

export function renderRoadmapActivationWorkflowSummary(input: {
  action: string;
  routeDecision: any;
  activationRequestId?: string;
  branchName?: string;
  nextSteps?: string[];
}) {
  const nextSteps = input.nextSteps ?? defaultRoadmapActivationNextSteps(input);
  return [
    '## ZJ Loop Roadmap Activation',
    '',
    `- action: \`${input.action}\``,
    `- route: \`${input.routeDecision?.route ?? 'roadmap-sliced-development'}\``,
    `- allowed: \`${Boolean(input.routeDecision?.allowed)}\``,
    `- reason: \`${input.routeDecision?.reason ?? 'n/a'}\``,
    input.activationRequestId ? `- activation_request_id: \`${input.activationRequestId}\`` : null,
    input.branchName ? `- branch_name: \`${input.branchName}\`` : null,
    '',
    '### Next Steps',
    '',
    ...nextSteps.map((step) => `- ${step}`),
    '',
  ].filter((line) => line !== null).join('\n');
}

export function buildActivationConsumedComment(input: any) {
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

export function buildActivationFailedComment(input: any) {
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

function buildActivationDeniedComment(input: any) {
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

function buildActivationDuplicateComment(input: any) {
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

function buildActivationResumeExistingComment(input: any) {
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

function buildActivationResumeBlockedComment(input: any) {
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

function buildUnsupportedPatternComment(input: any) {
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

function normalizeLifecycleState(value: string): RoadmapActivationLifecycleState | null {
  const normalized = String(value ?? '').trim();
  if (
    normalized === 'requested' ||
    normalized === 'consumed' ||
    normalized === 'running' ||
    normalized === 'blocked' ||
    normalized === 'failed' ||
    normalized === 'completed' ||
    normalized === 'merged'
  ) {
    return normalized;
  }
  return null;
}

function allowedLifecycleTransitions(state: RoadmapActivationLifecycleState): RoadmapActivationLifecycleState[] {
  if (state === 'requested') return ['consumed', 'blocked', 'failed'];
  if (state === 'consumed') return ['running', 'blocked', 'failed'];
  if (state === 'running') return ['blocked', 'failed', 'completed'];
  if (state === 'blocked') return ['running', 'failed'];
  if (state === 'failed') return ['running'];
  if (state === 'completed') return ['merged'];
  return [];
}

function defaultRoadmapActivationNextSteps(input: { action: string; routeDecision: any }) {
  if (input.action === 'create-request') {
    return ['Append the activation request comment.', 'Trigger the Roadmap-Sliced Consumer for this activation request.'];
  }
  if (input.action === 'duplicate') {
    return ['Do not create a new request.', 'Resume or inspect the existing activation request id.'];
  }
  if (input.action === 'denied') {
    return ['Leave the denial audit comment.', 'Ask a maintainer or collaborator to issue the command if appropriate.'];
  }
  if (input.action === 'blocked') {
    return ['Stop automation.', 'Record the human-grill decision before resuming.'];
  }
  if (input.routeDecision?.allowed === false) {
    return ['Inspect Route Table status.', 'Enable the route with the fixed confirmation phrase only if appropriate.'];
  }
  return ['Inspect workflow evidence.', 'Continue only through the routed consumer contract.'];
}

function finalizeRequestState(record: any) {
  if (!record.request) return { ...record, currentState: 'inconsistent' };
  const terminalEvents = record.lifecycle.filter((event: any) =>
    event.fields.kind === ACTIVATION_KINDS.consumed || event.fields.kind === ACTIVATION_KINDS.failed
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
    return { ...record, currentState: kind === ACTIVATION_KINDS.consumed ? 'consumed' : 'failed' };
  }
  if (record.inconsistent) return { ...record, currentState: 'inconsistent' };
  return record;
}

function missingResumeAnchorFields(fields: Record<string, string> = {}) {
  return RESUME_ANCHOR_FIELDS.filter((field) => !fields[field]);
}

function normalizeResumeAnchors(fields: Record<string, string> = {}) {
  return {
    roadmapBranch: fields.roadmap_branch,
    roadmapFile: fields.roadmap_file,
    roadmapView: fields.roadmap_view,
    nextAction: fields.next_action,
  };
}

function routeDecisionReason(input: {
  command: any;
  route?: RouteStatus;
  routeEnabled: boolean;
  requestKindAllowed: boolean;
  consumerAllowed: boolean;
  permissionAllowed: boolean;
}) {
  if (!input.command.ok) return input.command.reason;
  if (!input.route) return 'roadmap-activation-route-missing';
  if (!input.routeEnabled) return 'roadmap-activation-route-disabled';
  if (!input.requestKindAllowed) return 'roadmap-activation-request-kind-invalid';
  if (!input.consumerAllowed) return 'roadmap-activation-consumer-invalid';
  if (!input.permissionAllowed) return 'insufficient-permission';
  return 'activation route matched';
}

function parseFields(rawBody: string | undefined) {
  const fields: Record<string, string> = {};
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

function unquote(value: string) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function formatStructuredComment(fields: Record<string, unknown>, visibleText: string) {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${quoteIfNeeded(value)}`);
  return `<!-- zj-loop\n${lines.join('\n')}\n-->\n${visibleText}\n`;
}

function quoteIfNeeded(value: unknown) {
  const stringValue = String(value);
  if (/[:#\n]|^\s|\s$/.test(stringValue)) return JSON.stringify(stringValue);
  return stringValue;
}

function stableTimestamp(value: string) {
  return String(value ?? '').replace(/[^0-9A-Za-z]+/g, '').slice(0, 14) || 'now';
}

function stableHash(value: string) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function slugPart(value: string | number, fallback: string) {
  return slugify(String(value ?? fallback)) || fallback;
}

function slugWithFallback(value: string | undefined, fallback: string) {
  const primary = slugify(String(value ?? '').trim());
  if (primary) return primary;
  return slugPart(fallback, 'activation');
}

function slugify(value: string) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
