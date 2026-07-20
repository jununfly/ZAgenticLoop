import { createHash } from 'node:crypto';
import { buildIssueFixRequestComment, parseIssueFixRequestComments } from './issue-fix-request-contract.js';
import { buildGitLabApiUrl, buildGitLabAuthHeaders } from './providers.js';
export const CONFIRM_PR_STEWARD_ISSUE_FIX_REQUEST = 'CONFIRM_PR_STEWARD_ISSUE_FIX_REQUEST';
function stableHash(value) {
    return createHash('sha256').update(value).digest('hex').slice(0, 12);
}
export function buildGitLabPrStewardIssueFixRequest(report) {
    const source = report?.report?.source_review ?? {};
    const observations = report?.report?.observations ?? {};
    const dedupeKey = `pr:${source.repo}:${source.mr_iid}:head:${source.head_sha}:checks:failure`;
    const requestId = `ifr_${stableHash(dedupeKey)}`;
    return {
        schema: 'zj-loop.issue_fix_request.v1', request_id: requestId, status: 'requested', created_at: new Date().toISOString(),
        source_signal: {
            signal_id: String(report?.audit?.signal_id ?? source.mr_iid), source: 'merge_request', provider: 'gitlab',
            summary: `MR !${source.mr_iid} has allowlisted failed checks`, source_url: String(source.url ?? ''),
            provider_metadata: { mr_iid: Number(source.mr_iid), pipeline_id: observations.pipeline_id ?? null, failed_jobs: observations.failed_jobs ?? [] },
        },
        subject: {
            type: 'merge_request', provider: 'gitlab', repo: String(source.repo ?? ''), mr_iid: Number(source.mr_iid),
            head_sha: String(source.head_sha ?? ''), base_branch: String(source.target_branch ?? ''), source_url: String(source.url ?? ''),
            provider_metadata: { mr_iid: Number(source.mr_iid), pipeline_id: observations.pipeline_id ?? null },
        },
        route_decision: { route_id: 'pr-steward-fix-request', request_kind: 'issue-fix-request', target_consumer: 'pr-steward', dedupe_key: dedupeKey },
        dedupe_key: dedupeKey,
        requested_consumer: { consumer_id: 'pr-steward', capability: 'pr-review-and-readiness-fix' },
        fix_scope: { repo: String(source.repo ?? ''), files_or_areas: ['pull-request-checks'], non_goals: ['source MR mutation', 'auto-merge'] },
        acceptance_criteria: ['Open a verifier-backed repair MR or append escalation evidence.', 'Do not mutate or auto-merge the source MR.'],
        verification_gate: { commands: [{ id: 'current-mr-head', command: 'gitlab-read-mr-head', args: [`${source.mr_iid}`] }, { id: 'failed-check-rollup', command: 'gitlab-read-mr-pipeline-jobs', args: [`${observations.pipeline_id ?? ''}`] }] },
        failure_policy: { on_failure: 'failed_requires_new_request', retry: 'new_request_only' },
        lifecycle: { linked_pr: null, consumed_by: null, closed_at: null },
    };
}
export async function createGitLabPrStewardIssueFixRequest(input) {
    const source = input.report?.report?.source_review;
    const observations = input.report?.report?.observations;
    const audit = { project_path: input.projectPath, merge_request_iid: Number(source?.mr_iid), request_id: null, auth_source: input.token ? 'GITLAB_TOKEN' : null };
    const blocked = (reason, extra = {}) => ({ schema: 'zj-loop.gitlab_pr_steward_issue_fix_request.v1', status: 'blocked', reason, audit, issue: null, side_effects_executed: false, ...extra });
    if (input.confirmationPhrase !== CONFIRM_PR_STEWARD_ISSUE_FIX_REQUEST)
        return blocked('confirmation-required', { confirmation: { location: 'GitLab manual job or Codex conversation', required_phrase: CONFIRM_PR_STEWARD_ISSUE_FIX_REQUEST } });
    if (!input.token)
        return blocked('gitlab-token-required');
    if (input.report?.schema !== 'zj-loop.gitlab_pr_steward_report.v1' || input.report?.status !== 'completed' || input.report?.report?.status !== 'candidate-fix-request')
        return blocked('report-not-eligible');
    if (!input.projectPath.trim() || source?.provider !== 'gitlab' || source?.repo !== input.projectPath || !source?.mr_iid || !source?.head_sha || observations?.checks !== 'failure' || !Array.isArray(observations.failed_jobs) || observations.failed_jobs.length === 0)
        return blocked('request-source-mismatch');
    const request = buildGitLabPrStewardIssueFixRequest(input.report);
    audit.request_id = request.request_id;
    const fetchImpl = input.fetchImpl ?? globalThis.fetch;
    if (!fetchImpl)
        return blocked('gitlab-fetch-unavailable');
    const headers = { ...buildGitLabAuthHeaders({ token: input.token }), 'User-Agent': 'zj-loop-pr-steward' };
    const issuesUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: 'issues' });
    const existingResponse = await fetchImpl(`${issuesUrl}?state=all&per_page=100&search=${encodeURIComponent(request.request_id)}`, { headers });
    if (!existingResponse.ok)
        return blocked('issue-fix-request-dedupe-read-failed', { http_status: existingResponse.status });
    const existing = (await existingResponse.json()).find((issue) => parseIssueFixRequestComments([{ id: issue.iid, body: String(issue.description ?? '') }]).some((item) => item.validation.ok && item.request.request_id === request.request_id));
    if (existing)
        return { schema: 'zj-loop.gitlab_pr_steward_issue_fix_request.v1', status: 'completed', outcome: 'duplicate', audit, issue: { iid: Number(existing.iid), url: String(existing.web_url ?? '') }, side_effects_executed: false };
    const body = { title: `[Issue Fix Request] pr-steward-fix-request: MR !${source.mr_iid} failing checks`, description: `${buildIssueFixRequestComment(request)}\n\nHuman confirmation: ${CONFIRM_PR_STEWARD_ISSUE_FIX_REQUEST}\n` };
    const response = await fetchImpl(issuesUrl, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok)
        return blocked('issue-fix-request-create-failed', { http_status: response.status, side_effects_executed: true });
    const issue = await response.json();
    return { schema: 'zj-loop.gitlab_pr_steward_issue_fix_request.v1', status: 'completed', outcome: 'created', audit, issue: { iid: Number(issue.iid), url: String(issue.web_url ?? '') }, side_effects_executed: true };
}
