import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { promisify } from 'node:util';
const COMMIT = /^[0-9a-f]{40}$/i;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const execFile = promisify(execFileCallback);
export const REAL_AGENT_DOGFOOD_GRAPH_ORCHESTRATOR_SCHEMA = 'zj-loop.real_agent_dogfood_graph_orchestrator.v1';
export const REAL_AGENT_DOGFOOD_GRAPH_PHASES = [
    'source_execution',
    'scope_observation',
    'independent_verification',
    'human_acceptance',
    'merge',
    'post_merge_gate',
    'cleanup',
];
function canonical(value) {
    const result = canonicalize(value);
    if (typeof result !== 'string')
        throw new Error('graph-orchestrator-canonicalization-invalid');
    return result;
}
function digest(value) { return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`; }
function absolute(value) { return typeof value === 'string' && value.startsWith('/') && !value.includes('\0'); }
export function createRealAgentDogfoodGraphPlan(input) {
    if (!input || !input.dogfood_id || !input.execution_id || !Number.isInteger(input.attempt) || input.attempt < 1 || !input.goal.trim() || !absolute(input.repo_root) || !COMMIT.test(input.baseline_commit) || !absolute(input.target_worktree) || !absolute(input.source_worktree) || !absolute(input.verifier_worktree) || !absolute(input.evidence_store) || !Array.isArray(input.allowed_files) || input.allowed_files.length !== 1 || input.allowed_files.some((file) => !file || file.startsWith('/') || file.includes('..') || file.includes('\0')) || input.execution_mode !== 'write-enabled' || input.network_policy !== 'network-allowed')
        throw new Error('graph-orchestrator-plan-invalid');
    const unsigned = {
        schema: REAL_AGENT_DOGFOOD_GRAPH_ORCHESTRATOR_SCHEMA,
        dogfood_id: input.dogfood_id,
        execution_id: input.execution_id,
        attempt: input.attempt,
        goal: input.goal,
        repo_root: input.repo_root,
        baseline_commit: input.baseline_commit,
        target_worktree: input.target_worktree,
        source_worktree: input.source_worktree,
        verifier_worktree: input.verifier_worktree,
        evidence_store: input.evidence_store,
        allowed_files: [...input.allowed_files],
        execution_mode: input.execution_mode,
        network_policy: input.network_policy,
    };
    return Object.freeze({ ...unsigned, plan_digest: digest(unsigned) });
}
async function git(cwd, args) {
    const result = await execFile('git', args, { cwd, maxBuffer: 1024 * 1024 });
    return result.stdout.trim();
}
export async function validateRealAgentDogfoodGraphWorktrees(input) {
    try {
        const [targetHead, sourceHead, targetStatus, sourceStatus, targetBranch, sourceBranch, verifierEntries] = await Promise.all([
            git(input.plan.target_worktree, ['rev-parse', 'HEAD']),
            git(input.plan.source_worktree, ['rev-parse', 'HEAD']),
            git(input.plan.target_worktree, ['status', '--porcelain', '--untracked-files=all']),
            git(input.plan.source_worktree, ['status', '--porcelain', '--untracked-files=all']),
            git(input.plan.target_worktree, ['branch', '--show-current']),
            git(input.plan.source_worktree, ['branch', '--show-current']),
            readdir(input.plan.verifier_worktree),
        ]);
        if (targetHead !== input.plan.baseline_commit || sourceHead !== input.plan.baseline_commit)
            return { status: 'blocked', reason: 'graph-worktree-baseline-drift' };
        if (targetStatus || sourceStatus)
            return { status: 'blocked', reason: 'graph-worktree-dirty' };
        if (!targetBranch || !sourceBranch || targetBranch === sourceBranch)
            return { status: 'blocked', reason: 'graph-worktree-branch-binding-invalid' };
        if (verifierEntries.length > 0)
            return { status: 'blocked', reason: 'graph-verifier-root-not-empty' };
        return { status: 'valid', source_branch: sourceBranch };
    }
    catch {
        return { status: 'blocked', reason: 'graph-worktree-observation-uncertain' };
    }
}
function validateCompletedPhases(completed) {
    if (!Array.isArray(completed))
        throw new Error('graph-orchestrator-completed-phases-invalid');
    const phases = completed;
    if (phases.some((phase, index) => phase !== REAL_AGENT_DOGFOOD_GRAPH_PHASES[index]))
        throw new Error('graph-orchestrator-completed-phases-invalid');
    return [...phases];
}
function failedStageResult(input, completed, currentPhase) {
    return {
        status: input.status,
        completed_phases: completed,
        current_phase: currentPhase,
        ...(input.reason ? { reason: input.reason } : {}),
        side_effects_executed: completed.includes('merge'),
    };
}
export async function advanceRealAgentDogfoodGraph(input) {
    const completed = validateCompletedPhases(input.completed_phases ?? []);
    if (completed.length === REAL_AGENT_DOGFOOD_GRAPH_PHASES.length)
        return { status: 'closed', completed_phases: completed, side_effects_executed: true };
    const phase = REAL_AGENT_DOGFOOD_GRAPH_PHASES[completed.length];
    let result;
    try {
        result = await input[phase]();
    }
    catch {
        result = { status: 'outcome-uncertain', reason: `${phase.replaceAll('_', '-')}-outcome-uncertain` };
    }
    if (result.status !== 'passed')
        return failedStageResult(result, completed, phase);
    const nextCompleted = [...completed, phase];
    const nextPhase = REAL_AGENT_DOGFOOD_GRAPH_PHASES[nextCompleted.length];
    return nextPhase
        ? { status: 'in-progress', completed_phases: nextCompleted, current_phase: phase, next_phase: nextPhase, side_effects_executed: nextCompleted.includes('merge') }
        : { status: 'closed', completed_phases: nextCompleted, current_phase: phase, side_effects_executed: true };
}
export async function runRealAgentDogfoodGraph(input) {
    let completed = [];
    while (true) {
        const result = await advanceRealAgentDogfoodGraph({ ...input, completed_phases: completed });
        if (result.status !== 'in-progress')
            return result;
        completed = result.completed_phases;
    }
}
