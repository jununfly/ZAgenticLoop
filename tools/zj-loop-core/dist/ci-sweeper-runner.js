import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildGitLabApiUrl, buildGitLabAuthHeaders, buildProviderIssueUrl, } from './providers.js';
import { buildIssueFixRequestComment, ISSUE_FIX_REQUEST_SCHEMA, parseIssueFixRequestComments, } from './issue-fix-request-contract.js';
import { buildGitLabLifecycleAudit, buildGitLabLifecycleMarker, parseGitLabLifecycleMarker, validateGitLabRequestSourceBinding, } from './gitlab-request-lifecycle.js';
import { buildGitLabCarrierSideEffectGate } from './gitlab-side-effect-gate.js';
export const GITLAB_CI_SWEEPER_ISSUE_FIX_REQUEST_SCHEMA = 'zj-loop.gitlab_issue_fix_request_live.v1';
export function buildCiSweeperIssueFixRequestBody(input) {
    const routeDecision = input.routeDecision ?? {};
    const provider = input.provider ?? providerFor(routeDecision, input.sourceUrl);
    const signalId = String(routeDecision.signal_id ?? routeDecision.source_signal_id ?? `ci:${input.runId ?? 'unknown-run'}`);
    const runId = String(input.runId ?? routeDecision.source_run_id ?? '');
    const sourceUrl = input.sourceUrl ?? routeDecision.source_url ?? '';
    const providerMetadata = ciProviderMetadata({ provider, runId, sourceUrl });
    const dedupeKey = String(routeDecision.dedupe_key ?? `${input.repo}:ci-sweeper:${signalId}:generated-workflow`);
    if (input.repairActions !== undefined && !validateGitLabCommitActions(input.repairActions)) {
        throw new Error('repair-actions-invalid');
    }
    const request = {
        schema: ISSUE_FIX_REQUEST_SCHEMA,
        request_id: `ifr_${stableHash(dedupeKey)}`,
        status: 'requested',
        created_at: input.createdAt ?? routeDecision.created_at ?? new Date().toISOString(),
        source_signal: {
            signal_id: signalId,
            source: 'ci',
            provider,
            summary: String(routeDecision.subject ?? input.workflowName ?? 'CI workflow failure'),
            source_url: sourceUrl,
            provider_metadata: providerMetadata,
        },
        subject: {
            type: 'ci',
            provider,
            repo: input.repo,
            workflow: input.workflowName ?? '',
            run_id: runId,
            source_url: sourceUrl,
            provider_metadata: providerMetadata,
        },
        route_decision: {
            ...routeDecision,
            target_consumer: routeDecision.target_consumer ?? 'ci-sweeper',
            request_kind: routeDecision.request_kind ?? 'issue-fix-request',
            dedupe_key: dedupeKey,
        },
        dedupe_key: dedupeKey,
        requested_consumer: {
            consumer_id: 'ci-sweeper',
            capability: 'deterministic-ci-repair',
        },
        fix_scope: {
            repo: input.repo,
            files_or_areas: ciSweeperFilesOrAreasFor(provider),
            non_goals: ['auto-merge'],
        },
        acceptance_criteria: [
            'Open a verifier-backed Fix PR or append failed/escalation evidence.',
            'Do not auto-merge the Fix PR.',
        ],
        verification_gate: {
            commands: [
                { id: 'zagenticloop-validate', command: 'bash', args: ['scripts/ci-validate-gates.sh'], cwd: '.' },
                { id: 'zagenticloop-audit', command: 'bash', args: ['scripts/ci-audit-gates.sh'], cwd: '.' },
            ],
        },
        failure_policy: {
            on_failure: 'failed_requires_new_request',
            retry: 'new_request_only',
        },
        ...(input.repairActions !== undefined ? { repair_actions: input.repairActions } : {}),
        lifecycle: {
            linked_pr: null,
            consumed_by: null,
            closed_at: null,
        },
    };
    return [
        `# Issue Fix Request: ${request.requested_consumer.consumer_id}`,
        '',
        buildIssueFixRequestComment(request).trim(),
        '',
        '## Human-readable summary',
        '',
        `- Source signal: \`${signalId}\``,
        `- Route decision: \`${routeDecision.decision_id ?? 'unknown'}\``,
        `- Consumer: \`${request.requested_consumer.consumer_id}\``,
        `- Dedupe key: \`${dedupeKey}\``,
        `- Source URL: ${request.source_signal.source_url || '(none)'}`,
        '',
        'The Fix Consumer must open a verifier-backed Fix PR or append failed/escalation evidence.',
        '',
    ].join('\n');
}
export async function createGitLabCiSweeperIssueFixRequest(input) {
    const fetchImpl = input.fetchImpl ?? globalThis.fetch;
    const parsed = parseIssueFixRequestComments([{ id: null, body: input.requestBody }])[0];
    const request = parsed?.validation.ok ? parsed.request : null;
    const audit = {
        ...buildGitLabLifecycleAudit({ projectPath: input.projectPath, requestId: request?.request_id, token: input.token }),
        dedupe_key: request?.dedupe_key ?? null,
    };
    const blocked = (reason, extra = {}) => ({
        schema: GITLAB_CI_SWEEPER_ISSUE_FIX_REQUEST_SCHEMA,
        status: 'blocked',
        reason,
        audit,
        issue: null,
        ...extra,
    });
    const sideEffectGate = buildGitLabCarrierSideEffectGate({
        projectPath: input.projectPath,
        routeFamily: 'ci-sweeper',
        pipelineSource: input.pipelineSource,
        carrierEnabled: input.carrierEnabled,
        confirmation: input.carrierConfirmation,
        breakerState: input.breakerState,
    });
    if (sideEffectGate.status !== 'allowed')
        return blocked(sideEffectGate.reason, { side_effect_gate: sideEffectGate });
    if (!input.token)
        return blocked('gitlab-token-required');
    if (!request || request.route_decision?.request_kind !== 'issue-fix-request') {
        return blocked('issue-fix-request-invalid');
    }
    if (!input.projectPath.trim())
        return blocked('project-path-required');
    if (!input.title.trim())
        return blocked('issue-title-required');
    if (!fetchImpl)
        return blocked('gitlab-fetch-unavailable');
    const headers = { ...buildGitLabAuthHeaders({ token: input.token }), 'User-Agent': 'zj-loop-ci-sweeper' };
    const issuesUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: 'issues' });
    const findExisting = async () => {
        const response = await fetchImpl(`${issuesUrl}?state=all&per_page=100&search=${encodeURIComponent(request.request_id)}`, { headers });
        if (!response.ok)
            return { response, issue: null };
        const issues = await response.json();
        const issue = issues.find((candidate) => {
            const candidateBody = String(candidate.description ?? candidate.body ?? '');
            const parsedCandidate = parseIssueFixRequestComments([{ id: candidate.iid ?? candidate.id ?? null, body: candidateBody }])[0];
            return parsedCandidate?.validation.ok && parsedCandidate.request.request_id === request.request_id;
        });
        return { response, issue };
    };
    let existing;
    try {
        existing = await findExisting();
    }
    catch {
        return blocked('issue-fix-request-dedupe-read-failed');
    }
    if (!existing.response.ok)
        return blocked('issue-fix-request-dedupe-read-failed', { http_status: existing.response.status });
    if (existing.issue)
        return completedGitLabIssueFixRequest({ audit, outcome: 'duplicate', issue: existing.issue, input });
    const createUrl = issuesUrl;
    try {
        const response = await fetchImpl(createUrl, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: input.title, description: input.requestBody }),
        });
        if (!response.ok)
            return blocked('issue-fix-request-create-failed', { http_status: response.status });
        const issue = await response.json();
        if (!Number.isInteger(Number(issue.iid)))
            return blocked('issue-fix-request-create-response-invalid');
        return completedGitLabIssueFixRequest({ audit, outcome: 'created', issue, input });
    }
    catch {
        try {
            const recovered = await findExisting();
            if (recovered.response.ok && recovered.issue) {
                return completedGitLabIssueFixRequest({ audit, outcome: 'recovered-duplicate', issue: recovered.issue, input });
            }
        }
        catch {
            // Preserve the single-write boundary; the caller receives a replayable hard stop.
        }
        return blocked('issue-fix-request-create-uncertain');
    }
}
export async function claimGitLabCiSweeperIssueFixRequest(input) {
    const fetchImpl = input.fetchImpl ?? globalThis.fetch;
    const audit = buildGitLabLifecycleAudit({
        projectPath: input.projectPath,
        issueIid: input.issueIid,
        requestId: input.requestId,
        claimId: input.claimId,
        consumerId: input.consumerId ?? 'ci-sweeper',
        token: input.token,
    });
    const blocked = (reason, extra = {}) => ({
        schema: 'zj-loop.gitlab_ci_sweeper_claim.v1',
        status: 'blocked',
        reason,
        audit,
        claim: null,
        ...extra,
    });
    if (!input.token)
        return blocked('gitlab-token-required');
    if (!Number.isInteger(Number(input.issueIid)) || Number(input.issueIid) <= 0)
        return blocked('issue-iid-required');
    if (!input.requestId.trim() || !input.claimId.trim() || !input.sourcePipelineId.trim())
        return blocked('claim-fields-required');
    if (!fetchImpl)
        return blocked('gitlab-fetch-unavailable');
    const headers = { ...buildGitLabAuthHeaders({ token: input.token }), 'User-Agent': 'zj-loop-ci-sweeper' };
    const issueUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['issues', input.issueIid] });
    const notesUrl = `${issueUrl}/notes`;
    let issueResponse;
    try {
        issueResponse = await fetchImpl(issueUrl, { headers });
    }
    catch {
        return blocked('issue-read-failed');
    }
    if (!issueResponse.ok)
        return blocked('issue-read-failed', { http_status: issueResponse.status });
    const issue = await issueResponse.json();
    const parsed = parseIssueFixRequestComments([{ id: issue.iid ?? input.issueIid, body: String(issue.description ?? '') }])[0];
    const request = parsed?.validation.ok ? parsed.request : null;
    if (!request || request.route_decision?.target_consumer !== 'ci-sweeper' || request.route_decision?.request_kind !== 'issue-fix-request') {
        return blocked('issue-fix-request-invalid');
    }
    const sourceBinding = validateGitLabRequestSourceBinding({
        request,
        projectPath: input.projectPath,
        requestId: input.requestId,
        consumerId: input.consumerId ?? 'ci-sweeper',
    });
    if (!sourceBinding.ok)
        return blocked(sourceBinding.reason ?? 'request-source-mismatch', { request_id: request.request_id });
    if (request.status !== 'requested')
        return blocked('request-not-requested', { request_id: request.request_id });
    if (input.route) {
        const verifier = buildCiSweeperVerifierPlan({ request, route: input.route });
        const actionGate = buildCiSweeperRepairActionGate({
            request,
            route: input.route,
            changedFiles: (request.repair_actions ?? []).map((item) => item.file_path ?? item.path).filter(Boolean),
        });
        if (verifier.status !== 'ready' || actionGate.status !== 'ready') {
            return blocked('verifier-blocked', { request_id: request.request_id, verifier, action_gate: actionGate });
        }
    }
    const readClaims = async () => {
        const response = await fetchImpl(`${notesUrl}?per_page=100`, { headers });
        if (!response.ok)
            return { response, claims: [] };
        const notes = await response.json();
        return { response, claims: notes.map(parseCiSweeperClaim).filter((claim) => Boolean(claim && claim.request_id === request.request_id)) };
    };
    let before;
    try {
        before = await readClaims();
    }
    catch {
        return blocked('claim-read-failed', { request_id: request.request_id });
    }
    if (!before.response.ok)
        return blocked('claim-read-failed', { request_id: request.request_id, http_status: before.response.status });
    if (before.claims.length > 0)
        return claimDuplicateResult(audit, before.claims[0]);
    const claim = {
        schema: 'zj-loop.gitlab_ci_sweeper_claim.v1',
        request_id: request.request_id,
        claim_id: input.claimId,
        consumer_id: input.consumerId ?? 'ci-sweeper',
        status: 'claimed',
        source_pipeline_id: input.sourcePipelineId,
        claimed_at: new Date().toISOString(),
    };
    const body = `${buildGitLabLifecycleMarker('ci-sweeper-claim', claim)}\n\n### CI Sweeper Claim\n\n- request: \`${request.request_id}\`\n- consumer: \`${claim.consumer_id}\`\n- claim: \`${claim.claim_id}\`\n- source pipeline: \`${claim.source_pipeline_id}\``;
    try {
        const response = await fetchImpl(notesUrl, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ body }),
        });
        if (!response.ok)
            return blocked('claim-write-failed', { request_id: request.request_id, http_status: response.status });
    }
    catch {
        return blocked('claim-write-uncertain', { request_id: request.request_id });
    }
    let after;
    try {
        after = await readClaims();
    }
    catch {
        return blocked('claim-reread-failed', { request_id: request.request_id });
    }
    if (!after.response.ok)
        return blocked('claim-reread-failed', { request_id: request.request_id, http_status: after.response.status });
    if (after.claims.length !== 1 || after.claims[0].claim_id !== input.claimId) {
        return claimDuplicateResult(audit, after.claims[0] ?? { request_id: request.request_id, claim_id: null });
    }
    return {
        schema: 'zj-loop.gitlab_ci_sweeper_claim.v1',
        status: 'completed',
        outcome: 'claimed',
        audit: { ...audit, request_id: request.request_id },
        claim,
    };
}
export async function appendGitLabCiSweeperLifecycleEvidence(input) {
    const fetchImpl = input.fetchImpl ?? globalThis.fetch;
    const headers = { ...buildGitLabAuthHeaders({ token: input.token }), 'User-Agent': 'zj-loop-ci-sweeper' };
    const audit = buildGitLabLifecycleAudit({ projectPath: input.projectPath, issueIid: input.issueIid, requestId: input.requestId, claimId: input.claimId, token: input.token });
    if (!input.token)
        return { schema: 'zj-loop.gitlab_ci_sweeper_lifecycle.v1', status: 'blocked', reason: 'gitlab-token-required', audit, lifecycle: null };
    if (!fetchImpl)
        return { schema: 'zj-loop.gitlab_ci_sweeper_lifecycle.v1', status: 'blocked', reason: 'gitlab-fetch-unavailable', audit, lifecycle: null };
    const notesUrl = `${buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['issues', input.issueIid] })}/notes`;
    const notesResponse = await fetchImpl(`${notesUrl}?per_page=100`, { headers });
    if (!notesResponse.ok)
        return { schema: 'zj-loop.gitlab_ci_sweeper_lifecycle.v1', status: 'blocked', reason: 'claim-read-failed', audit, lifecycle: null };
    const notes = await notesResponse.json();
    const claim = notes.map(parseCiSweeperClaim).find((item) => item?.request_id === input.requestId && item.claim_id === input.claimId);
    if (!claim)
        return { schema: 'zj-loop.gitlab_ci_sweeper_lifecycle.v1', status: 'blocked', reason: 'claim-not-found', audit, lifecycle: null };
    const lifecycle = { schema: 'zj-loop.gitlab_ci_sweeper_lifecycle.v1', request_id: input.requestId, claim_id: input.claimId, status: input.status, evidence: input.evidence ?? {}, recorded_at: new Date().toISOString() };
    const body = `${buildGitLabLifecycleMarker('ci-sweeper-lifecycle', lifecycle)}\n\n### CI Sweeper Lifecycle\n\n- request: \`${input.requestId}\`\n- claim: \`${input.claimId}\`\n- status: **${input.status}**`;
    const response = await fetchImpl(notesUrl, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) });
    if (!response.ok)
        return { schema: 'zj-loop.gitlab_ci_sweeper_lifecycle.v1', status: 'blocked', reason: 'lifecycle-write-failed', audit, lifecycle: null, http_status: response.status };
    return { schema: 'zj-loop.gitlab_ci_sweeper_lifecycle.v1', status: 'completed', outcome: 'lifecycle-appended', audit, lifecycle };
}
export function buildCiSweeperVerifierPlan(input) {
    const requested = input.request?.verification_gate?.commands;
    const allowlist = input.route?.guards?.verification_gate_allowlist;
    const refusals = [];
    if (!Array.isArray(requested) || requested.length === 0)
        refusals.push('verification-gates-missing');
    if (!Array.isArray(allowlist) || allowlist.length === 0)
        refusals.push('verification-gate-allowlist-missing');
    const commands = [];
    if (Array.isArray(requested) && Array.isArray(allowlist)) {
        requested.forEach((command, index) => {
            if (!isStructuredCommand(command)) {
                refusals.push(`verification-command-must-be-structured:${index}`);
                return;
            }
            const allowed = allowlist.some((candidate) => isStructuredCommand(candidate) && sameCommand(candidate, command));
            if (!allowed)
                refusals.push(`verification-command-not-allowlisted:${command.id ?? index}`);
            else
                commands.push(command);
        });
    }
    return {
        schema: 'zj-loop.ci_sweeper_verifier_plan.v1',
        status: refusals.length === 0 ? 'ready' : 'blocked',
        commands,
        refusals,
    };
}
export function buildCiSweeperRepairActionGate(input) {
    const actions = input.request?.repair_actions;
    const allowedActions = input.route?.guards?.repair_actions;
    const scopes = input.route?.guards?.repair_scope;
    const refusals = [];
    if (!Array.isArray(actions) || actions.length === 0)
        refusals.push('repair-actions-missing');
    if (!Array.isArray(allowedActions) || allowedActions.length === 0)
        refusals.push('repair-action-allowlist-missing');
    if (!Array.isArray(scopes) || scopes.length === 0)
        refusals.push('repair-scope-missing');
    const normalizedFiles = (input.changedFiles ?? []).map(normalizeRepoPath);
    if (Array.isArray(actions)) {
        for (const item of actions) {
            if (!item || typeof item.action !== 'string' || !['create', 'update', 'delete', 'move', 'chmod'].includes(item.action)) {
                refusals.push(`repair-action-unsupported:${String(item?.action ?? '')}`);
                continue;
            }
            const actionPath = item.file_path ?? item.path;
            const file = normalizeRepoPath(actionPath);
            if (!file || file.startsWith('../') || file.startsWith('/'))
                refusals.push(`repair-action-path-escapes-repository:${String(actionPath ?? '')}`);
            if (Array.isArray(allowedActions) && !allowedActions.includes(item.action))
                refusals.push(`repair-action-not-allowlisted:${item.action}`);
            if (Array.isArray(scopes) && !scopes.some((scope) => file.startsWith(normalizeScope(scope)))) {
                refusals.push(`repair-action-scope-mismatch:${String(actionPath ?? '')}`);
            }
            if (item.action === 'chmod' && !['100644', '100755'].includes(String(item.mode ?? '')))
                refusals.push(`repair-action-mode-invalid:${String(item.path ?? '')}`);
        }
    }
    if (normalizedFiles.some((file) => !file || !scopes?.some((scope) => file.startsWith(normalizeScope(scope))))) {
        refusals.push('changed-file-scope-mismatch');
    }
    return {
        schema: 'zj-loop.ci_sweeper_repair_action_gate.v1',
        status: refusals.length === 0 ? 'ready' : 'blocked',
        actions: Array.isArray(actions) ? actions : [],
        changed_files: normalizedFiles,
        refusals,
    };
}
export async function createGitLabCiSweeperRepairMr(input) {
    const fetchImpl = input.fetchImpl ?? globalThis.fetch;
    const audit = {
        project_path: input.projectPath,
        branch: input.branch,
        target_branch: input.targetBranch,
        auth_source: input.token ? 'GITLAB_TOKEN' : null,
    };
    const blocked = (reason, extra = {}) => ({
        schema: 'zj-loop.gitlab_ci_sweeper_repair_mr.v1',
        status: 'blocked',
        reason,
        audit,
        merge_request: null,
        ...extra,
    });
    if (!input.token)
        return blocked('gitlab-token-required');
    if (!input.projectPath.trim() || !input.targetBranch.trim() || !input.branch.trim())
        return blocked('repair-mr-fields-required');
    if (!/^automated\/ci-sweeper-gitlab-[a-zA-Z0-9._-]+$/.test(input.branch))
        return blocked('repair-branch-name-invalid');
    if (!Array.isArray(input.actions) || input.actions.length === 0 || !validateGitLabCommitActions(input.actions))
        return blocked('commit-actions-invalid');
    if (!fetchImpl)
        return blocked('gitlab-fetch-unavailable');
    const headers = { ...buildGitLabAuthHeaders({ token: input.token }), 'User-Agent': 'zj-loop-ci-sweeper' };
    const effectiveDiff = await hasEffectiveGitLabRepairDiff({
        projectPath: input.projectPath,
        targetBranch: input.targetBranch,
        actions: input.actions,
        apiBaseUrl: input.apiBaseUrl,
        headers,
        fetchImpl,
    });
    if (effectiveDiff === false)
        return blocked('repair-no-effective-diff');
    if (effectiveDiff === null)
        return blocked('repair-diff-read-failed');
    const mergeRequestsUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: 'merge_requests' });
    let existingResponse;
    try {
        existingResponse = await fetchImpl(`${mergeRequestsUrl}?state=opened&source_branch=${encodeURIComponent(input.branch)}&per_page=100`, { headers });
    }
    catch {
        return blocked('repair-mr-dedupe-read-failed');
    }
    if (!existingResponse.ok)
        return blocked('repair-mr-dedupe-read-failed', { http_status: existingResponse.status });
    const existing = (await existingResponse.json())[0];
    if (existing)
        return completedRepairMrResult(audit, 'duplicate', existing);
    const branchesUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['repository', 'branches'] });
    const branchUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['repository', 'branches', input.branch] });
    const branchCreateResponse = await postGitLabJson(fetchImpl, branchesUrl, headers, { branch: input.branch, ref: input.targetBranch });
    if (!branchCreateResponse.ok && branchCreateResponse.status !== 400)
        return blocked('repair-branch-create-failed', { http_status: branchCreateResponse.status });
    let branchReady = false;
    for (let attempt = 0; attempt < 5; attempt += 1) {
        let branchResponse;
        try {
            branchResponse = await fetchImpl(branchUrl, { headers });
        }
        catch {
            return blocked('repair-branch-read-failed');
        }
        if (branchResponse.ok) {
            branchReady = true;
            break;
        }
        if (branchResponse.status !== 404)
            return blocked('repair-branch-read-failed', { http_status: branchResponse.status });
        if (attempt < 4)
            await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!branchReady)
        return blocked('repair-branch-not-ready');
    const commitsUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['repository', 'commits'] });
    const commitPayload = {
        branch: input.branch,
        commit_message: input.commitMessage,
        actions: input.actions,
    };
    const commitResponse = await postGitLabJson(fetchImpl, commitsUrl, headers, commitPayload);
    if (!commitResponse.ok)
        return blocked('repair-commit-create-failed', {
            http_status: commitResponse.status,
            provider_error: await readGitLabResponseError(commitResponse),
            provider_endpoint: new URL(commitsUrl).pathname,
            request_summary: summarizeGitLabCommitRequest(commitPayload),
        });
    const mrResponse = await postGitLabJson(fetchImpl, mergeRequestsUrl, headers, {
        source_branch: input.branch,
        target_branch: input.targetBranch,
        title: input.title,
        description: input.description,
        remove_source_branch: false,
    });
    if (!mrResponse.ok)
        return blocked('repair-mr-create-failed', { http_status: mrResponse.status });
    const mergeRequest = await mrResponse.json();
    if (!Number.isInteger(Number(mergeRequest.iid)))
        return blocked('repair-mr-create-response-invalid');
    return completedRepairMrResult(audit, 'created', mergeRequest);
}
async function hasEffectiveGitLabRepairDiff(input) {
    for (const action of input.actions) {
        if (action.action === 'move' || action.action === 'chmod')
            return true;
        const filePath = String(action.file_path ?? '');
        const fileUrl = buildGitLabApiUrl({
            apiBaseUrl: input.apiBaseUrl,
            projectPath: input.projectPath,
            path: ['repository', 'files', filePath],
        });
        let response;
        try {
            response = await input.fetchImpl(`${fileUrl}?ref=${encodeURIComponent(input.targetBranch)}`, { headers: input.headers });
        }
        catch {
            return null;
        }
        if (response.status === 404) {
            if (action.action === 'delete')
                continue;
            return true;
        }
        if (!response.ok)
            return null;
        if (action.action === 'delete')
            return true;
        if (action.action === 'create')
            continue;
        const current = await response.json();
        const expected = action.encoding === 'base64'
            ? Buffer.from(String(action.content ?? ''), 'base64').toString('utf8')
            : String(action.content ?? '');
        const actual = Buffer.from(String(current.content ?? ''), 'base64').toString('utf8');
        if (actual !== expected)
            return true;
    }
    return false;
}
export async function triggerGitLabCiSweeperConsumerPipeline(input) {
    const fetchImpl = input.fetchImpl ?? globalThis.fetch;
    const audit = {
        project_path: input.projectPath,
        ref: input.ref,
        issue_iid: Number(input.issueIid),
        request_id: input.requestId,
        claim_id: input.claimId,
        auth_source: input.token ? 'GITLAB_TOKEN' : null,
    };
    const blocked = (reason, extra = {}) => ({
        schema: 'zj-loop.gitlab_ci_sweeper_consumer_trigger.v1',
        status: 'blocked',
        reason,
        audit,
        pipeline: null,
        ...extra,
    });
    if (!input.token)
        return blocked('gitlab-token-required');
    if (!input.projectPath.trim() || !input.ref.trim() || !input.requestId.trim() || !input.claimId.trim() || !Number.isInteger(Number(input.issueIid)) || Number(input.issueIid) <= 0) {
        return blocked('consumer-trigger-fields-required');
    }
    if (!fetchImpl)
        return blocked('gitlab-fetch-unavailable');
    const url = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: 'pipeline' });
    const headers = { ...buildGitLabAuthHeaders({ token: input.token }), 'User-Agent': 'zj-loop-ci-sweeper', 'Content-Type': 'application/json' };
    const variables = [
        { key: 'ZJ_LOOP_CI_SWEEPER_REQUEST_ISSUE_IID', value: String(input.issueIid) },
        { key: 'ZJ_LOOP_CI_SWEEPER_REQUEST_ID', value: input.requestId },
        { key: 'ZJ_LOOP_CI_SWEEPER_CLAIM_ID', value: input.claimId },
    ];
    let response;
    try {
        response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify({ ref: input.ref, variables }) });
    }
    catch {
        return blocked('consumer-trigger-write-uncertain');
    }
    if (!response.ok)
        return blocked('consumer-trigger-failed', { http_status: response.status });
    const pipeline = await response.json();
    if (!Number.isInteger(Number(pipeline.id)))
        return blocked('consumer-trigger-response-invalid');
    return {
        schema: 'zj-loop.gitlab_ci_sweeper_consumer_trigger.v1',
        status: 'completed',
        outcome: 'triggered',
        audit,
        pipeline: { id: Number(pipeline.id), url: String(pipeline.web_url ?? ''), ref: String(pipeline.ref ?? input.ref), source: String(pipeline.source ?? 'api') },
    };
}
export async function executeGitLabCiSweeperCloseout(input) {
    const audit = {
        project_path: input.projectPath,
        merge_request_iid: Number(input.mergeRequestIid),
        issue_iid: Number(input.issueIid),
        request_id: input.requestId,
        branch: input.branch,
        target_branch: input.targetBranch,
        auth_source: input.token ? 'GITLAB_TOKEN' : null,
    };
    const blocked = (reason, extra = {}) => ({
        schema: 'zj-loop.gitlab_ci_sweeper_closeout.v1',
        status: 'blocked',
        reason,
        audit,
        side_effects_executed: false,
        ...extra,
    });
    if (input.confirmationPhrase !== 'DELETE_MERGED_ROADMAP_BRANCH_AND_CLOSE_CARRIER')
        return blocked('confirmation-required');
    if (!input.token)
        return blocked('gitlab-token-required');
    if (!input.projectPath.trim() || !input.requestId.trim() || !input.targetBranch.trim())
        return blocked('closeout-fields-required');
    if (!Number.isInteger(Number(input.mergeRequestIid)) || !Number.isInteger(Number(input.issueIid)))
        return blocked('closeout-issue-fields-invalid');
    if (!/^automated\/ci-sweeper-gitlab-[a-zA-Z0-9._-]+$/.test(input.branch))
        return blocked('repair-branch-invalid');
    const fetchImpl = input.fetchImpl ?? globalThis.fetch;
    if (!fetchImpl)
        return blocked('gitlab-fetch-unavailable');
    const headers = { ...buildGitLabAuthHeaders({ token: input.token }), 'User-Agent': 'zj-loop-ci-sweeper' };
    const mrUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['merge_requests', input.mergeRequestIid] });
    const issueUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['issues', input.issueIid] });
    const notesUrl = `${issueUrl}/notes`;
    const branchUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['repository', 'branches', input.branch] });
    let mrResponse;
    let issueResponse;
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
        return blocked('request-source-mismatch', { merge_request_source_branch: mr.source_branch ?? null, merge_request_target_branch: mr.target_branch ?? null });
    if (!String(mr.description ?? '').includes(input.requestId))
        return blocked('request-source-mismatch', { reason_detail: 'request-id-missing-from-merge-request' });
    const parsed = parseIssueFixRequestComments([{ id: issue.iid ?? input.issueIid, body: String(issue.description ?? '') }])[0];
    const request = parsed?.validation.ok ? parsed.request : null;
    if (!request || request.request_id !== input.requestId || request.source_signal?.provider !== 'gitlab' || String(request.subject?.repo ?? '') !== input.projectPath || request.route_decision?.target_consumer !== 'ci-sweeper')
        return blocked('request-source-mismatch');
    let notesResponse;
    try {
        notesResponse = await fetchImpl(`${notesUrl}?per_page=100`, { headers });
    }
    catch {
        return blocked('claim-read-failed');
    }
    if (!notesResponse.ok)
        return blocked('claim-read-failed', { http_status: notesResponse.status });
    const claims = (await notesResponse.json()).map(parseCiSweeperClaim).filter((claim) => Boolean(claim && claim.request_id === input.requestId));
    if (claims.length !== 1 || claims[0].status !== 'claimed')
        return blocked('claim-required');
    let branchResponse;
    try {
        branchResponse = await fetchImpl(branchUrl, { headers });
    }
    catch {
        return blocked('repair-branch-read-failed');
    }
    if (!branchResponse.ok && branchResponse.status !== 404)
        return blocked('repair-branch-read-failed', { http_status: branchResponse.status });
    const steps = [];
    if (branchResponse.status === 404) {
        steps.push({ name: 'delete-repair-branch', status: 'skipped', reason: 'branch-absent' });
    }
    else {
        const deleteResponse = await fetchImpl(branchUrl, { method: 'DELETE', headers });
        if (!deleteResponse.ok && deleteResponse.status !== 404)
            return blocked('repair-branch-delete-failed', { http_status: deleteResponse.status, side_effects_executed: true, steps });
        steps.push({ name: 'delete-repair-branch', status: deleteResponse.status === 404 ? 'skipped' : 'deleted', branch: input.branch });
    }
    const closeout = {
        schema: 'zj-loop.gitlab_ci_sweeper_closeout.v1',
        kind: 'post-merge-closeout',
        request_id: input.requestId,
        claim_id: claims[0].claim_id,
        merge_request_iid: Number(input.mergeRequestIid),
        branch: input.branch,
        status: 'completed',
        recorded_at: new Date().toISOString(),
    };
    const noteResponse = await fetchImpl(notesUrl, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: `<!-- zj-loop:ci-sweeper-closeout\n${JSON.stringify(closeout)}\n-->\n\n### CI Sweeper Closeout\n\n- merged MR: !${input.mergeRequestIid}\n- repair branch: \`${input.branch}\`\n- request: \`${input.requestId}\`` }),
    });
    if (!noteResponse.ok)
        return blocked('closeout-evidence-write-failed', { side_effects_executed: true, steps });
    steps.push({ name: 'append-closeout-evidence', status: 'written', issue: Number(input.issueIid) });
    const closeResponse = await fetchImpl(issueUrl, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ state_event: 'close' }),
    });
    if (!closeResponse.ok)
        return blocked('carrier-close-failed', { http_status: closeResponse.status, side_effects_executed: true, steps });
    steps.push({ name: 'close-carrier-issue', status: 'closed', issue: Number(input.issueIid) });
    return {
        schema: 'zj-loop.gitlab_ci_sweeper_closeout.v1',
        status: 'completed',
        outcome: 'closed',
        audit,
        side_effects_executed: true,
        steps,
    };
}
export async function executeGitLabCiSweeperRepairMr(input) {
    const audit = { project_path: input.projectPath, issue_iid: Number(input.issueIid), request_id: input.requestId, claim_id: input.claimId, source_pipeline_id: input.sourcePipelineId, auth_source: input.token ? 'GITLAB_TOKEN' : null };
    const blocked = (reason, extra = {}) => ({ schema: 'zj-loop.gitlab_ci_sweeper_execution.v1', status: 'blocked', reason, audit, claim: null, repair_mr: null, ...extra });
    if (!input.token)
        return blocked('gitlab-token-required');
    if (!input.route || input.route.maturity?.runner !== 'execution-ready')
        return blocked('runner-not-execution-ready');
    const fetchImpl = input.fetchImpl ?? globalThis.fetch;
    if (!fetchImpl)
        return blocked('gitlab-fetch-unavailable');
    const headers = { ...buildGitLabAuthHeaders({ token: input.token }), 'User-Agent': 'zj-loop-ci-sweeper' };
    const issueUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['issues', input.issueIid] });
    let issueResponse;
    try {
        issueResponse = await fetchImpl(issueUrl, { headers });
    }
    catch {
        return blocked('issue-read-failed');
    }
    if (!issueResponse.ok)
        return blocked('issue-read-failed', { http_status: issueResponse.status });
    const issue = await issueResponse.json();
    const parsed = parseIssueFixRequestComments([{ id: issue.iid ?? input.issueIid, body: String(issue.description ?? '') }])[0];
    const request = parsed?.validation.ok ? parsed.request : null;
    if (!request || request.request_id !== input.requestId || request.source_signal?.provider !== 'gitlab' || String(request.subject?.repo ?? '') !== input.projectPath || request.route_decision?.target_consumer !== 'ci-sweeper') {
        return blocked('request-source-mismatch', { request_id: request?.request_id ?? null });
    }
    const verifier = buildCiSweeperVerifierPlan({ request, route: input.route });
    const actionGate = buildCiSweeperRepairActionGate({ request, route: input.route, changedFiles: (request.repair_actions ?? []).map((item) => item.file_path ?? item.path).filter(Boolean) });
    if (verifier.status !== 'ready' || actionGate.status !== 'ready')
        return blocked('verifier-blocked', { verifier, action_gate: actionGate });
    const claim = await claimGitLabCiSweeperIssueFixRequest({ ...input, route: input.route, consumerId: 'ci-sweeper' });
    if (claim.status !== 'completed' || claim.outcome !== 'claimed')
        return blocked('claim-not-won', { claim });
    const running = await appendGitLabCiSweeperLifecycleEvidence({ ...input, status: 'running', evidence: { verifier: verifier.schema, action_gate: actionGate.schema } });
    if (running.status !== 'completed')
        return blocked('lifecycle-running-write-failed', { claim, lifecycle: running });
    const repairMr = await createGitLabCiSweeperRepairMr({ ...input, actions: request.repair_actions, apiBaseUrl: input.apiBaseUrl, fetchImpl });
    const finalStatus = repairMr.status === 'completed' ? 'completed' : 'failed';
    const lifecycle = await appendGitLabCiSweeperLifecycleEvidence({ ...input, status: finalStatus, evidence: { repair_mr: repairMr } });
    return { schema: 'zj-loop.gitlab_ci_sweeper_execution.v1', status: repairMr.status === 'completed' && lifecycle.status === 'completed' ? 'completed' : 'blocked', outcome: repairMr.outcome ?? null, audit, claim, repair_mr: repairMr, lifecycle };
}
function validateGitLabCommitActions(actions) {
    return actions.every((item) => {
        if (!item || !['create', 'update', 'delete', 'move', 'chmod'].includes(item.action))
            return false;
        if (!safeRepoPath(item.file_path) || (item.previous_path !== undefined && !safeRepoPath(item.previous_path)))
            return false;
        if (item.action === 'move' && !item.previous_path)
            return false;
        if (['create', 'update', 'move'].includes(item.action) && typeof item.content !== 'string')
            return false;
        if (item.encoding !== undefined && item.encoding !== 'base64')
            return false;
        if (item.action === 'chmod' && !['100644', '100755'].includes(String(item.execute_filemode ?? '')))
            return false;
        return true;
    });
}
function safeRepoPath(value) {
    const path = String(value ?? '').replaceAll('\\', '/');
    return Boolean(path && !path.startsWith('/') && !path.split('/').includes('..'));
}
async function postGitLabJson(fetchImpl, url, headers, payload) {
    try {
        return await fetchImpl(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }
    catch {
        return { ok: false, status: 0, json: async () => ({}), text: async () => '' };
    }
}
async function readGitLabResponseError(response) {
    if (typeof response.text !== 'function')
        return null;
    try {
        const raw = await response.text();
        if (!raw)
            return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'string')
            return parsed.slice(0, 300);
        if (parsed && typeof parsed === 'object') {
            const summary = parsed.message ?? parsed.error ?? parsed.errors;
            return typeof summary === 'string' ? summary.slice(0, 300) : summary ?? null;
        }
        return raw.slice(0, 300);
    }
    catch {
        return null;
    }
}
function summarizeGitLabCommitRequest(payload) {
    return {
        branch: String(payload.branch ?? ''),
        start_branch: payload.start_branch === undefined ? null : String(payload.start_branch),
        action_count: Array.isArray(payload.actions) ? payload.actions.length : 0,
        actions: Array.isArray(payload.actions)
            ? payload.actions.map((action) => ({
                action: String(action?.action ?? ''),
                file_path: String(action?.file_path ?? ''),
                content_bytes: typeof action?.content === 'string' ? Buffer.byteLength(action.content, 'utf8') : 0,
            }))
            : [],
    };
}
function completedRepairMrResult(audit, outcome, mergeRequest) {
    return {
        schema: 'zj-loop.gitlab_ci_sweeper_repair_mr.v1',
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
function isStructuredCommand(value) {
    return Boolean(value && typeof value.id === 'string' && value.id.trim() && typeof value.command === 'string' && value.command.trim() && Array.isArray(value.args) && value.args.every((arg) => typeof arg === 'string') && typeof value.cwd === 'string' && value.cwd.trim());
}
function sameCommand(left, right) {
    return left.id === right.id && left.command === right.command && left.cwd === right.cwd && JSON.stringify(left.args) === JSON.stringify(right.args);
}
function normalizeRepoPath(value) {
    const raw = String(value ?? '').replaceAll('\\', '/');
    if (!raw || raw.startsWith('/') || raw.split('/').includes('..'))
        return raw;
    return raw.replace(/^\.\//, '');
}
function normalizeScope(value) {
    const scope = normalizeRepoPath(value);
    return scope.endsWith('/') ? scope : `${scope}/`;
}
function parseCiSweeperClaim(note) {
    return parseGitLabLifecycleMarker(note, 'ci-sweeper-claim');
}
function claimDuplicateResult(audit, claim) {
    return { schema: 'zj-loop.gitlab_ci_sweeper_claim.v1', status: 'completed', outcome: 'duplicate', audit: { ...audit, request_id: claim.request_id }, claim };
}
function completedGitLabIssueFixRequest(input) {
    const iid = Number(input.issue.iid);
    return {
        schema: GITLAB_CI_SWEEPER_ISSUE_FIX_REQUEST_SCHEMA,
        status: 'completed',
        outcome: input.outcome,
        audit: input.audit,
        issue: {
            iid,
            url: String(input.issue.web_url ?? buildProviderIssueUrl({
                provider: 'gitlab',
                host: new URL(input.input.apiBaseUrl ?? 'https://gitlab.com/api/v4').host,
                projectPath: input.input.projectPath,
                issue: iid,
            })),
        },
    };
}
export function getCiSweeperPackageBuildPlan(packages) {
    return packages.map((releasePackage) => releasePackage.directory);
}
export async function buildCiSweeperRepairCommands(input = {}) {
    const root = input.root ?? '.';
    const packageDirectories = input.packageDirectories ?? [];
    const rootInstallCommand = input.rootInstallCommand === undefined ? ['npm', ['ci', '--ignore-scripts']] : input.rootInstallCommand;
    const rootCommands = input.rootCommands ?? [
        ['node', ['scripts/check-zj-loop-init-sync.mjs']],
        ['node', ['scripts/validate-release-workflows.mjs']],
    ];
    const commands = [];
    for (const directory of packageDirectories) {
        commands.push({ command: 'npm', args: ['ci'], cwd: directory });
        if (await packageHasScript(root, directory, 'build')) {
            commands.push({ command: 'npm', args: ['run', 'build'], cwd: directory });
        }
    }
    if (rootInstallCommand) {
        const [command, args] = rootInstallCommand;
        commands.push({ command, args });
    }
    for (const [command, args] of rootCommands) {
        commands.push({ command, args });
    }
    return commands;
}
export async function buildCiSweeperRepairPlan(input = {}) {
    const packageDirectories = input.packageDirectories ?? [];
    return {
        schema: 'zj-loop.ci_sweeper_repair_plan.v1',
        package_directories: packageDirectories,
        commands: await buildCiSweeperRepairCommands(input),
    };
}
export function formatCommandStep(step) {
    const command = [step.command, ...step.args].join(' ');
    return step.cwd ? `(cd ${step.cwd} && ${command})` : command;
}
async function packageHasScript(root, directory, scriptName) {
    const packageJsonPath = path.join(root, directory, 'package.json');
    const pkg = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    return Boolean(pkg.scripts?.[scriptName]);
}
function stableHash(value) {
    return createHash('sha256').update(value).digest('hex').slice(0, 12);
}
function ciSweeperFilesOrAreasFor(provider) {
    if (provider === 'gitlab') {
        return ['scripts/', '.gitlab-ci.yml', 'zj-loop/gitlab-ci/', 'zj-loop/'];
    }
    return ['scripts/', '.github/workflows/', 'zj-loop/'];
}
function ciProviderMetadata(input) {
    if (input.provider !== 'gitlab')
        return undefined;
    return {
        pipeline_id: input.runId || null,
        pipeline_url: input.sourceUrl || null,
    };
}
function providerFor(routeDecision, sourceUrl) {
    const explicit = routeDecision?.provider ?? routeDecision?.source_provider;
    if (explicit === 'gitlab')
        return 'gitlab';
    if (explicit === 'github')
        return 'github';
    const source = String(routeDecision?.source ?? '').toLowerCase();
    const url = String(sourceUrl ?? routeDecision?.source_url ?? '').toLowerCase();
    if (source.includes('gitlab') || url.includes('gitlab'))
        return 'gitlab';
    return 'github';
}
