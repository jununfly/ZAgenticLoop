import { buildGitLabApiUrl, buildGitLabAuthHeaders } from './providers.js';
import { buildGitLabLifecycleMarker, parseGitLabLifecycleMarker } from './gitlab-request-lifecycle.js';
export const CHANGELOG_DRAFTER_CLOSEOUT_CONFIRMATION = 'DELETE_MERGED_CHANGELOG_DRAFT_BRANCH_AND_CLOSE_CARRIER';
export async function closeGitLabChangelogDraft(input) {
    const audit = { project_path: input.projectPath, merge_request_iid: Number(input.mergeRequestIid), issue_iid: Number(input.issueIid), request_id: input.requestId, claim_id: input.claimId, branch: input.branch, target_branch: input.targetBranch, auth_source: input.token ? 'GITLAB_TOKEN' : null };
    const blocked = (reason, extra = {}) => ({ schema: 'zj-loop.gitlab_changelog_draft_closeout.v1', status: 'blocked', reason, audit, side_effects_executed: false, steps: [], ...extra });
    if (input.confirmationPhrase !== CHANGELOG_DRAFTER_CLOSEOUT_CONFIRMATION)
        return blocked('confirmation-required', { required_phrase: CHANGELOG_DRAFTER_CLOSEOUT_CONFIRMATION });
    if (!input.token)
        return blocked('gitlab-token-required');
    if (!/^automated\/changelog-drafter-gitlab-[a-z0-9-]+$/.test(input.branch) || !input.projectPath.trim() || !input.requestId.trim() || !input.claimId.trim())
        return blocked('closeout-fields-or-branch-invalid');
    const fetchImpl = input.fetchImpl ?? globalThis.fetch;
    if (!fetchImpl)
        return blocked('gitlab-fetch-unavailable');
    const headers = { ...buildGitLabAuthHeaders({ token: input.token }), 'User-Agent': 'zj-loop-changelog-drafter' };
    const issueUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['issues', input.issueIid] });
    const mrUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['merge_requests', input.mergeRequestIid] });
    const issueResponse = await fetchImpl(issueUrl, { headers });
    if (!issueResponse.ok)
        return blocked('issue-read-failed', { http_status: issueResponse.status });
    const issue = await issueResponse.json();
    const request = parseGitLabLifecycleMarker({ body: issue.description }, 'changelog-draft-request');
    if (!request || request.request_id !== input.requestId || request.release_window?.repo !== input.projectPath || request.release_window?.base_branch !== input.targetBranch)
        return blocked('request-source-mismatch');
    const notesUrl = `${issueUrl}/notes`;
    const notesResponse = await fetchImpl(`${notesUrl}?per_page=100`, { headers });
    if (!notesResponse.ok)
        return blocked('notes-read-failed', { http_status: notesResponse.status });
    const notes = await notesResponse.json();
    const claim = notes.map((note) => parseGitLabLifecycleMarker(note, 'changelog-draft-claim')).find((item) => item?.request_id === input.requestId && item?.claim_id === input.claimId && item?.consumer_id === 'changelog-drafter');
    if (!claim)
        return blocked('claim-not-found');
    const mrResponse = await fetchImpl(mrUrl, { headers });
    if (!mrResponse.ok)
        return blocked('merge-request-read-failed', { http_status: mrResponse.status });
    const mr = await mrResponse.json();
    if (mr.state !== 'merged' || !mr.merged_at || !mr.merge_commit_sha)
        return blocked('merge-not-confirmed', { provider_state: mr.state ?? null, merged_at: mr.merged_at ?? null, merge_commit_sha: mr.merge_commit_sha ?? null });
    if (String(mr.source_branch ?? '') !== input.branch || String(mr.target_branch ?? '') !== input.targetBranch)
        return blocked('merge-request-binding-mismatch');
    const closeout = { schema: 'zj-loop.gitlab_changelog_draft_closeout.v1', request_id: input.requestId, claim_id: input.claimId, merge_request_iid: Number(input.mergeRequestIid), branch: input.branch, target_branch: input.targetBranch, merged_sha: String(mr.merge_commit_sha), status: 'completed', recorded_at: new Date().toISOString() };
    const existing = notes.map((note) => parseGitLabLifecycleMarker(note, 'changelog-draft-closeout')).find((item) => item?.request_id === input.requestId && item?.claim_id === input.claimId);
    const steps = [];
    if (!existing) {
        const noteWrite = await fetchImpl(notesUrl, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ body: `${buildGitLabLifecycleMarker('changelog-draft-closeout', closeout)}\n\n### Changelog Draft Closeout\n\n- merged MR: !${input.mergeRequestIid}\n- request: \`${input.requestId}\`\n- branch: \`${input.branch}\`` }) });
        if (!noteWrite.ok)
            return blocked('closeout-evidence-write-failed', { http_status: noteWrite.status, side_effects_executed: true, steps });
        steps.push({ name: 'append-closeout-evidence', status: 'written' });
    }
    else
        steps.push({ name: 'append-closeout-evidence', status: 'existing' });
    const reread = await fetchImpl(`${notesUrl}?per_page=100`, { headers });
    if (!reread.ok)
        return blocked('closeout-evidence-reread-failed', { http_status: reread.status, side_effects_executed: true, steps });
    const rereadNotes = await reread.json();
    const closeoutMatches = rereadNotes.map((note) => parseGitLabLifecycleMarker(note, 'changelog-draft-closeout')).filter((item) => item?.request_id === input.requestId && item?.claim_id === input.claimId);
    if (closeoutMatches.length !== 1)
        return blocked('closeout-evidence-reread-ambiguous', { side_effects_executed: true, steps });
    const branchUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['repository', 'branches', input.branch] });
    const deleteResponse = await fetchImpl(branchUrl, { method: 'DELETE', headers });
    if (!deleteResponse.ok && deleteResponse.status !== 404)
        return blocked('branch-delete-failed', { http_status: deleteResponse.status, side_effects_executed: true, steps });
    steps.push({ name: 'delete-draft-branch', status: deleteResponse.status === 404 ? 'already-deleted' : 'deleted' });
    const closeResponse = await fetchImpl(issueUrl, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ state_event: 'close' }) });
    if (!closeResponse.ok)
        return blocked('carrier-close-failed', { http_status: closeResponse.status, side_effects_executed: true, steps });
    steps.push({ name: 'close-carrier', status: 'closed' });
    return { schema: 'zj-loop.gitlab_changelog_draft_closeout.v1', status: 'completed', outcome: 'closed', audit, side_effects_executed: true, steps };
}
