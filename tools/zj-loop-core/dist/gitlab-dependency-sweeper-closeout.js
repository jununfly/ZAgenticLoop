import { buildGitLabApiUrl, buildGitLabAuthHeaders } from './providers.js';
import { parseIssueFixRequestComments } from './issue-fix-request-contract.js';
import { buildGitLabLifecycleMarker, parseGitLabLifecycleMarker, validateGitLabRequestSourceBinding } from './gitlab-request-lifecycle.js';
export const DEPENDENCY_SWEEPER_CLOSEOUT_CONFIRMATION_PHRASE = 'DELETE_MERGED_DEPENDENCY_SWEEPER_BRANCH_AND_CLOSE_CARRIER';
export async function executeGitLabDependencySweeperCloseout(input) {
    const audit = { project_path: input.projectPath, merge_request_iid: Number(input.mergeRequestIid), issue_iid: Number(input.issueIid), request_id: input.requestId, claim_id: input.claimId, branch: input.branch, target_branch: input.targetBranch, auth_source: input.token ? 'GITLAB_TOKEN' : null };
    const blocked = (reason, extra = {}) => ({ schema: 'zj-loop.gitlab_dependency_sweeper_closeout.v1', status: 'blocked', reason, audit, side_effects_executed: false, ...extra });
    if (input.confirmationPhrase !== DEPENDENCY_SWEEPER_CLOSEOUT_CONFIRMATION_PHRASE)
        return blocked('confirmation-required', { confirmation: { location: 'GitLab manual job or Codex conversation', required_phrase: DEPENDENCY_SWEEPER_CLOSEOUT_CONFIRMATION_PHRASE } });
    if (!input.token)
        return blocked('gitlab-token-required');
    if (!input.projectPath.trim() || !input.requestId.trim() || !input.claimId.trim() || !input.branch.trim() || !input.targetBranch.trim())
        return blocked('closeout-fields-required');
    if (!/^automated\/dependency-sweeper-gitlab-[a-z0-9-]+$/.test(input.branch))
        return blocked('repair-branch-invalid');
    const fetchImpl = input.fetchImpl ?? globalThis.fetch;
    if (!fetchImpl)
        return blocked('gitlab-fetch-unavailable');
    const headers = { ...buildGitLabAuthHeaders({ token: input.token }), 'User-Agent': 'zj-loop-dependency-sweeper' };
    const mrUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['merge_requests', input.mergeRequestIid] });
    const issueUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['issues', input.issueIid] });
    const notesUrl = `${issueUrl}/notes`;
    let mrResponse, issueResponse;
    try {
        mrResponse = await fetchImpl(mrUrl, { headers });
        issueResponse = await fetchImpl(issueUrl, { headers });
    }
    catch {
        return blocked('closeout-preflight-read-failed');
    }
    if (!mrResponse.ok)
        return blocked('merge-request-read-failed', { http_status: mrResponse.status });
    if (!issueResponse.ok)
        return blocked('carrier-issue-read-failed', { http_status: issueResponse.status });
    const mr = await mrResponse.json();
    const issue = await issueResponse.json();
    if (!(mr.merged === true || mr.state === 'merged' || mr.merged_at))
        return blocked('merge-request-not-merged');
    if (String(mr.source_branch ?? '') !== input.branch || String(mr.target_branch ?? '') !== input.targetBranch)
        return blocked('request-source-mismatch');
    if (!String(mr.description ?? '').includes(input.requestId))
        return blocked('request-source-mismatch', { reason_detail: 'request-id-missing-from-merge-request' });
    const parsed = parseIssueFixRequestComments([{ id: issue.iid ?? input.issueIid, body: String(issue.description ?? '') }])[0];
    const request = parsed?.validation.ok ? parsed.request : null;
    const binding = validateGitLabRequestSourceBinding({ request, projectPath: input.projectPath, requestId: input.requestId, consumerId: 'dependency-sweeper' });
    if (!binding.ok)
        return blocked('request-source-mismatch', {
            reason_detail: 'request-source-binding-invalid',
            request_status: request?.status ?? null,
        });
    const changesResponse = await fetchImpl(`${mrUrl}/changes`, { headers });
    if (!changesResponse.ok)
        return blocked('merge-request-changes-read-failed', { http_status: changesResponse.status });
    const changes = await changesResponse.json();
    const expectedFiles = Array.isArray(request.subject?.manifest_files) ? [...request.subject.manifest_files].sort() : [];
    const actualFiles = (changes.changes ?? []).map((change) => String(change.new_path ?? change.old_path ?? '')).sort();
    if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles))
        return blocked('repair-scope-mismatch', { expected_files: expectedFiles, actual_files: actualFiles });
    const notesResponse = await fetchImpl(`${notesUrl}?per_page=100`, { headers });
    if (!notesResponse.ok)
        return blocked('claim-read-failed', { http_status: notesResponse.status });
    const notes = await notesResponse.json();
    const claims = notes.map((note) => parseGitLabLifecycleMarker(note, 'dependency-sweeper-claim')).filter((claim) => claim?.request_id === input.requestId && claim?.consumer_id === 'dependency-sweeper');
    if (claims.length !== 1 || claims[0].claim_id !== input.claimId)
        return blocked('claim-required');
    const branchUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['repository', 'branches', input.branch] });
    const branchResponse = await fetchImpl(branchUrl, { headers });
    if (!branchResponse.ok && branchResponse.status !== 404)
        return blocked('repair-branch-read-failed', { http_status: branchResponse.status });
    const steps = [];
    if (branchResponse.status === 404)
        steps.push({ name: 'delete-repair-branch', status: 'skipped', reason: 'branch-absent' });
    else {
        const deleteResponse = await fetchImpl(branchUrl, { method: 'DELETE', headers });
        if (!deleteResponse.ok && deleteResponse.status !== 404)
            return blocked('repair-branch-delete-failed', { http_status: deleteResponse.status, side_effects_executed: true, steps });
        steps.push({ name: 'delete-repair-branch', status: deleteResponse.status === 404 ? 'skipped' : 'deleted', branch: input.branch });
    }
    const closeout = { schema: 'zj-loop.gitlab_dependency_sweeper_closeout.v1', kind: 'post-merge-closeout', request_id: input.requestId, claim_id: input.claimId, merge_request_iid: Number(input.mergeRequestIid), branch: input.branch, target_branch: input.targetBranch, merged_sha: String(mr.merge_commit_sha ?? mr.sha ?? ''), status: 'completed', recorded_at: new Date().toISOString() };
    const noteResponse = await fetchImpl(notesUrl, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ body: `${buildGitLabLifecycleMarker('dependency-sweeper-closeout', closeout)}\n\n### Dependency Sweeper Closeout\n\n- merged MR: !${input.mergeRequestIid}\n- repair branch: \`${input.branch}\`\n- request: ${input.requestId}` }) });
    if (!noteResponse.ok)
        return blocked('closeout-evidence-write-failed', { side_effects_executed: true, steps });
    steps.push({ name: 'append-closeout-evidence', status: 'written', issue: Number(input.issueIid) });
    const closeResponse = await fetchImpl(issueUrl, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ state_event: 'close' }) });
    if (!closeResponse.ok)
        return blocked('carrier-close-failed', { http_status: closeResponse.status, side_effects_executed: true, steps });
    steps.push({ name: 'close-carrier-issue', status: 'closed', issue: Number(input.issueIid) });
    return { schema: 'zj-loop.gitlab_dependency_sweeper_closeout.v1', status: 'completed', outcome: 'closed', audit, side_effects_executed: true, steps };
}
