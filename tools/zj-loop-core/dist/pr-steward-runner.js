import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { validateIssueFixRequest } from './issue-fix-request-contract.js';
import { buildLiveRunnerEvidence, validateLiveRunnerEvidence, } from './live-runner-contract.js';
const execFileAsync = promisify(execFile);
export const PR_STEWARD_RUNNER_ID = 'pr-steward';
export const PR_STEWARD_ROUTE_ID = 'pr-steward-fix-request';
export const PR_STEWARD_CONSUMER_KIND = 'fix-runner';
export const PR_STEWARD_CAPABILITY = 'pr-review-and-readiness-fix';
export const PR_STEWARD_CONFIRMATION_PHRASE = 'CREATE_PR_STEWARD_FIX_PR_OR_ESCALATION';
export async function defaultPrStewardRunner(command, args = []) {
    try {
        const result = await execFileAsync(command, args, {
            encoding: 'utf8',
            maxBuffer: 1024 * 1024 * 10,
        });
        return {
            command,
            args,
            exitCode: 0,
            stdout: result.stdout ?? '',
            stderr: result.stderr ?? '',
        };
    }
    catch (error) {
        const err = error;
        return {
            command,
            args,
            exitCode: Number.isInteger(err.code) ? Number(err.code) : 1,
            stdout: err.stdout ?? '',
            stderr: err.stderr ?? err.message ?? '',
        };
    }
}
export async function readPrStewardIssueFixRequest(path) {
    return JSON.parse(await readFile(path, 'utf8'));
}
export function validatePrStewardLiveRequest(input = {}) {
    const errors = [];
    const request = input.request;
    const baseValidation = validateIssueFixRequest(request);
    if (!baseValidation.ok)
        errors.push(...baseValidation.errors);
    if (request?.status !== 'consumed')
        errors.push(`status must be consumed, got ${request?.status ?? 'missing'}`);
    if (request?.lifecycle?.consumed_by !== PR_STEWARD_RUNNER_ID) {
        errors.push(`lifecycle.consumed_by must be ${PR_STEWARD_RUNNER_ID}`);
    }
    const provider = providerForRequest(request);
    const expectedSubjectType = provider === 'gitlab' ? 'merge_request' : 'pull_request';
    const expectedSource = provider === 'gitlab' ? 'merge_request' : 'pull_request';
    if (request?.subject?.type !== expectedSubjectType)
        errors.push(`subject.type must be ${expectedSubjectType}`);
    if (request?.subject?.base_branch !== 'main') {
        errors.push(`subject.base_branch must be main, got ${request?.subject?.base_branch ?? 'missing'}`);
    }
    if (provider === 'gitlab') {
        if (!request?.subject?.mr_iid)
            errors.push('subject.mr_iid is required');
    }
    else if (!request?.subject?.pr_number) {
        errors.push('subject.pr_number is required');
    }
    if (!request?.subject?.head_sha)
        errors.push('subject.head_sha is required');
    if (!input.currentPrHeadSha)
        errors.push('current_pr_head_sha is required before live execution');
    if (input.currentPrHeadSha && request?.subject?.head_sha !== input.currentPrHeadSha) {
        errors.push('current_pr_head_sha must match request subject head_sha');
    }
    if (request?.source_signal?.source !== expectedSource)
        errors.push(`source_signal.source must be ${expectedSource}`);
    if (request?.route_decision?.route_id !== PR_STEWARD_ROUTE_ID) {
        errors.push(`route_id must be ${PR_STEWARD_ROUTE_ID}`);
    }
    if (request?.route_decision?.target_consumer !== PR_STEWARD_RUNNER_ID) {
        errors.push(`target_consumer must be ${PR_STEWARD_RUNNER_ID}`);
    }
    if (request?.requested_consumer?.consumer_id !== PR_STEWARD_RUNNER_ID) {
        errors.push(`consumer must be ${PR_STEWARD_RUNNER_ID}`);
    }
    if (request?.requested_consumer?.capability !== PR_STEWARD_CAPABILITY) {
        errors.push(`capability must be ${PR_STEWARD_CAPABILITY}`);
    }
    if (!Array.isArray(request?.verification_gate?.commands) || request.verification_gate.commands.length === 0) {
        errors.push('verification gate is required before live execution');
    }
    return { ok: errors.length === 0, errors };
}
export function buildPrStewardExecutionPlan(input = {}) {
    const validation = validatePrStewardLiveRequest({
        request: input.request,
        currentPrHeadSha: input.currentPrHeadSha,
    });
    const subject = input.request?.subject ?? {};
    const provider = providerForRequest(input.request);
    const reviewNumber = provider === 'gitlab' ? subject.mr_iid : subject.pr_number;
    const reviewKind = provider === 'gitlab' ? 'merge-request' : 'pull-request';
    const branch = `automated/pr-steward-${provider === 'gitlab' ? 'mr' : 'pr'}-${reviewNumber ?? 'unknown'}-${shortHash(input.request?.dedupe_key ?? '')}`;
    const parsedRepairCommands = (input.repairCommands ?? []).map(parseCommand);
    const parsedVerificationCommands = (input.request?.verification_gate?.commands ?? []).map(parseCommand);
    const normalizedRepairFiles = normalizeRepairFiles(input.repairFiles ?? []);
    const refusals = [
        ...validation.errors.map((reason) => ({ layer: 'request', reason })),
    ];
    if (String(input.gitStatus ?? '').trim() !== '') {
        refusals.push({ layer: 'workspace', reason: 'working-tree-must-be-clean-before-live-execution' });
    }
    if (input.live && input.confirmationPhrase !== PR_STEWARD_CONFIRMATION_PHRASE) {
        refusals.push({ layer: 'operator', reason: 'fixed confirmation phrase is required for live execution' });
    }
    if (parsedRepairCommands.length > 0 && normalizedRepairFiles.length === 0) {
        refusals.push({ layer: 'repair-plan', reason: 'repair_files are required when repair_commands are provided' });
    }
    if (input.live && provider === 'gitlab') {
        refusals.push({ layer: 'provider', reason: 'gitlab-live-review-side-effects-not-enabled' });
    }
    const executable = refusals.length === 0;
    const completionMode = parsedRepairCommands.length > 0 ? 'repair-pr' : 'escalation-issue';
    return {
        schemaVersion: 1,
        kind: 'zj-loop.pr-steward-live-runner-plan',
        runner_id: PR_STEWARD_RUNNER_ID,
        route_id: PR_STEWARD_ROUTE_ID,
        mode: input.live ? 'live' : 'dry-run',
        status: executable ? (input.live ? 'ready-for-live-execution' : 'dry-run') : 'refused',
        completion_mode: completionMode,
        created_at: input.createdAt ?? new Date().toISOString(),
        request_id: input.request?.request_id ?? '',
        dedupe_key: input.request?.dedupe_key ?? '',
        source_review: {
            provider,
            kind: reviewKind,
            repo: subject.repo ?? '',
            number: reviewNumber ?? null,
            head_sha: subject.head_sha ?? '',
            current_head_sha: input.currentPrHeadSha ?? '',
            base_branch: subject.base_branch ?? '',
            source_url: input.request?.source_signal?.source_url ?? '',
        },
        source_pr: provider === 'github'
            ? {
                repo: subject.repo ?? '',
                pr_number: subject.pr_number ?? null,
                head_sha: subject.head_sha ?? '',
                current_head_sha: input.currentPrHeadSha ?? '',
                base_branch: subject.base_branch ?? '',
                source_url: input.request?.source_signal?.source_url ?? '',
            }
            : null,
        branch,
        repair_files: normalizedRepairFiles,
        refusals,
        actions: executable
            ? buildActions({
                planMode: completionMode,
                branch,
                repairCommands: parsedRepairCommands,
                verificationCommands: parsedVerificationCommands,
                repairFiles: normalizedRepairFiles,
                request: input.request,
            })
            : [],
    };
}
export async function executePrStewardLiveRunner(plan, { runner = defaultPrStewardRunner } = {}) {
    if (plan.status !== 'ready-for-live-execution') {
        return buildExecutionResult({
            plan,
            completionForm: 'escalation-issue',
            status: 'escalated',
            steps: [],
            sideEffectsExecuted: false,
            verifierEvidence: [{ name: 'plan-validation', status: 'failed', errors: plan.refusals.map((item) => item.reason) }],
            escalation: {
                reason: 'plan-not-ready-for-live-execution',
                issue_url: '',
            },
        });
    }
    const steps = [];
    for (const action of plan.actions) {
        const result = await runner(action.command, action.args);
        steps.push({ name: action.name, ...result });
        const expectedExitCodes = action.expectedExitCodes ?? [0];
        if (!expectedExitCodes.includes(result.exitCode)) {
            return buildExecutionResult({
                plan,
                completionForm: 'escalation-issue',
                status: 'escalated',
                steps,
                sideEffectsExecuted: true,
                verifierEvidence: verifierEvidenceFromSteps(steps),
                escalation: {
                    reason: `${action.name} failed`,
                    issue_url: action.name === 'create-escalation-issue' ? extractFirstUrl(result.stdout) : '',
                },
            });
        }
    }
    if (plan.completion_mode === 'escalation-issue') {
        const issueStep = steps.find((step) => step.name === 'create-escalation-issue');
        return buildExecutionResult({
            plan,
            completionForm: 'escalation-issue',
            status: 'escalated',
            steps,
            sideEffectsExecuted: true,
            verifierEvidence: verifierEvidenceFromSteps(steps),
            escalation: {
                reason: 'no deterministic repair plan was provided',
                issue_url: extractFirstUrl(issueStep?.stdout) || 'created-by-gh-issue-create',
            },
        });
    }
    const prStep = steps.find((step) => step.name === 'create-repair-pr');
    return buildExecutionResult({
        plan,
        completionForm: 'repair-pr',
        status: 'completed',
        steps,
        sideEffectsExecuted: true,
        verifierEvidence: verifierEvidenceFromSteps(steps),
        repairPullRequest: {
            branch: plan.branch,
            url: extractFirstUrl(prStep?.stdout) || 'created-by-gh-pr-create',
        },
    });
}
function buildActions(input) {
    const sourceReview = sourceReviewDescriptor(input.request);
    if (input.planMode === 'escalation-issue') {
        return [{
                name: 'create-escalation-issue',
                command: 'gh',
                args: [
                    'issue',
                    'create',
                    '--title',
                    `PR Steward escalation for ${sourceReview.shortLabel}`,
                    '--body',
                    buildEscalationIssueBody(input.request),
                ],
            }];
    }
    return [
        { name: 'fetch-origin', command: 'git', args: ['fetch', 'origin'] },
        { name: 'switch-main', command: 'git', args: ['switch', 'main'] },
        { name: 'sync-main', command: 'git', args: ['merge', '--ff-only', 'origin/main'] },
        { name: 'create-branch', command: 'git', args: ['switch', '-c', input.branch] },
        ...input.repairCommands.map((command, index) => ({ name: `repair-${index + 1}`, ...command })),
        ...input.verificationCommands.map((command, index) => ({ name: `verify-${index + 1}`, ...command })),
        {
            name: 'require-repair-diff',
            command: 'git',
            args: ['diff', '--quiet', '--', ...input.repairFiles],
            expectedExitCodes: [1],
        },
        { name: 'stage-repair-files', command: 'git', args: ['add', ...input.repairFiles] },
        {
            name: 'commit-repair',
            command: 'git',
            args: ['commit', '-m', `Create PR Steward repair for ${sourceReview.shortLabel}`],
        },
        { name: 'push-branch', command: 'git', args: ['push', '-u', 'origin', input.branch] },
        {
            name: 'create-repair-pr',
            command: 'gh',
            args: [
                'pr',
                'create',
                '--base',
                'main',
                '--head',
                input.branch,
                '--title',
                `PR Steward repair for ${sourceReview.shortLabel}`,
                '--body',
                buildRepairPrBody({ request: input.request, repairFiles: input.repairFiles }),
            ],
        },
    ];
}
function buildExecutionResult(input) {
    const evidence = buildLiveRunnerEvidence({
        runner_id: PR_STEWARD_RUNNER_ID,
        route_id: PR_STEWARD_ROUTE_ID,
        consumer_kind: PR_STEWARD_CONSUMER_KIND,
        execution_mode: input.plan.mode,
        completion_form: input.completionForm,
        status: input.status,
        dedupe_key: input.plan.dedupe_key,
        created_at: input.plan.created_at,
        source: {
            kind: 'issue-fix-request',
            id: input.plan.request_id,
        },
        verifier_evidence: input.verifierEvidence,
        side_effects: {
            executed: input.sideEffectsExecuted,
            level: input.completionForm === 'repair-pr' ? 'pr' : 'issue-comment',
            actions: input.steps.map((step) => ({
                name: step.name,
                command: [step.command, ...(step.args ?? [])].join(' '),
                exit_code: step.exitCode,
            })),
        },
        source_pr_side_effects: {
            comment_created: false,
            label_changed: false,
            rebased: false,
            merged: false,
            workflow_dispatched: false,
        },
        repair_pull_request: input.repairPullRequest ?? null,
        escalation: input.escalation ?? null,
    });
    const validation = validateLiveRunnerEvidence(evidence);
    if (!validation.ok) {
        throw new Error(`invalid PR Steward live runner evidence: ${validation.errors.join(', ')}`);
    }
    return {
        schemaVersion: 1,
        kind: 'zj-loop.pr-steward-live-runner-result',
        outcome: input.completionForm,
        plan: input.plan,
        steps: input.steps,
        runner_evidence: evidence,
    };
}
function verifierEvidenceFromSteps(steps) {
    const verifierSteps = steps.filter((step) => step.name.startsWith('verify-'));
    if (verifierSteps.length === 0) {
        return [{ name: 'verification-gate', status: 'not-run', reason: 'repair did not reach verifier gate' }];
    }
    return verifierSteps.map((step) => ({
        name: step.name,
        command: [step.command, ...(step.args ?? [])].join(' '),
        status: step.exitCode === 0 ? 'passed' : 'failed',
        exit_code: step.exitCode,
    }));
}
function buildRepairPrBody(input) {
    const sourceReview = sourceReviewDescriptor(input.request);
    return [
        '## Summary',
        '',
        `- Create an independent repair PR for source ${sourceReview.longLabel}.`,
        `- Source head SHA verified before execution: ${input.request?.subject?.head_sha ?? ''}.`,
        `- Source Issue Fix Request: ${input.request?.request_id ?? 'unknown'}.`,
        '',
        '## Repair Files',
        '',
        ...input.repairFiles.map((file) => `- ${file}`),
        '',
        '## Verification',
        '',
        ...(input.request?.verification_gate?.commands ?? []).map((command) => `- ${command}`),
        '',
        '## Safety',
        '',
        `- This runner does not comment on, label, rebase, merge, or dispatch workflows for the source ${sourceReview.kindName}.`,
        '- Auto-merge is disabled.',
    ].join('\n');
}
function buildEscalationIssueBody(request) {
    const sourceReview = sourceReviewDescriptor(request);
    return [
        '## Summary',
        '',
        `PR Steward could not produce a deterministic repair PR for source ${sourceReview.longLabel}.`,
        '',
        `Source ${sourceReview.kindName}: ${request?.source_signal?.source_url ?? ''}`,
        `Source head SHA: ${request?.subject?.head_sha ?? ''}`,
        `Issue Fix Request: ${request?.request_id ?? 'unknown'}`,
        '',
        '## Required Next Step',
        '',
        'A maintainer or bounded repair agent must provide an explicit repair plan, or resolve the source PR manually.',
    ].join('\n');
}
function parseCommand(commandText) {
    const parts = String(commandText ?? '').trim().split(/\s+/).filter(Boolean);
    return {
        command: parts[0] ?? '',
        args: parts.slice(1),
    };
}
function normalizeRepairFiles(files) {
    return [...new Set((Array.isArray(files) ? files : [])
            .map((file) => String(file).trim())
            .filter((file) => file && !file.startsWith('zj-loop/') && !file.includes('..')))];
}
function shortHash(value) {
    let hash = 0;
    for (const character of String(value)) {
        hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
    }
    return Math.abs(hash).toString(36).slice(0, 8);
}
function extractFirstUrl(text) {
    return String(text ?? '').match(/https?:\/\/\S+/)?.[0] ?? '';
}
function providerForRequest(request) {
    const provider = request?.subject?.provider ?? request?.source_signal?.provider;
    return provider === 'gitlab' ? 'gitlab' : 'github';
}
function sourceReviewDescriptor(request) {
    const provider = providerForRequest(request);
    const number = provider === 'gitlab' ? request?.subject?.mr_iid : request?.subject?.pr_number;
    const kindName = provider === 'gitlab' ? 'MR' : 'PR';
    const shortLabel = `${kindName} #${number ?? 'unknown'}`;
    return {
        kindName,
        shortLabel,
        longLabel: shortLabel,
    };
}
