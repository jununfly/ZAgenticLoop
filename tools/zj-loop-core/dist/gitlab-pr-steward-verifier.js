import { buildGitLabApiUrl, buildGitLabAuthHeaders } from './providers.js';
import { parseIssueFixRequestComments } from './issue-fix-request-contract.js';
import { parseGitLabLifecycleMarker, validateGitLabRequestSourceBinding } from './gitlab-request-lifecycle.js';
export const PR_STEWARD_VERIFIER_SCOPES = ['pull-request', 'failed-check-rollup'];
export const PR_STEWARD_VERIFIERS = ['status-check-rollup', 'request-claim'];
export async function verifyGitLabPrStewardScope(input) {
    const audit = {
        project_path: input.projectPath,
        issue_iid: Number(input.issueIid),
        merge_request_iid: Number(input.mergeRequestIid),
        request_id: input.requestId,
        claim_id: input.claimId,
        auth_source: input.token ? 'GITLAB_TOKEN' : null,
    };
    const blocked = (reason, extra = {}) => ({
        schema: 'zj-loop.gitlab_pr_steward_verifier_scope.v1',
        status: 'blocked',
        reason,
        audit,
        verifier: null,
        side_effects_executed: false,
        ...extra,
    });
    if (!input.token)
        return blocked('gitlab-token-required');
    if (!input.projectPath.trim() || !input.requestId.trim() || !input.claimId.trim() || !input.currentHeadSha.trim()) {
        return blocked('verifier-fields-required');
    }
    if (!input.requestedScope.trim() || !input.requestedVerifier.trim())
        return blocked('verifier-scope-fields-required');
    const fetchImpl = input.fetchImpl ?? globalThis.fetch;
    if (!fetchImpl)
        return blocked('gitlab-fetch-unavailable');
    const headers = { ...buildGitLabAuthHeaders({ token: input.token }), 'User-Agent': 'zj-loop-pr-steward' };
    const issueUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['issues', input.issueIid] });
    const mrUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['merge_requests', input.mergeRequestIid] });
    const issueResponse = await fetchImpl(issueUrl, { headers });
    if (!issueResponse.ok)
        return blocked('issue-read-failed', { http_status: issueResponse.status });
    const issue = await issueResponse.json();
    const parsed = parseIssueFixRequestComments([{ id: issue.iid ?? input.issueIid, body: String(issue.description ?? '') }])[0];
    const request = parsed?.validation.ok ? parsed.request : null;
    const binding = validateGitLabRequestSourceBinding({ request, projectPath: input.projectPath, requestId: input.requestId, consumerId: 'pr-steward' });
    if (!binding.ok || Number(request?.subject?.mr_iid) !== Number(input.mergeRequestIid))
        return blocked('request-source-mismatch');
    const mrResponse = await fetchImpl(mrUrl, { headers });
    if (!mrResponse.ok)
        return blocked('merge-request-read-failed', { http_status: mrResponse.status });
    const mr = await mrResponse.json();
    if (String(mr.sha ?? '') !== String(request.subject?.head_sha ?? '') || String(mr.sha ?? '') !== input.currentHeadSha) {
        return blocked('source-head-mismatch', { request_head_sha: request.subject?.head_sha ?? null, current_head_sha: input.currentHeadSha, provider_head_sha: mr.sha ?? null });
    }
    const notesUrl = `${issueUrl}/notes?per_page=100`;
    const notesResponse = await fetchImpl(notesUrl, { headers });
    if (!notesResponse.ok)
        return blocked('claim-read-failed', { http_status: notesResponse.status });
    const notes = await notesResponse.json();
    const claims = notes.map((note) => parseGitLabLifecycleMarker(note, 'pr-steward-claim'))
        .filter((claim) => claim?.request_id === request.request_id && claim?.consumer_id === 'pr-steward');
    if (claims.length !== 1 || claims[0]?.claim_id !== input.claimId) {
        return blocked('claim-mismatch', { existing_claim_id: claims[0]?.claim_id ?? null });
    }
    const scopeAllowed = PR_STEWARD_VERIFIER_SCOPES.includes(input.requestedScope);
    const verifierAllowed = PR_STEWARD_VERIFIERS.includes(input.requestedVerifier);
    if (!scopeAllowed || !verifierAllowed) {
        return blocked('verifier-scope-mismatch', {
            requested_scope: input.requestedScope,
            allowed_scopes: PR_STEWARD_VERIFIER_SCOPES,
            requested_verifier: input.requestedVerifier,
            allowed_verifiers: PR_STEWARD_VERIFIERS,
        });
    }
    return {
        schema: 'zj-loop.gitlab_pr_steward_verifier_scope.v1',
        status: 'completed',
        outcome: 'verified',
        audit,
        verifier: {
            scope: input.requestedScope,
            verifier: input.requestedVerifier,
            claim_id: input.claimId,
            current_head_sha: input.currentHeadSha,
            status: 'passed',
        },
        side_effects_executed: false,
    };
}
