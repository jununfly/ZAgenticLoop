import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { createRealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
const execFile = promisify(execFileCallback);
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const MAX_OUTPUT_BYTES = 256 * 1024;
function digest(value) { return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`; }
function defaultGitRunner() {
    return async (cwd, args) => {
        try {
            const result = await execFile('git', args, { cwd, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES });
            return { status: 0, stdout: result.stdout, stderr: result.stderr };
        }
        catch (error) {
            const value = error;
            return { status: typeof value.code === 'number' ? value.code : 1, stdout: value.stdout ?? '', stderr: value.stderr };
        }
    };
}
async function pathExists(value) {
    try {
        await stat(value);
        return true;
    }
    catch {
        return false;
    }
}
async function canonicalPath(value) {
    try {
        return await realpath(value);
    }
    catch {
        return path.resolve(value);
    }
}
async function registeredPaths(output) {
    const paths = output.split('\n').filter((line) => line.startsWith('worktree ')).map((line) => line.slice('worktree '.length));
    return new Set(await Promise.all(paths.map((value) => canonicalPath(value))));
}
async function observeResources(repoRoot, resources, runGit) {
    const listed = await runGit(repoRoot, ['worktree', 'list', '--porcelain']);
    if (listed.status !== 0)
        return { status: 'outcome-uncertain', resources: [], reason: 'cleanup-registration-observation-uncertain' };
    const registered = await registeredPaths(listed.stdout);
    const observations = [];
    for (const resource of resources) {
        const exists = await pathExists(resource.worktree_path);
        let clean = null;
        if (exists) {
            const status = await runGit(resource.worktree_path, ['status', '--porcelain', '--untracked-files=all']);
            if (status.status !== 0)
                return { status: 'outcome-uncertain', resources: observations, reason: `${resource.name}-status-observation-uncertain` };
            clean = status.stdout === '';
        }
        observations.push({ ...resource, path_exists: exists, registered: registered.has(await canonicalPath(resource.worktree_path)), clean });
    }
    if (observations.some((item) => item.path_exists && !item.registered))
        return { status: 'blocked', resources: observations, registration_digest: digest(listed.stdout), reason: 'cleanup-worktree-registration-mismatch' };
    if (observations.some((item) => item.clean === false))
        return { status: 'blocked', resources: observations, registration_digest: digest(listed.stdout), reason: 'cleanup-worktree-dirty' };
    if (observations.some((item) => !item.path_exists && item.registered))
        return { status: 'outcome-uncertain', resources: observations, registration_digest: digest(listed.stdout), reason: 'cleanup-stale-registration-unresolved' };
    return { status: 'observed', resources: observations, registration_digest: digest(listed.stdout) };
}
function previousCompleted(prior) {
    return [...prior.completed_phases];
}
export function createRealAgentDogfoodGraphCleanupAdapter(input) {
    return async () => {
        const prior = input.prior_phase;
        const expectedPaths = { target: path.resolve(input.plan.target_worktree), source: path.resolve(input.plan.source_worktree), verifier: path.resolve(input.plan.verifier_worktree) };
        const suppliedPaths = { target: path.resolve(input.target_worktree), source: path.resolve(input.source_worktree), verifier: path.resolve(input.verifier_worktree) };
        const priorActorValid = prior.phase === 'merge' ? ['coordinator', 'human'].includes(prior.actor_kind ?? '') : ['coordinator', 'trusted-runner', 'core'].includes(prior.actor_kind ?? '');
        if (!['merge', 'post_merge_gate'].includes(prior.phase) || !priorActorValid || !prior.actor_identity || !input.network_id.trim() || prior.network_id !== input.network_id || prior.plan_digest !== input.plan.plan_digest || prior.execution_id !== input.plan.execution_id || !prior.evidence_digest || !DIGEST.test(prior.evidence_digest) || !input.verifier_id.trim() || expectedPaths.target !== suppliedPaths.target || expectedPaths.source !== suppliedPaths.source || expectedPaths.verifier !== suppliedPaths.verifier || new Set(Object.values(suppliedPaths)).size !== 3)
            return { status: 'blocked', reason: 'cleanup-prerequisite-binding-invalid' };
        const resources = [
            { name: 'target', worktree_path: suppliedPaths.target },
            { name: 'source', worktree_path: suppliedPaths.source },
            { name: 'verifier', worktree_path: suppliedPaths.verifier },
        ];
        const runGit = input.run_git ?? defaultGitRunner();
        let before;
        try {
            before = await observeResources(path.resolve(input.repo_root), resources, runGit);
        }
        catch {
            return { status: 'outcome-uncertain', reason: 'cleanup-observation-uncertain' };
        }
        let status = before.status === 'observed' ? 'passed' : before.status;
        let reason = status === 'passed' ? 'cleanup-started' : before.reason ?? `cleanup-${status}`;
        const commandResults = [];
        if (status === 'passed') {
            for (const resource of resources) {
                const observation = before.resources.find((item) => item.name === resource.name);
                if (!observation) {
                    status = 'outcome-uncertain';
                    reason = `cleanup-${resource.name}-observation-missing`;
                    break;
                }
                if (!observation.path_exists && !observation.registered) {
                    commandResults.push({ resource: resource.name, status: 0, result: 'already-absent' });
                    continue;
                }
                const removed = await runGit(path.resolve(input.repo_root), ['worktree', 'remove', resource.worktree_path]);
                commandResults.push({ resource: resource.name, status: removed.status, result: removed.status === 0 ? 'removed' : 'failed' });
                if (removed.status !== 0) {
                    status = 'blocked';
                    reason = `cleanup-remove-${resource.name}-failed`;
                    break;
                }
            }
        }
        let after;
        try {
            after = await observeResources(path.resolve(input.repo_root), resources, runGit);
        }
        catch {
            after = { status: 'outcome-uncertain', resources: [], reason: 'cleanup-post-observation-uncertain' };
        }
        if (status === 'passed' && after.status !== 'observed') {
            status = after.status;
            reason = after.reason ?? `cleanup-${after.status}`;
        }
        if (status === 'passed' && after.resources.some((item) => item.path_exists || item.registered)) {
            status = 'outcome-uncertain';
            reason = 'cleanup-residue-observation-uncertain';
        }
        if (status === 'blocked' && after.status === 'outcome-uncertain') {
            reason = 'cleanup-post-observation-uncertain';
        }
        const evidencePayload = {
            schema: 'zj-loop.real_agent_dogfood_graph_cleanup_evidence.v1',
            network_id: input.network_id,
            execution_id: input.plan.execution_id,
            plan_digest: input.plan.plan_digest,
            verifier_id: input.verifier_id,
            prior_phase: prior.phase,
            prior_status: prior.status,
            resources: { before: before.resources, after: after.resources },
            registration_digest_before: before.registration_digest ?? null,
            registration_digest_after: after.registration_digest ?? null,
            commands: commandResults,
            result_status: status,
            reason,
        };
        let evidence;
        try {
            evidence = await input.evidence_store.put({ content: JSON.stringify(evidencePayload), kind: 'real-agent-dogfood-graph-cleanup' });
        }
        catch {
            return { status: 'outcome-uncertain', reason: 'cleanup-evidence-write-failed' };
        }
        if (!DIGEST.test(evidence.digest))
            return { status: 'outcome-uncertain', reason: 'cleanup-evidence-invalid' };
        const graphRecordEligible = prior.phase === 'post_merge_gate' && prior.status === 'passed' && prior.completed_phases.at(-1) === 'post_merge_gate';
        const record = graphRecordEligible ? createRealAgentDogfoodGraphPhaseRecord({ plan: input.plan, network_id: input.network_id, phase: 'cleanup', status, completed_phases: status === 'passed' ? [...previousCompleted(prior), 'cleanup'] : previousCompleted(prior), reason, actor_kind: 'trusted-runner', actor_identity: input.verifier_id, evidence_digest: evidence.digest, evidence_refs: [evidence.digest] }) : undefined;
        return { status, reason, evidence_digest: evidence.digest, ...(record ? { record } : {}) };
    };
}
