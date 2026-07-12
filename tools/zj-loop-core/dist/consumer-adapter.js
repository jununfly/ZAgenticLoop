import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildRoadmapActivationBranchName, buildRoadmapActivationPrContract, buildRoadmapActivationPrTitle, buildRoadmapActivationReviewContract, buildRoadmapActivationReviewTitle, executeGitLabRoadmapActivation, } from './roadmap-activation-runner.js';
export async function runConsumerLiveSideEffects(input) {
    const current = input.envelope.consumer_adapter_result;
    if (!current) {
        return liveHardStop({
            input: {
                consumerRunPlan: input.envelope.consumer_run_plan,
            },
            reason: 'missing-consumer-adapter-result',
            nextSteps: ['Run auto mode first so the orchestration contains a ConsumerAdapter review artifact.'],
        });
    }
    const artifact = current.review_artifacts.find((item) => item.kind === 'contract-plan');
    if (!artifact?.path) {
        return {
            ...current,
            adapter_status: 'hard_stopped',
            live_side_effects: {
                attempted: false,
                reason: 'missing-contract-plan-review-artifact',
            },
            stop_signal: {
                reason: 'missing-contract-plan-review-artifact',
                next_steps: ['Run auto mode first so the orchestration contains contract-plan.json.'],
            },
        };
    }
    const contractPlan = JSON.parse(await readFile(path.resolve(input.root, artifact.path), 'utf8'));
    const liveSideEffects = await executeRoadmapActivationLiveSideEffects({
        signal: input.signal,
        contractPlan,
        env: input.env,
        fetchImpl: input.fetchImpl,
    });
    const adapterStatus = liveSideEffects.status === 'failed' || liveSideEffects.status === 'refused'
        ? 'hard_stopped'
        : 'executed_to_review_artifact';
    return {
        ...current,
        adapter_status: adapterStatus,
        live_side_effects: liveSideEffects,
        stop_signal: adapterStatus === 'hard_stopped'
            ? {
                reason: String(liveSideEffects.status ?? 'live-side-effect-failed'),
                next_steps: ['Inspect consumer_adapter_result.live_side_effects.refusals or provider_result before retrying.'],
            }
            : current.stop_signal,
    };
}
export async function executeRoadmapActivationLiveSideEffects(input) {
    if (input.contractPlan?.provider === 'github') {
        return executeGitHubRoadmapActivation(input);
    }
    if (input.contractPlan?.provider === 'gitlab') {
        const result = await executeGitLabRoadmapActivation({
            contractPlan: input.contractPlan,
            projectPath: stringPayload(input.signal.payload.project_path) ?? input.env?.CI_PROJECT_PATH,
            targetBranch: stringPayload(input.signal.payload.target_branch) ?? input.env?.CI_DEFAULT_BRANCH,
            apiBaseUrl: stringPayload(input.signal.payload.gitlab_api_url) ?? input.env?.CI_API_V4_URL,
            token: input.env?.GITLAB_TOKEN,
            jobToken: input.env?.CI_JOB_TOKEN,
            live: true,
            fetchImpl: input.fetchImpl,
        });
        return normalizeGitLabRoadmapActivationResult(result);
    }
    return {
        attempted: false,
        reason: 'unsupported-roadmap-activation-provider',
        execution_scope: 'external_tool',
        side_effect_level: 'branch_pr',
        status: 'refused',
        refusals: [{ layer: 'provider', reason: 'unsupported-roadmap-activation-provider' }],
    };
}
export async function runConsumerToReviewArtifact(input) {
    const routeId = input.consumerRunPlan.route_decision.route;
    if (routeId === 'roadmap-sliced-development') {
        return runRoadmapActivationToContractPlan(input);
    }
    return {
        schema: 'zj-loop.consumer_adapter_result.v1',
        route_id: routeId,
        consumer: input.consumerRunPlan.consumer,
        consumer_kind: input.consumerRunPlan.consumer_kind,
        adapter_status: 'hard_stopped',
        review_artifacts: [],
        repairs_applied: [],
        live_side_effects: {
            attempted: false,
            reason: 'no review-artifact adapter registered for this route',
        },
        next_steps: ['Add an explicit ConsumerAdapter for this route before executing it.'],
        stop_signal: {
            reason: 'missing-consumer-adapter',
            next_steps: ['Add an explicit ConsumerAdapter for this route before executing it.'],
        },
    };
}
async function runRoadmapActivationToContractPlan(input) {
    const repairsApplied = [];
    const activationRequestId = stringPayload(input.signal.payload.activation_request_id)
        ?? repairFromSignalId(input.signal.signal_id, repairsApplied);
    const sourceIssueUrl = input.signal.subject.url
        ?? deriveSourceIssueUrl(input.signal, repairsApplied);
    const sourceCommentUrl = stringPayload(input.signal.payload.source_comment_url)
        ?? stringPayload(input.signal.payload.activation_request_comment_url);
    if (!sourceIssueUrl) {
        return hardStopResult({
            input,
            reason: 'missing-source-issue-url',
            nextSteps: ['Provide subject.url or enough provider repository metadata to build a source issue URL.'],
            repairsApplied,
        });
    }
    if (!sourceCommentUrl) {
        return hardStopResult({
            input,
            reason: 'missing-activation-request-comment-url',
            nextSteps: ['Provide payload.activation_request_comment_url or payload.source_comment_url for replayable activation evidence.'],
            repairsApplied,
        });
    }
    const provider = input.signal.provider === 'gitlab' ? 'gitlab' : 'github';
    const title = stringPayload(input.signal.payload.title);
    const sourceIssue = input.signal.subject.kind === 'issue' ? input.signal.subject.id : undefined;
    const branchName = buildRoadmapActivationBranchName({ activationRequestId, title, sourceIssue });
    const reviewTitle = buildRoadmapActivationReviewTitle({ provider, title, sourceIssue });
    const processRoadmapPath = stringPayload(input.signal.payload.process_roadmap_path)
        ?? stringPayload(input.signal.payload.processRoadmapPath)
        ?? '';
    const reviewContract = buildReviewContract({
        provider,
        activationRequestId,
        sourceIssueUrl,
        sourceCommentUrl,
        branchName,
        sourceIssue,
        processRoadmapPath,
    });
    const contractPlan = {
        schema: 'zj-loop.roadmap_activation_contract_plan.v1',
        provider,
        reviewKind: provider === 'gitlab' ? 'merge-request' : 'pull-request',
        activationRequestId,
        branchName,
        reviewTitle,
        prTitle: provider === 'github' ? buildRoadmapActivationPrTitle({ title, sourceIssue }) : undefined,
        lifecycleState: 'requested',
        reviewContract,
        prContract: provider === 'github' ? reviewContract : undefined,
        mrTitle: provider === 'gitlab' ? reviewTitle : undefined,
        mrContract: provider === 'gitlab' ? reviewContract : undefined,
        nextSteps: [
            'Create or update the roadmap branch from the current base branch.',
            provider === 'gitlab'
                ? 'Open or update the Roadmap Activation MR with the contract block.'
                : 'Open or update the Roadmap Activation PR with the contract block.',
            'Start Roadmap-Sliced Consumer execution from the Activation Request scope.',
        ],
    };
    const artifactPath = `zj-loop/orchestrations/${input.orchestrationId}/contract-plan.json`;
    const absoluteArtifactPath = path.resolve(input.root, artifactPath);
    await mkdir(path.dirname(absoluteArtifactPath), { recursive: true });
    await writeFile(absoluteArtifactPath, `${JSON.stringify(contractPlan, null, 2)}\n`);
    return {
        schema: 'zj-loop.consumer_adapter_result.v1',
        route_id: 'roadmap-sliced-development',
        consumer: input.consumerRunPlan.consumer,
        consumer_kind: input.consumerRunPlan.consumer_kind,
        adapter_status: 'executed_to_review_artifact',
        review_artifacts: [{
                path: artifactPath,
                kind: 'contract-plan',
                schema: 'zj-loop.roadmap_activation_contract_plan.v1',
            }],
        repairs_applied: repairsApplied,
        live_side_effects: {
            attempted: false,
            reason: 'review-artifact runner only',
        },
        next_steps: contractPlan.nextSteps,
    };
}
function buildReviewContract(input) {
    const closeoutContract = {
        activationCarrierIssue: input.sourceIssue,
        processRoadmapPath: input.processRoadmapPath,
    };
    if (input.provider === 'github') {
        return buildRoadmapActivationPrContract({
            activationRequestId: input.activationRequestId,
            sourceIssueUrl: input.sourceIssueUrl,
            sourceCommentUrl: input.sourceCommentUrl,
            branchName: input.branchName,
            lifecycleState: 'requested',
            closeoutContract,
        });
    }
    return buildRoadmapActivationReviewContract({
        provider: input.provider,
        activationRequestId: input.activationRequestId,
        sourceIssueUrl: input.sourceIssueUrl,
        sourceCommentUrl: input.sourceCommentUrl,
        branchName: input.branchName,
        lifecycleState: 'requested',
        closeoutContract,
    });
}
function hardStopResult(input) {
    return {
        schema: 'zj-loop.consumer_adapter_result.v1',
        route_id: 'roadmap-sliced-development',
        consumer: input.input.consumerRunPlan.consumer,
        consumer_kind: input.input.consumerRunPlan.consumer_kind,
        adapter_status: 'hard_stopped',
        review_artifacts: [],
        repairs_applied: input.repairsApplied,
        live_side_effects: {
            attempted: false,
            reason: 'hard stop before live side effects',
        },
        next_steps: input.nextSteps,
        stop_signal: {
            reason: input.reason,
            next_steps: input.nextSteps,
        },
    };
}
function stringPayload(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
function repairFromSignalId(signalId, repairsApplied) {
    repairsApplied.push({
        field: 'activation_request_id',
        value: signalId,
        reason: 'payload.activation_request_id missing; reused signal_id as stable activation request id',
    });
    return signalId;
}
function deriveSourceIssueUrl(signal, repairsApplied) {
    if (signal.subject.kind !== 'issue')
        return undefined;
    const repository = stringPayload(signal.payload.repository);
    if (signal.provider === 'github' && repository) {
        const value = `https://github.com/${repository}/issues/${encodeURIComponent(signal.subject.id)}`;
        repairsApplied.push({
            field: 'source_issue_url',
            value,
            reason: 'subject.url missing; derived GitHub issue URL from payload.repository and subject.id',
        });
        return value;
    }
    const projectUrl = stringPayload(signal.payload.project_url);
    if (signal.provider === 'gitlab' && projectUrl) {
        const value = `${projectUrl.replace(/\/$/, '')}/-/issues/${encodeURIComponent(signal.subject.id)}`;
        repairsApplied.push({
            field: 'source_issue_url',
            value,
            reason: 'subject.url missing; derived GitLab issue URL from payload.project_url and subject.id',
        });
        return value;
    }
    return undefined;
}
async function executeGitHubRoadmapActivation(input) {
    const plan = input.contractPlan ?? {};
    const repository = stringPayload(input.signal.payload.repository)
        ?? stringPayload(plan.repository)
        ?? input.env?.GITHUB_REPOSITORY
        ?? '';
    const targetBranch = stringPayload(input.signal.payload.target_branch)
        ?? stringPayload(plan.targetBranch)
        ?? stringPayload(plan.target_branch)
        ?? input.env?.GITHUB_REF_NAME
        ?? '';
    const token = input.env?.GITHUB_TOKEN ?? '';
    const branchName = String(plan.branchName ?? '');
    const refusals = [];
    if (plan.schema !== 'zj-loop.roadmap_activation_contract_plan.v1') {
        refusals.push({ layer: 'contract', reason: 'invalid-contract-plan-schema' });
    }
    if (plan.provider !== 'github')
        refusals.push({ layer: 'provider', reason: 'contract-plan-provider-is-not-github' });
    if (!repository || !repository.includes('/'))
        refusals.push({ layer: 'repository', reason: 'github-repository-required' });
    if (!targetBranch)
        refusals.push({ layer: 'target_branch', reason: 'target-branch-required' });
    if (!branchName.startsWith('zjal-'))
        refusals.push({ layer: 'branch', reason: 'branch-prefix-must-be-zjal-' });
    if (!token)
        refusals.push({ layer: 'credential', reason: 'github-token-required-for-live-execution' });
    const base = {
        attempted: refusals.length === 0,
        execution_scope: 'external_tool',
        external_tool: 'github',
        side_effect_level: 'branch_pr',
        idempotency_key: `roadmap-sliced-development:${branchName}`,
        branch: {
            name: branchName,
            target: targetBranch,
        },
        operations: [
            { kind: 'find-target-branch-ref', branch: targetBranch },
            { kind: 'find-or-create-branch-ref', branch: branchName },
            { kind: 'find-or-create-pull-request', branch: branchName },
        ],
        provider_result: {
            provider: 'github',
            repository,
        },
    };
    if (refusals.length > 0) {
        return {
            ...base,
            attempted: false,
            status: 'refused',
            reason: 'github-roadmap-activation-live-gates-refused',
            refusals,
        };
    }
    const [owner] = repository.split('/');
    const apiBaseUrl = String(input.env?.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/+$/, '');
    const fetcher = input.fetchImpl ?? fetch;
    const headers = {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
    };
    const operations = [];
    const targetRefUrl = `${apiBaseUrl}/repos/${repository}/git/ref/heads/${encodeURIComponent(targetBranch)}`;
    const targetRef = await fetcher(targetRefUrl, { headers });
    const targetBody = targetRef.ok ? await targetRef.json() : {};
    operations.push({ kind: 'find-target-branch-ref', status: targetRef.status, branch: targetBranch });
    const targetSha = targetBody?.object?.sha;
    if (!targetRef.ok || !targetSha) {
        return {
            ...base,
            attempted: true,
            status: 'failed',
            reason: 'github-target-branch-ref-not-found',
            operations,
            provider_result: { provider: 'github', repository, target_ref_status: targetRef.status },
        };
    }
    const branchRefUrl = `${apiBaseUrl}/repos/${repository}/git/ref/heads/${encodeURIComponent(branchName)}`;
    const branchRef = await fetcher(branchRefUrl, { headers });
    if (branchRef.status === 404) {
        const createBranch = await fetcher(`${apiBaseUrl}/repos/${repository}/git/refs`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: targetSha }),
        });
        operations.push({ kind: 'create-branch-ref', status: createBranch.status, branch: branchName });
        if (!createBranch.ok) {
            return {
                ...base,
                attempted: true,
                status: 'failed',
                reason: 'github-create-branch-ref-failed',
                operations,
                provider_result: { provider: 'github', repository, branch_ref_status: createBranch.status },
            };
        }
    }
    else {
        operations.push({ kind: 'find-branch-ref', status: branchRef.status, branch: branchName });
        if (!branchRef.ok) {
            return {
                ...base,
                attempted: true,
                status: 'failed',
                reason: 'github-find-branch-ref-failed',
                operations,
                provider_result: { provider: 'github', repository, branch_ref_status: branchRef.status },
            };
        }
    }
    const query = new URLSearchParams({ state: 'open', head: `${owner}:${branchName}` }).toString();
    const existingPrs = await fetcher(`${apiBaseUrl}/repos/${repository}/pulls?${query}`, { headers });
    const prs = existingPrs.ok ? await existingPrs.json() : [];
    operations.push({ kind: 'find-pull-request', status: existingPrs.status, count: Array.isArray(prs) ? prs.length : 0 });
    if (!existingPrs.ok) {
        return {
            ...base,
            attempted: true,
            status: 'failed',
            reason: 'github-find-pull-request-failed',
            operations,
            provider_result: { provider: 'github', repository, pulls_status: existingPrs.status },
        };
    }
    const title = String(plan.prTitle ?? plan.reviewTitle ?? `Roadmap Activation: ${branchName}`);
    const body = String(plan.prContract ?? plan.reviewContract ?? '');
    if (Array.isArray(prs) && prs[0]?.number) {
        const update = await fetcher(`${apiBaseUrl}/repos/${repository}/pulls/${prs[0].number}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ title, body }),
        });
        operations.push({ kind: 'update-pull-request', status: update.status, number: prs[0].number });
        return {
            ...base,
            attempted: true,
            status: update.ok ? 'completed' : 'failed',
            review: {
                kind: 'pull-request',
                number: prs[0].number,
                url: prs[0].html_url ?? '',
            },
            operations,
            provider_result: { provider: 'github', repository, pull_request_status: update.status },
        };
    }
    const createPr = await fetcher(`${apiBaseUrl}/repos/${repository}/pulls`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title, head: branchName, base: targetBranch, body, draft: true }),
    });
    const created = createPr.ok ? await createPr.json() : {};
    operations.push({ kind: 'create-pull-request', status: createPr.status, number: created.number ?? null });
    return {
        ...base,
        attempted: true,
        status: createPr.ok ? 'completed' : 'failed',
        review: {
            kind: 'pull-request',
            number: created.number ?? null,
            url: created.html_url ?? '',
        },
        operations,
        provider_result: { provider: 'github', repository, pull_request_status: createPr.status },
    };
}
function normalizeGitLabRoadmapActivationResult(result) {
    const status = result.status === 'completed'
        ? 'completed'
        : result.status === 'dry-run'
            ? 'dry-run'
            : result.status === 'refused'
                ? 'refused'
                : 'failed';
    return {
        attempted: result.execution_allowed === true,
        execution_scope: 'external_tool',
        external_tool: 'gitlab',
        side_effect_level: 'branch_pr',
        status,
        idempotency_key: `roadmap-sliced-development:${String(result.branch_name ?? '')}`,
        review: {
            kind: 'merge-request',
            number: result.merge_request_iid ?? null,
            url: result.merge_request_url ?? '',
        },
        branch: {
            name: String(result.branch_name ?? ''),
            target: String(result.target_branch ?? ''),
        },
        operations: Array.isArray(result.live_operations) ? result.live_operations : result.operations ?? [],
        refusals: Array.isArray(result.refusals) ? result.refusals : [],
        provider_result: result,
        ...(status === 'refused' ? { reason: 'gitlab-roadmap-activation-live-gates-refused' } : {}),
    };
}
function liveHardStop(input) {
    return {
        schema: 'zj-loop.consumer_adapter_result.v1',
        route_id: 'roadmap-sliced-development',
        consumer: input.input.consumerRunPlan?.consumer ?? 'roadmap-activation',
        consumer_kind: input.input.consumerRunPlan?.consumer_kind ?? 'activation-consumer',
        adapter_status: 'hard_stopped',
        review_artifacts: [],
        repairs_applied: [],
        live_side_effects: {
            attempted: false,
            reason: input.reason,
        },
        next_steps: input.nextSteps,
        stop_signal: {
            reason: input.reason,
            next_steps: input.nextSteps,
        },
    };
}
