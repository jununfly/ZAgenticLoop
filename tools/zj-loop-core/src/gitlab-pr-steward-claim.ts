import { buildGitLabApiUrl, buildGitLabAuthHeaders } from './providers.js';
import { parseIssueFixRequestComments } from './issue-fix-request-contract.js';
import { buildGitLabLifecycleMarker, parseGitLabLifecycleMarker, validateGitLabRequestSourceBinding } from './gitlab-request-lifecycle.js';

export async function claimGitLabPrStewardIssueFixRequest(input: {
  projectPath: string; issueIid: string | number; mergeRequestIid: string | number; requestId: string; claimId: string; currentHeadSha: string; token?: string; apiBaseUrl?: string; fetchImpl?: typeof fetch;
}) {
  const audit: Record<string, unknown> = { project_path: input.projectPath, issue_iid: Number(input.issueIid), merge_request_iid: Number(input.mergeRequestIid), request_id: input.requestId, claim_id: input.claimId, auth_source: input.token ? 'GITLAB_TOKEN' : null };
  const blocked = (reason: string, extra: Record<string, unknown> = {}) => ({ schema: 'zj-loop.gitlab_pr_steward_claim.v1', status: 'blocked', reason, audit, claim: null, side_effects_executed: false, ...extra });
  if (!input.token) return blocked('gitlab-token-required');
  if (!input.projectPath.trim() || !input.requestId.trim() || !input.claimId.trim() || !input.currentHeadSha.trim()) return blocked('claim-fields-required');
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
  if (!request || request.status !== 'requested' || request.route_decision?.target_consumer !== 'pr-steward' || request.requested_consumer?.capability !== 'pr-review-and-readiness-fix') return blocked('issue-fix-request-invalid');
  const binding = validateGitLabRequestSourceBinding({ request, projectPath: input.projectPath, requestId: input.requestId, consumerId: 'pr-steward' });
  if (!binding.ok || Number(request.subject?.mr_iid) !== Number(input.mergeRequestIid)) return blocked('request-source-mismatch');
  const mrResponse = await fetchImpl(mrUrl, { headers });
  if (!mrResponse.ok) return blocked('merge-request-read-failed', { http_status: mrResponse.status });
  const mr = await mrResponse.json() as any;
  if (String(mr.sha ?? '') !== String(request.subject?.head_sha ?? '') || String(mr.sha ?? '') !== input.currentHeadSha) return blocked('source-head-mismatch', { request_head_sha: request.subject?.head_sha ?? null, current_head_sha: input.currentHeadSha, provider_head_sha: mr.sha ?? null });
  const readClaims = async () => {
    const response = await fetchImpl(`${notesUrl}?per_page=100`, { headers });
    const notes = response.ok ? await response.json() as any[] : [];
    return { response, claims: notes.map((note) => parseGitLabLifecycleMarker(note, 'pr-steward-claim')).filter((claim) => claim?.request_id === request.request_id && claim?.consumer_id === 'pr-steward') };
  };
  const before = await readClaims();
  if (!before.response.ok) return blocked('claim-read-failed', { http_status: before.response.status });
  if (before.claims.length > 0) {
    if (before.claims[0].claim_id !== input.claimId) return blocked('claim-mismatch', { existing_claim_id: before.claims[0].claim_id });
    return { schema: 'zj-loop.gitlab_pr_steward_claim.v1', status: 'completed', outcome: 'duplicate', audit, claim: before.claims[0], side_effects_executed: false };
  }
  const claim = { schema: 'zj-loop.gitlab_pr_steward_claim.v1', request_id: request.request_id, claim_id: input.claimId, consumer_id: 'pr-steward', current_head_sha: input.currentHeadSha, status: 'claimed', claimed_at: new Date().toISOString() };
  const response = await fetchImpl(notesUrl, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ body: `${buildGitLabLifecycleMarker('pr-steward-claim', claim)}\n\n### PR Steward Claim\n\n- request: \`${request.request_id}\`\n- claim: \`${input.claimId}\`\n- MR: !${input.mergeRequestIid}` }) });
  if (!response.ok) return blocked('claim-write-failed', { http_status: response.status, side_effects_executed: true });
  const after = await readClaims();
  if (!after.response.ok) return blocked('claim-reread-failed', { http_status: after.response.status, side_effects_executed: true });
  if (after.claims.length !== 1 || after.claims[0].claim_id !== input.claimId) return { schema: 'zj-loop.gitlab_pr_steward_claim.v1', status: 'completed', outcome: 'duplicate', audit, claim: after.claims[0] ?? null, side_effects_executed: true };
  return { schema: 'zj-loop.gitlab_pr_steward_claim.v1', status: 'completed', outcome: 'claimed', audit, claim, side_effects_executed: true };
}
