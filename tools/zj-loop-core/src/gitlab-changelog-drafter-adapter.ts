import { buildGitLabApiUrl, buildGitLabAuthHeaders } from './providers.js';
import { buildGitLabLifecycleMarker, parseGitLabLifecycleMarker } from './gitlab-request-lifecycle.js';

export const CHANGELOG_CARRIER_SCHEMA = 'zj-loop.changelog_draft_request.v1';
export const CHANGELOG_CLAIM_CONSUMER = 'changelog-drafter';
export const CHANGELOG_DRAFT_BRANCH_PATTERN = /^automated\/changelog-drafter-gitlab-[a-z0-9-]+$/;
const CONFIRMATION = 'CREATE_CHANGELOG_DRAFT_PR_OR_EVIDENCE';

export function validateGitLabChangelogDraftActions(actions: any[], expectedFile: string) {
  const errors: string[] = [];
  if (!isSafeRepoPath(expectedFile)) errors.push('draft-file-invalid');
  if (!Array.isArray(actions) || actions.length !== 1) errors.push('draft-commit-actions-must-cover-exactly-one-file');
  const action = Array.isArray(actions) ? actions[0] : null;
  if (action?.action !== 'update') errors.push('draft-commit-action-must-be-update');
  if (action?.file_path !== expectedFile) errors.push('draft-commit-file-scope-mismatch');
  if (typeof action?.content !== 'string') errors.push('draft-commit-content-required');
  if (action?.encoding !== undefined && action.encoding !== 'text') errors.push('draft-commit-encoding-invalid');
  return { ok: errors.length === 0, errors };
}

export async function createGitLabChangelogDraftCarrier(input: { projectPath: string; request: any; confirmationPhrase?: string; token?: string; apiBaseUrl?: string; fetchImpl?: typeof fetch }) {
  const audit = { project_path: input.projectPath, request_id: input.request?.request_id ?? null, auth_source: input.token ? 'GITLAB_TOKEN' : null };
  const blocked = (reason: string, extra: any = {}) => ({ schema: 'zj-loop.gitlab_changelog_draft_carrier.v1', status: 'blocked', reason, audit, issue: null, side_effects_executed: false, ...extra });
  if (input.confirmationPhrase !== CONFIRMATION) return blocked('confirmation-required', { required_phrase: CONFIRMATION });
  if (!input.token) return blocked('gitlab-token-required');
  const validation = validateDraftRequest(input.request, input.projectPath);
  if (!validation.ok) return blocked('request-source-mismatch', { errors: validation.errors });
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) return blocked('gitlab-fetch-unavailable');
  const headers = { ...buildGitLabAuthHeaders({ token: input.token }), 'User-Agent': 'zj-loop-changelog-drafter' };
  const issuesUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: 'issues' });
  const search = await fetchImpl(`${issuesUrl}?state=all&per_page=100&search=${encodeURIComponent(input.request.request_id)}`, { headers });
  if (!search.ok) return blocked('carrier-dedupe-read-failed', { http_status: search.status });
  const existing = (await search.json() as any[]).find((issue) => parseGitLabLifecycleMarker({ body: issue.description }, 'changelog-draft-request')?.request_id === input.request.request_id);
  if (existing) return { schema: 'zj-loop.gitlab_changelog_draft_carrier.v1', status: 'completed', outcome: 'duplicate', audit, issue: { iid: Number(existing.iid), url: String(existing.web_url ?? '') }, side_effects_executed: false };
  const response = await fetchImpl(issuesUrl, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `[Changelog Draft Request] ${input.request.dedupe_key}`, description: `${buildGitLabLifecycleMarker('changelog-draft-request', input.request)}\n\n### Changelog Draft Request\n\n- request: \`${input.request.request_id}\`\n- repository: \`${input.projectPath}\`` }) });
  if (!response.ok) return blocked('carrier-create-failed', { http_status: response.status, side_effects_executed: true });
  const issue = await response.json() as any;
  return { schema: 'zj-loop.gitlab_changelog_draft_carrier.v1', status: 'completed', outcome: 'created', audit, issue: { iid: Number(issue.iid), url: String(issue.web_url ?? '') }, side_effects_executed: true };
}

export async function claimGitLabChangelogDraftCarrier(input: { projectPath: string; issueIid: string | number; requestId: string; claimId: string; token?: string; apiBaseUrl?: string; fetchImpl?: typeof fetch }) {
  const audit = { project_path: input.projectPath, issue_iid: Number(input.issueIid), request_id: input.requestId, claim_id: input.claimId, auth_source: input.token ? 'GITLAB_TOKEN' : null };
  const blocked = (reason: string, extra: any = {}) => ({ schema: 'zj-loop.gitlab_changelog_draft_claim.v1', status: 'blocked', reason, audit, claim: null, side_effects_executed: false, ...extra });
  if (!input.token) return blocked('gitlab-token-required');
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) return blocked('gitlab-fetch-unavailable');
  const headers = { ...buildGitLabAuthHeaders({ token: input.token }), 'User-Agent': 'zj-loop-changelog-drafter' };
  const issueUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['issues', input.issueIid] });
  const notesUrl = `${issueUrl}/notes`;
  const issueResponse = await fetchImpl(issueUrl, { headers });
  if (!issueResponse.ok) return blocked('issue-read-failed', { http_status: issueResponse.status });
  const issue = await issueResponse.json() as any;
  const request = parseGitLabLifecycleMarker({ body: issue.description }, 'changelog-draft-request');
  if (!request || request.schema !== CHANGELOG_CARRIER_SCHEMA || request.request_id !== input.requestId || request.release_window?.repo !== input.projectPath) return blocked('request-source-mismatch');
  const readClaims = async () => {
    const response = await fetchImpl(`${notesUrl}?per_page=100`, { headers });
    const notes = response.ok ? await response.json() as any[] : [];
    return { response, claims: notes.map((note) => parseGitLabLifecycleMarker(note, 'changelog-draft-claim')).filter((claim) => claim?.request_id === input.requestId && claim?.consumer_id === CHANGELOG_CLAIM_CONSUMER) };
  };
  const before = await readClaims();
  if (!before.response.ok) return blocked('claim-read-failed', { http_status: before.response.status });
  if (before.claims.length > 0) return { schema: 'zj-loop.gitlab_changelog_draft_claim.v1', status: 'completed', outcome: 'duplicate', audit, claim: before.claims[0], side_effects_executed: false };
  const claim = { schema: 'zj-loop.gitlab_changelog_draft_claim.v1', request_id: input.requestId, claim_id: input.claimId, consumer_id: CHANGELOG_CLAIM_CONSUMER, status: 'claimed', claimed_at: new Date().toISOString() };
  const write = await fetchImpl(notesUrl, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ body: `${buildGitLabLifecycleMarker('changelog-draft-claim', claim)}\n\n### Changelog Draft Claim\n\n- request: \`${input.requestId}\`\n- claim: \`${input.claimId}\`` }) });
  if (!write.ok) return blocked('claim-write-failed', { http_status: write.status, side_effects_executed: true });
  const after = await readClaims();
  if (!after.response.ok) return blocked('claim-reread-failed', { http_status: after.response.status, side_effects_executed: true });
  if (after.claims.length !== 1 || after.claims[0].claim_id !== input.claimId) return { schema: 'zj-loop.gitlab_changelog_draft_claim.v1', status: 'completed', outcome: 'duplicate', audit, claim: after.claims[0] ?? null, side_effects_executed: true };
  return { schema: 'zj-loop.gitlab_changelog_draft_claim.v1', status: 'completed', outcome: 'claimed', audit, claim, side_effects_executed: true };
}

export async function createGitLabChangelogDraftMr(input: { projectPath: string; token?: string; request: any; issueIid: string | number; claimId: string; branch: string; targetBranch: string; draftFile: string; actions: any[]; commitMessage: string; title: string; description: string; apiBaseUrl?: string; fetchImpl?: typeof fetch }) {
  const audit = { project_path: input.projectPath, issue_iid: Number(input.issueIid), request_id: input.request?.request_id ?? null, claim_id: input.claimId, branch: input.branch, target_branch: input.targetBranch, auth_source: input.token ? 'GITLAB_TOKEN' : null };
  const blocked = (reason: string, extra: any = {}) => ({ schema: 'zj-loop.gitlab_changelog_draft_mr.v1', status: 'blocked', reason, audit, merge_request: null, side_effects_executed: false, ...extra });
  if (!input.token) return blocked('gitlab-token-required');
  if (!validateDraftRequest(input.request, input.projectPath).ok) return blocked('request-source-mismatch');
  if (!CHANGELOG_DRAFT_BRANCH_PATTERN.test(input.branch) || input.targetBranch !== input.request.release_window.base_branch) return blocked('draft-branch-or-target-invalid');
  const actionValidation = validateGitLabChangelogDraftActions(input.actions, input.draftFile);
  if (!actionValidation.ok) return blocked('draft-commit-actions-invalid', { action_validation: actionValidation });
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) return blocked('gitlab-fetch-unavailable');
  const headers = { ...buildGitLabAuthHeaders({ token: input.token }), 'User-Agent': 'zj-loop-changelog-drafter' };
  const issueUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['issues', input.issueIid] });
  const issue = await fetchImpl(issueUrl, { headers });
  if (!issue.ok) return blocked('issue-read-failed', { http_status: issue.status });
  const notes = await fetchImpl(`${issueUrl}/notes?per_page=100`, { headers });
  const claims = notes.ok ? (await notes.json() as any[]).map((note) => parseGitLabLifecycleMarker(note, 'changelog-draft-claim')).filter((claim) => claim?.claim_id === input.claimId && claim?.request_id === input.request.request_id) : [];
  if (!notes.ok || claims.length !== 1) return blocked('claim-not-found');
  const mergeRequestsUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: 'merge_requests' });
  const existing = await fetchImpl(`${mergeRequestsUrl}?state=opened&source_branch=${encodeURIComponent(input.branch)}&per_page=100`, { headers });
  if (!existing.ok) return blocked('draft-mr-dedupe-read-failed', { http_status: existing.status });
  const existingMr = (await existing.json() as any[])[0];
  if (existingMr) return completedMr(audit, 'duplicate', existingMr);
  const branchesUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['repository', 'branches'] });
  const branchUrl = `${branchesUrl}/${encodeURIComponent(input.branch)}`;
  const branchCreate = await postJson(fetchImpl, branchesUrl, headers, { branch: input.branch, ref: input.targetBranch });
  if (!branchCreate.ok && branchCreate.status !== 400) return blocked('draft-branch-create-failed', { http_status: branchCreate.status });
  const branchRead = await fetchImpl(branchUrl, { headers });
  if (!branchRead.ok) return blocked('draft-branch-not-ready', { http_status: branchRead.status });
  const commitsUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['repository', 'commits'] });
  const commit = await postJson(fetchImpl, commitsUrl, headers, { branch: input.branch, commit_message: input.commitMessage, actions: input.actions });
  if (!commit.ok) return blocked('draft-commit-create-failed', { http_status: commit.status });
  const mr = await postJson(fetchImpl, mergeRequestsUrl, headers, { source_branch: input.branch, target_branch: input.targetBranch, title: input.title, description: input.description, draft: true, remove_source_branch: false });
  if (!mr.ok) return blocked('draft-mr-create-failed', { http_status: mr.status });
  return completedMr(audit, 'created', await mr.json());
}

function validateDraftRequest(request: any, projectPath: string) {
  const errors: string[] = [];
  if (!request || request.schema !== CHANGELOG_CARRIER_SCHEMA) errors.push('schema-invalid');
  if (!request?.request_id || request.status !== 'draft-request-candidate') errors.push('request-invalid');
  if (request?.release_window?.repo !== projectPath) errors.push('repo-mismatch');
  if (!request?.release_window?.base_branch) errors.push('base-branch-required');
  if (!request?.release_window?.since_ref || !request?.release_window?.until_ref) errors.push('release-window-required');
  return { ok: errors.length === 0, errors };
}
function isSafeRepoPath(value: string) { return Boolean(value) && !value.startsWith('/') && !value.includes('\\') && !value.split('/').includes('..') && !value.split('/').includes('') && !value.endsWith('/'); }
async function postJson(fetchImpl: typeof fetch, url: string, headers: Record<string, string>, payload: any): Promise<Response> { try { return await fetchImpl(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); } catch { return new Response('', { status: 0 }); } }
function completedMr(audit: any, outcome: string, mr: any) { return { schema: 'zj-loop.gitlab_changelog_draft_mr.v1', status: 'completed', outcome, audit, merge_request: { iid: Number(mr.iid), url: String(mr.web_url ?? ''), source_branch: String(mr.source_branch ?? audit.branch), target_branch: String(mr.target_branch ?? audit.target_branch), draft: true }, side_effects_executed: outcome === 'created' }; }
