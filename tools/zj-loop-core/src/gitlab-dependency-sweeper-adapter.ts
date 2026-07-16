import {
  buildGitLabApiUrl,
  buildGitLabAuthHeaders,
} from './providers.js';
import {
  buildGitLabLifecycleAudit,
  validateGitLabRequestSourceBinding,
} from './gitlab-request-lifecycle.js';

const BRANCH_PATTERN = /^automated\/dependency-sweeper-gitlab-[a-z0-9-]+$/;
const DEFAULT_EXPECTED_FILES = ['package.json', 'package-lock.json'];

export function validateGitLabDependencySweeperCommitActions(actions: any[], expectedFiles = DEFAULT_EXPECTED_FILES) {
  const errors: string[] = [];
  if (!Array.isArray(actions) || actions.length !== expectedFiles.length) {
    errors.push('dependency-commit-actions-must-cover-exactly-two-files');
  }
  const paths = Array.isArray(actions) ? actions.map((item) => String(item?.file_path ?? '')) : [];
  if (JSON.stringify([...paths].sort()) !== JSON.stringify([...expectedFiles].sort())) errors.push('dependency-commit-file-scope-mismatch');
  for (const item of Array.isArray(actions) ? actions : []) {
    if (item?.action !== 'update') errors.push('dependency-commit-action-must-be-update');
    if (typeof item?.content !== 'string') errors.push('dependency-commit-content-required');
    if (item?.encoding !== undefined && item.encoding !== 'text') errors.push('dependency-commit-encoding-invalid');
  }
  return { ok: errors.length === 0, errors };
}

export async function createGitLabDependencySweeperRepairMr(input: {
  projectPath: string;
  token?: string;
  request: any;
  requestId: string;
  branch: string;
  sourceRef?: string;
  targetBranch: string;
  commitMessage: string;
  title: string;
  description: string;
  actions: any[];
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
}) {
  const audit = {
    ...buildGitLabLifecycleAudit({
      projectPath: input.projectPath,
      requestId: input.requestId,
      consumerId: 'dependency-sweeper',
      token: input.token,
    }),
    branch: input.branch,
    source_ref: input.sourceRef ?? input.targetBranch,
    target_branch: input.targetBranch,
  };
  const blocked = (reason: string, extra: Record<string, unknown> = {}) => ({
    schema: 'zj-loop.gitlab_dependency_sweeper_repair_mr.v1',
    status: 'blocked',
    reason,
    audit,
    merge_request: null,
    ...extra,
  });
  if (!input.token) return blocked('gitlab-token-required');
  if (!input.projectPath.trim() || !input.requestId.trim() || !input.branch.trim() || !input.targetBranch.trim()) return blocked('repair-mr-fields-required');
  if (!BRANCH_PATTERN.test(input.branch)) return blocked('repair-branch-name-invalid');
  const binding = validateGitLabRequestSourceBinding({
    request: input.request,
    projectPath: input.projectPath,
    requestId: input.requestId,
    consumerId: 'dependency-sweeper',
  });
  if (!binding.ok) return blocked(binding.reason ?? 'request-source-mismatch');
  const expectedFiles = Array.isArray(input.request?.subject?.manifest_files) && input.request.subject.manifest_files.length > 0
    ? input.request.subject.manifest_files.map((file: unknown) => String(file))
    : DEFAULT_EXPECTED_FILES;
  const actionValidation = validateGitLabDependencySweeperCommitActions(input.actions, expectedFiles);
  if (!actionValidation.ok) return blocked('commit-actions-invalid', { action_validation: actionValidation });
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) return blocked('gitlab-fetch-unavailable');
  const headers = { ...buildGitLabAuthHeaders({ token: input.token }), 'User-Agent': 'zj-loop-dependency-sweeper' };
  const mergeRequestsUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: 'merge_requests' });
  let existingResponse;
  try {
    existingResponse = await fetchImpl(`${mergeRequestsUrl}?state=opened&source_branch=${encodeURIComponent(input.branch)}&per_page=100`, { headers });
  } catch {
    return blocked('repair-mr-dedupe-read-failed');
  }
  if (!existingResponse.ok) return blocked('repair-mr-dedupe-read-failed', { http_status: existingResponse.status });
  const existing = (await existingResponse.json() as any[])[0];
  if (existing) return completed(audit, 'duplicate', existing);

  const branchesUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['repository', 'branches'] });
  const branchUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['repository', 'branches', input.branch] });
  const branchCreatePayload = { branch: input.branch, ref: input.sourceRef ?? input.targetBranch };
  const branchCreate = await postJson(fetchImpl, branchesUrl, headers, branchCreatePayload);
  if (!branchCreate.ok && branchCreate.status !== 400) return blocked('repair-branch-create-failed', { http_status: branchCreate.status, provider_endpoint: new URL(branchesUrl).pathname, request_summary: branchCreatePayload });
  let branchReady = false;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let branchResponse;
    try { branchResponse = await fetchImpl(branchUrl, { headers }); } catch { return blocked('repair-branch-read-failed'); }
    if (branchResponse.ok) { branchReady = true; break; }
    if (branchResponse.status !== 404) return blocked('repair-branch-read-failed', { http_status: branchResponse.status });
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!branchReady) return blocked('repair-branch-not-ready');
  const commitsUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['repository', 'commits'] });
  const commitPayload = { branch: input.branch, commit_message: input.commitMessage, actions: input.actions };
  const commitResponse = await postJson(fetchImpl, commitsUrl, headers, commitPayload);
  if (!commitResponse.ok) return blocked('repair-commit-create-failed', {
    http_status: commitResponse.status,
    provider_endpoint: new URL(commitsUrl).pathname,
    request_summary: summarizeCommitRequest(commitPayload),
    provider_error: await readResponseError(commitResponse),
  });
  const mrResponse = await postJson(fetchImpl, mergeRequestsUrl, headers, {
    source_branch: input.branch,
    target_branch: input.targetBranch,
    title: input.title,
    description: input.description,
    remove_source_branch: false,
  });
  if (!mrResponse.ok) return blocked('repair-mr-create-failed', { http_status: mrResponse.status });
  const mergeRequest = await mrResponse.json() as any;
  if (!Number.isInteger(Number(mergeRequest.iid))) return blocked('repair-mr-create-response-invalid');
  return completed(audit, 'created', mergeRequest);
}

function summarizeCommitRequest(payload: { branch: string; commit_message: string; actions: any[] }) {
  return {
    branch: payload.branch,
    action_count: payload.actions.length,
    actions: payload.actions.map((action) => ({
      action: String(action.action ?? ''),
      file_path: String(action.file_path ?? ''),
      content_bytes: typeof action.content === 'string' ? Buffer.byteLength(action.content, 'utf8') : 0,
    })),
  };
}

async function readResponseError(response: { text?: () => Promise<string> }) {
  if (typeof response.text !== 'function') return null;
  try {
    const raw = await response.text();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') return parsed.slice(0, 300);
    if (parsed && typeof parsed === 'object') return parsed.message ?? parsed.error ?? parsed.errors ?? null;
    return raw.slice(0, 300);
  } catch {
    return null;
  }
}

function completed(audit: Record<string, unknown>, outcome: 'created' | 'duplicate', mergeRequest: any) {
  return {
    schema: 'zj-loop.gitlab_dependency_sweeper_repair_mr.v1',
    status: 'completed',
    outcome,
    audit,
    merge_request: {
      iid: Number(mergeRequest.iid),
      url: String(mergeRequest.web_url ?? ''),
      source_branch: String(mergeRequest.source_branch ?? audit.branch ?? ''),
      target_branch: String(mergeRequest.target_branch ?? audit.target_branch ?? ''),
    },
  };
}

async function postJson(fetchImpl: typeof fetch, url: string, headers: Record<string, string>, payload: any) {
  try {
    return await fetchImpl(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch {
    return { ok: false, status: 0, json: async () => ({}), text: async () => '' };
  }
}
