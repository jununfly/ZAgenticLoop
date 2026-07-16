import { parseIssueFixRequestComments } from './issue-fix-request-contract.js';
import { buildGitLabApiUrl, buildGitLabAuthHeaders } from './providers.js';
import { buildGitLabLifecycleMarker, parseGitLabLifecycleMarker, validateGitLabRequestSourceBinding } from './gitlab-request-lifecycle.js';

export async function appendGitLabPrStewardEscalation(input: {
  projectPath: string;
  issueIid: string | number;
  mergeRequestIid: string | number;
  requestId: string;
  claimId: string;
  currentHeadSha: string;
  reason: string;
  token?: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
}) {
  const audit = {
    project_path: input.projectPath,
    issue_iid: Number(input.issueIid),
    merge_request_iid: Number(input.mergeRequestIid),
    request_id: input.requestId,
    claim_id: input.claimId,
    auth_source: input.token ? 'GITLAB_TOKEN' : null,
  };
  const blocked = (reason: string, extra: Record<string, unknown> = {}) => ({
    schema: 'zj-loop.gitlab_pr_steward_escalation.v1', status: 'blocked', reason, audit,
    escalation: null, side_effects_executed: false, ...extra,
  });
  if (!input.token) return blocked('gitlab-token-required');
  if (!input.projectPath.trim() || !input.requestId.trim() || !input.claimId.trim() || !input.currentHeadSha.trim() || !input.reason.trim()) {
    return blocked('escalation-fields-required');
  }
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) return blocked('gitlab-fetch-unavailable');
  const headers = { ...buildGitLabAuthHeaders({ token: input.token }), 'User-Agent': 'zj-loop-pr-steward' };
  const issueUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['issues', input.issueIid] });
  const mrUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['merge_requests', input.mergeRequestIid] });
  const notesUrl = `${issueUrl}/notes`;
  const issueResponse = await fetchImpl(issueUrl, { headers });
  if (!issueResponse.ok) return blocked('issue-read-failed', { http_status: issueResponse.status });
  const issue = await issueResponse.json() as any;
  const parsed = parseIssueFixRequestComments([{ id: issue.iid ?? input.issueIid, body: String(issue.description ?? '') }])[0];
  const request = parsed?.validation.ok ? parsed.request : null;
  const binding = validateGitLabRequestSourceBinding({ request, projectPath: input.projectPath, requestId: input.requestId, consumerId: 'pr-steward' });
  if (!binding.ok || Number(request?.subject?.mr_iid) !== Number(input.mergeRequestIid)) return blocked('request-source-mismatch');
  const mrResponse = await fetchImpl(mrUrl, { headers });
  if (!mrResponse.ok) return blocked('merge-request-read-failed', { http_status: mrResponse.status });
  const mr = await mrResponse.json() as any;
  if (String(mr.sha ?? '') !== String(request.subject?.head_sha ?? '') || String(mr.sha ?? '') !== input.currentHeadSha) {
    return blocked('source-head-mismatch', { request_head_sha: request.subject?.head_sha ?? null, current_head_sha: input.currentHeadSha, provider_head_sha: mr.sha ?? null });
  }
  const readNotes = async () => {
    const response = await fetchImpl(`${notesUrl}?per_page=100`, { headers });
    const notes = response.ok ? await response.json() as any[] : [];
    return { response, notes };
  };
  const before = await readNotes();
  if (!before.response.ok) return blocked('notes-read-failed', { http_status: before.response.status });
  const existing = before.notes.map((note) => parseGitLabLifecycleMarker(note, 'pr-steward-escalation'))
    .find((item) => item?.request_id === request.request_id && item?.claim_id === input.claimId);
  if (existing) return { schema: 'zj-loop.gitlab_pr_steward_escalation.v1', status: 'completed', outcome: 'duplicate', audit, escalation: existing, side_effects_executed: false };
  const escalation = {
    schema: 'zj-loop.gitlab_pr_steward_escalation.v1', request_id: request.request_id, claim_id: input.claimId,
    consumer_id: 'pr-steward', merge_request_iid: Number(input.mergeRequestIid), current_head_sha: input.currentHeadSha,
    status: 'escalated', reason: input.reason, escalated_at: new Date().toISOString(), repair_mr_created: false,
  };
  const noteResponse = await fetchImpl(notesUrl, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({
    body: `${buildGitLabLifecycleMarker('pr-steward-escalation', escalation)}\n\n### PR Steward Escalation\n\n- request: \`${request.request_id}\`\n- claim: \`${input.claimId}\`\n- MR: !${input.mergeRequestIid}\n- reason: ${input.reason}`,
  }) });
  if (!noteResponse.ok) return blocked('escalation-write-failed', { http_status: noteResponse.status, side_effects_executed: true });
  const after = await readNotes();
  if (!after.response.ok) return blocked('escalation-reread-failed', { http_status: after.response.status, side_effects_executed: true });
  const matches = after.notes.map((note) => parseGitLabLifecycleMarker(note, 'pr-steward-escalation'))
    .filter((item) => item?.request_id === request.request_id && item?.claim_id === input.claimId);
  if (matches.length !== 1) return blocked('escalation-reread-ambiguous', { side_effects_executed: true, escalation: matches[0] ?? null });
  return { schema: 'zj-loop.gitlab_pr_steward_escalation.v1', status: 'completed', outcome: 'escalated', audit, escalation: matches[0], side_effects_executed: true };
}
