import {
  buildGitLabApiUrl,
  buildGitLabAuthHeaders,
} from './providers.js';
import {
  buildIssueFixRequestComment,
  parseIssueFixRequestComments,
  resolveIssueFixRequestDedupe,
} from './issue-fix-request-contract.js';
import {
  buildIssueTriageTransitionIssueFixRequestBody,
  runIssueTriageTransitionRunner,
} from './issue-triage-transition-runner.js';
import { validateTriageRoleMapping, resolveTriageRoles, type TriageRoleMapping } from './triage-role-mapping.js';
import { buildRecommendedTriageTransitionFixture } from './issue-triage-transition-runner.js';

export const GITLAB_ISSUE_TRIAGE_LIVE_SCHEMA = 'zj-loop.gitlab_issue_triage_transition_live.v1';

export function buildGitLabTrustedTransitionRequest(input: {
  recommendations: any[];
  projectPath: string;
  apiBaseUrl?: string;
  roleMapping: TriageRoleMapping;
  now?: string;
}) {
  const mappingValidation = validateTriageRoleMapping(input.roleMapping);
  if (!mappingValidation.ok) return { status: 'blocked', reason: 'triage-role-mapping-invalid', errors: mappingValidation.errors, request: null, skipped_count: 0 };
  const eligible = (Array.isArray(input.recommendations) ? input.recommendations : [])
    .map((recommendation) => ({ recommendation, roles: resolveTriageRoles(recommendation.labels, input.roleMapping) }))
    .filter(({ recommendation, roles }) => recommendation.recommendation === 'agent-ready-request'
      && roles.errors.length === 0
      && roles.category_roles.length === 1
      && roles.state_roles.length === 1
      && roles.state_roles[0] === 'ready-for-agent'
      && !(Array.isArray(recommendation.assignees) && recommendation.assignees.length > 0))
    .sort((left, right) => Number(left.recommendation.issue_iid ?? left.recommendation.issue) - Number(right.recommendation.issue_iid ?? right.recommendation.issue));
  const selected = eligible[0]?.recommendation;
  if (!selected) return { status: 'report-only', reason: 'no-eligible-ready-for-agent-candidate', request: null, skipped_count: 0 };
  const issue = Number(selected.issue_iid ?? selected.issue);
  const issueUrl = String(selected.issue_url || buildGitLabIssueUrl(input, issue));
  const now = input.now ?? new Date().toISOString();
  const dedupeKey = `issue-backlog-triage:${input.projectPath}:${issue}:ready-for-agent:gitlab`;
  const request = buildRecommendedTriageTransitionFixture({
    request_id: `triage-transition-gitlab-${input.projectPath.replace(/[^a-z0-9]+/gi, '-')}-${issue}`,
    source: { tracker: 'gitlab', repo: input.projectPath, issue, issue_url: issueUrl, scan_window: 'scheduled-open-issues' },
    category_role: eligible[0].roles.category_roles[0],
    recommended_state: 'ready-for-agent',
    confidence: 'high',
    reason: String(selected.reason ?? 'ready-for-agent role mapping and bounded issue candidate'),
    risk_flags: [],
    brief_draft: { kind: 'agent-brief', body: `GitLab issue !${issue} is eligible for the Roadmap-Sliced Consumer. ${String(selected.reason ?? '')}`.trim() },
    dedupe_key: dedupeKey,
    stale_after: new Date(new Date(now).getTime() + 24 * 60 * 60 * 1000).toISOString(),
    side_effects_if_confirmed: { set_tracker_state: true, write_triage_comment: true, create_issue_fix_request: 'ready-for-agent-only' },
  });
  return { status: 'eligible', reason: 'deterministic-ready-for-agent-candidate', request, selected_issue_iid: issue, selected_labels: selected.labels ?? [], skipped_count: Math.max(0, eligible.length - 1) };
}

export type GitLabIssueTriageTransitionInput = {
  projectPath: string;
  issueIid: string | number;
  request: any;
  route: any;
  token?: string;
  apiBaseUrl?: string;
  confirmationMode?: 'human-fixed-phrase' | 'trusted-automation';
  confirmationPhrase?: string;
  command?: string;
  actorPermission?: string;
  confirmationAuthority?: string;
  pipelineSource?: string;
  trustedAutomationEnabled?: string;
  labels?: string[];
  roleMapping?: TriageRoleMapping;
  now?: string;
  fetchImpl?: typeof fetch;
};

export async function executeGitLabIssueTriageTransition(input: GitLabIssueTriageTransitionInput) {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const audit = {
    project_path: input.projectPath,
    issue_iid: Number(input.issueIid),
    source_issue_url: sourceIssueUrl(input),
    auth_source: input.token ? 'GITLAB_TOKEN' : null,
  };
  const hardStop = (reason: string, extra: Record<string, unknown> = {}) => ({
    schema: GITLAB_ISSUE_TRIAGE_LIVE_SCHEMA,
    status: 'blocked',
    reason,
    audit,
    note: null,
    handoff: null,
    ...extra,
  });

  if (!input.token) return hardStop('gitlab-token-required');
  if (!Number.isInteger(Number(input.issueIid)) || Number(input.issueIid) <= 0) return hardStop('request-source-mismatch');
  const binding = validateSourceBinding(input);
  if (!binding.ok) return hardStop('request-source-mismatch', { binding_errors: binding.errors });
  if (input.confirmationMode === 'trusted-automation') {
    if (input.pipelineSource !== 'schedule' || input.trustedAutomationEnabled !== 'enabled') {
      return hardStop('trusted-automation-context-invalid');
    }
    if (input.roleMapping) {
      const mappingValidation = validateTriageRoleMapping(input.roleMapping);
      const roles = resolveTriageRoles(input.labels ?? [], input.roleMapping);
      if (!mappingValidation.ok || roles.errors.length > 0) return hardStop('triage-role-mapping-invalid', { mapping_errors: [...mappingValidation.errors, ...roles.errors] });
    }
  }
  if (!fetchImpl) return hardStop('gitlab-fetch-unavailable');

  let actorPermission = input.actorPermission;
  if (input.confirmationMode !== 'trusted-automation' && !actorPermission) {
    actorPermission = await resolveGitLabActorPermission({ fetchImpl, apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, token: input.token }) ?? undefined;
    if (!actorPermission) return hardStop('actor-permission-unavailable');
  }
  const plan = runIssueTriageTransitionRunner({
    route: input.route,
    request: input.request,
    actorPermission,
    command: input.command,
    confirmationPhrase: input.confirmationPhrase,
    confirmationMode: input.confirmationMode,
    confirmationAuthority: input.confirmationAuthority,
    createdAt: input.now ?? new Date().toISOString(),
  });
  if (plan.decision.status !== 'confirmed' || !plan.confirmed_transition.issue_fix_request) {
    return { schema: GITLAB_ISSUE_TRIAGE_LIVE_SCHEMA, status: plan.decision.status === 'escalated' ? 'escalated' : 'blocked', reason: plan.decision.reason, audit, plan, note: null, handoff: null };
  }

  const request = plan.confirmed_transition.issue_fix_request;
  const url = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['issues', input.issueIid, 'notes'] });
  const headers = { ...buildGitLabAuthHeaders({ token: input.token }), 'User-Agent': 'zj-loop-gitlab-issue-triage-transition' };
  const notesResponse = await fetchImpl(`${url}?per_page=100`, { headers });
  if (!notesResponse.ok) return hardStop('source-issue-notes-read-failed', { http_status: notesResponse.status });
  const notes = await notesResponse.json() as any[];
  const parsed = parseIssueFixRequestComments(notes.map((note) => ({ id: note.id, body: note.body, author: note.author?.username, createdAt: note.created_at })));
  const dedupe = resolveIssueFixRequestDedupe({ existingRequests: parsed.map((item) => item.request), dedupeKey: request.dedupe_key });
  if (dedupe.action === 'duplicate') {
    const existing = parsed.find((item) => item.request?.request_id === dedupe.existing_request_id);
    return completedResult({ audit, plan, outcome: 'duplicate', note: noteAudit(existing?.commentId, input), handoff: handoff(request) });
  }

  const body = buildIssueTriageTransitionIssueFixRequestBody({ issueFixRequest: request, triageComment: plan.confirmed_transition.triage_comment });
  let response: any;
  try {
    response = await fetchImpl(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) });
  } catch {
    return await recoverUncertainWrite({ input, fetchImpl, url, headers, request, audit, plan });
  }
  if (!response.ok) {
    if (response.status >= 500) return await recoverUncertainWrite({ input, fetchImpl, url, headers, request, audit, plan });
    return hardStop('source-issue-note-write-failed', { http_status: response.status });
  }
  const note = await response.json();
  if (String(note.body ?? '') !== body) {
    return await recoverUncertainWrite({ input, fetchImpl, url, headers, request, audit, plan, reason: 'source-issue-note-response-mismatch', noteId: note.id });
  }
  return completedResult({ audit, plan, outcome: 'created', note: noteAudit(note.id, input, note.web_url), handoff: handoff(request) });
}

async function resolveGitLabActorPermission(input: { fetchImpl: typeof fetch; apiBaseUrl?: string; projectPath: string; token: string }) {
  const headers = buildGitLabAuthHeaders({ token: input.token });
  const userResponse = await input.fetchImpl(`${String(input.apiBaseUrl ?? 'https://gitlab.com/api/v4').replace(/\/$/, '')}/user`, { headers });
  if (!userResponse.ok) return null;
  const user = await userResponse.json() as any;
  if (user?.id == null) return null;
  const memberUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['members', 'all', user.id] });
  const memberResponse = await input.fetchImpl(memberUrl, { headers });
  if (!memberResponse.ok) return null;
  const member = await memberResponse.json() as any;
  if (Number(member.access_level) >= 40) return 'maintainer';
  if (Number(member.access_level) >= 30) return 'collaborator';
  return null;
}

function validateSourceBinding(input: GitLabIssueTriageTransitionInput) {
  const source = input.request?.source;
  const errors: string[] = [];
  if (source?.tracker !== 'gitlab' && source?.provider !== 'gitlab') errors.push('tracker must be gitlab');
  if (String(source?.repo ?? source?.project_path ?? '') !== String(input.projectPath)) errors.push('source project does not match CI project');
  if (Number(source?.issue ?? source?.issue_iid) !== Number(input.issueIid)) errors.push('source issue does not match CI issue');
  if (source?.issue_url && !sourceIssueUrlMatches(source.issue_url, input)) errors.push('source issue URL does not match CI issue');
  return { ok: errors.length === 0, errors };
}

function sourceIssueUrl(input: GitLabIssueTriageTransitionInput) {
  const source = input.request?.source;
  if (source?.issue_url) return String(source.issue_url);
  const host = String(input.apiBaseUrl ?? 'https://gitlab.com/api/v4').replace(/^https?:\/\//, '').split('/')[0];
  return `https://${host}/${input.projectPath}/-/issues/${input.issueIid}`;
}

function sourceIssueUrlMatches(value: string, input: GitLabIssueTriageTransitionInput) {
  try {
    const parsed = new URL(value);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const marker = parts.indexOf('-');
    return parsed.hostname === new URL(sourceIssueUrl({ ...input, request: { source: {} } })).hostname
      && marker > 0
      && parts.slice(0, marker).join('/') === input.projectPath
      && parts[marker + 1] === 'issues'
      && Number(parts[marker + 2]) === Number(input.issueIid);
  } catch {
    return false;
  }
}

async function recoverUncertainWrite(input: any) {
  const response = await input.fetchImpl(`${input.url}?per_page=100`, { headers: input.headers });
  if (response.ok) {
    const notes = await response.json();
    const parsed = parseIssueFixRequestComments(notes.map((note: any) => ({ id: note.id, body: note.body, author: note.author?.username, createdAt: note.created_at })));
    const existing = parsed.find((item: any) => item.request?.request_id === input.request.request_id);
    if (existing) return completedResult({ audit: input.audit, plan: input.plan, outcome: 'recovered-duplicate', note: noteAudit(existing.commentId, input.input), handoff: handoff(input.request) });
  }
  return { schema: GITLAB_ISSUE_TRIAGE_LIVE_SCHEMA, status: 'blocked', reason: input.reason ?? 'note-write-unknown', audit: input.audit, note: noteAudit(input.noteId, input.input), handoff: null };
}

function completedResult(input: any) {
  return { schema: GITLAB_ISSUE_TRIAGE_LIVE_SCHEMA, status: 'completed', outcome: input.outcome, audit: input.audit, note: input.note, handoff: input.handoff, plan: { decision: input.plan.decision, request_id: input.plan.confirmed_transition.issue_fix_request.request_id } };
}

function noteAudit(id: unknown, input: GitLabIssueTriageTransitionInput, url?: unknown) {
  const normalizedId = id == null ? null : String(id);
  return { id: normalizedId, url: url ? String(url) : buildGitLabNoteUrl(input, normalizedId), issue_url: sourceIssueUrl(input) };
}

function handoff(request: any) {
  return { consumer: request.requested_consumer.consumer_id, request_id: request.request_id, dedupe_key: request.dedupe_key };
}

function buildGitLabIssueUrl(input: { apiBaseUrl?: string; projectPath: string }, issue: number) {
  const host = String(input.apiBaseUrl ?? 'https://gitlab.com/api/v4').replace(/^https?:\/\//, '').split('/')[0];
  return `https://${host}/${input.projectPath}/-/issues/${issue}`;
}

function buildGitLabNoteUrl(input: GitLabIssueTriageTransitionInput, noteId: string | null) {
  if (!noteId) return null;
  return `${sourceIssueUrl(input)}#note_${noteId}`;
}
