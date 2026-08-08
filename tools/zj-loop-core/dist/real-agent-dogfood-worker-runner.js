import { appendRealAgentDogfoodEvent, createRealAgentDogfoodTransition } from './real-agent-dogfood-lifecycle.js';
import { validateRealAgentDogfoodExecutionBinding } from './real-agent-dogfood-binding.js';
import { verifyRealAgentDogfoodPostRunProof } from './real-agent-dogfood-post-run-proof.js';
import { validateLocalExecutionPreflight } from './local-execution-preflight.js';
import { providerResultFromLocalProcess, validateProviderResult } from './provider-runtime-adapter.js';
import { observeRealAgentDogfoodGitScope } from './real-agent-dogfood-git-scope.js';
function providerExceptionReason(error) {
    const message = error instanceof Error ? error.message : '';
    return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(message) && message.length <= 96 ? message : 'provider-adapter-exception';
}
function validateAdmissionBoundExecution(input) {
    const admission = input.admission_bound_execution;
    if (validateLocalExecutionPreflight(admission.preflight).status !== 'valid')
        throw new Error('worker-admission-preflight-invalid');
    if (admission.preflight.execution_id !== input.lifecycle.execution_id || admission.preflight.attempt !== input.lifecycle.attempt || admission.execution.execution_id !== admission.preflight.execution_id || admission.execution.attempt !== admission.preflight.attempt || admission.execution.preflight_digest !== admission.preflight.preflight_digest)
        throw new Error('worker-admission-execution-binding-invalid');
    if (admission.preflight.executable !== input.executable || admission.preflight.cwd !== input.worktree_path)
        throw new Error('worker-admission-resource-binding-invalid');
}
export async function executeRealAgentDogfoodWorker(input) {
    if (input.lifecycle.status !== 'running')
        throw new Error('worker-lifecycle-not-running');
    validateAdmissionBoundExecution(input);
    const binding = await validateRealAgentDogfoodExecutionBinding({ binding: input.binding, executable: input.executable, args: input.binding.args, cwd: input.worktree_path, worktree_path: input.worktree_path, lease_id: input.lease_id });
    if (binding.status === 'blocked')
        throw new Error(`worker-${binding.reason}`);
    const now = input.now ?? new Date().toISOString();
    let result;
    try {
        result = await input.provider.run({ cwd: input.worktree_path, prompt: input.goal, executable: input.executable, mode: input.execution_mode });
    }
    catch (error) {
        result = { status: 'failed', success: false, pid: 0, exit_code: null, signal: null, stdout: '', stderr: '', reason: providerExceptionReason(error) };
    }
    const normalized = result.provider_result ?? providerResultFromLocalProcess(result);
    const normalizedCheck = validateProviderResult(normalized);
    let cleanup = { status: 'not-required' };
    if (!input.provider_cleanup)
        cleanup = { status: 'uncertain', reason: 'cleanup-coordinator-unavailable' };
    else {
        try {
            const candidate = await input.provider_cleanup();
            cleanup = candidate.status === 'cleaned' && /^sha256:[0-9a-f]{64}$/.test(candidate.proof_digest)
                ? candidate
                : { status: 'uncertain', reason: candidate.status === 'uncertain' ? candidate.reason : 'cleanup-proof-invalid' };
        }
        catch {
            cleanup = { status: 'uncertain', reason: 'cleanup-coordinator-failed' };
        }
    }
    let gitScope;
    if (input.execution_mode === 'write-enabled') {
        if (!input.git_scope)
            gitScope = { status: 'unavailable', reason: 'write-scope-observation-missing' };
        else {
            try {
                gitScope = await observeRealAgentDogfoodGitScope(input.git_scope);
            }
            catch (error) {
                gitScope = { status: 'unavailable', reason: error instanceof Error ? error.message : 'write-scope-observation-failed' };
            }
        }
    }
    const stdoutEvidence = await input.evidenceStore.put({ content: result.stdout, kind: 'provider-stdout' });
    const stderrEvidence = await input.evidenceStore.put({ content: result.stderr, kind: 'provider-stderr' });
    let postRunProof;
    if (input.post_run_proof_factory) {
        try {
            postRunProof = await input.post_run_proof_factory({ execution_id: input.lifecycle.execution_id, attempt: input.lifecycle.attempt, worktree_path: input.worktree_path, executable_digest: input.binding.executable_digest, stdout_digest: stdoutEvidence.digest, stderr_digest: stderrEvidence.digest, provider_result: { status: result.status, success: result.success, pid: result.pid, exit_code: result.exit_code, signal: result.signal } });
        }
        catch {
            postRunProof = null;
        }
    }
    const fact = { schema: 'zj-loop.real_agent_dogfood_provider_result.v1', execution_id: input.lifecycle.execution_id, attempt: input.lifecycle.attempt, worker_id: input.worker_id, lease_id: input.lease_id, executable: input.executable, executable_digest: input.binding.executable_digest, worktree_path: input.worktree_path, result: { status: result.status, success: result.success, pid: result.pid, exit_code: result.exit_code, signal: result.signal, reason: result.reason }, provider_result: normalized, provider_result_validation: normalizedCheck, cleanup, git_scope: gitScope ?? null, stdout: stdoutEvidence, stderr: stderrEvidence, post_run_proof: postRunProof ?? null };
    const factEvidence = await input.evidenceStore.put({ content: JSON.stringify(fact), kind: 'provider-result-fact' });
    const factDigest = factEvidence.digest;
    let to;
    let reasonCode;
    let nextAction;
    if (normalizedCheck.status === 'blocked') {
        to = cleanup.status === 'cleaned' ? 'blocked' : 'outcome-uncertain';
        reasonCode = cleanup.status === 'cleaned' ? 'provider-adapter-failure' : 'provider-adapter-failure-cleanup-uncertain';
        nextAction = cleanup.status === 'cleaned' ? 'human-review-provider-failure' : 'human-reconcile-execution';
    }
    else if (!result.success || result.status !== 'completed') {
        to = cleanup.status === 'cleaned' ? 'blocked' : 'outcome-uncertain';
        reasonCode = cleanup.status === 'cleaned' ? `provider-${result.reason ?? result.status}` : `provider-${result.reason ?? result.status}-cleanup-uncertain`;
        nextAction = cleanup.status === 'cleaned' ? 'human-review-provider-failure' : 'human-reconcile-execution';
    }
    else if (cleanup.status !== 'cleaned') {
        to = 'outcome-uncertain';
        reasonCode = 'provider-completed-cleanup-uncertain';
        nextAction = 'human-reconcile-execution';
    }
    else if (input.execution_mode === 'write-enabled' && (!gitScope || !('scope' in gitScope))) {
        to = 'outcome-uncertain';
        reasonCode = 'write-scope-observation-uncertain';
        nextAction = 'human-reconcile-execution';
    }
    else if (input.execution_mode === 'write-enabled' && gitScope && 'scope' in gitScope && gitScope.scope.status === 'blocked') {
        to = 'blocked';
        reasonCode = gitScope.scope.reason;
        nextAction = 'human-review-provider-failure';
    }
    else if (!postRunProof) {
        to = 'outcome-uncertain';
        reasonCode = 'post-run-proof-missing-or-invalid';
        nextAction = 'human-reconcile-execution';
    }
    else {
        const proof = verifyRealAgentDogfoodPostRunProof({ proof: postRunProof, execution_id: input.lifecycle.execution_id, attempt: input.lifecycle.attempt, worktree_path: input.worktree_path, executable_digest: input.binding.executable_digest, stdout_digest: stdoutEvidence.digest, stderr_digest: stderrEvidence.digest });
        if (proof.status === 'blocked') {
            to = 'outcome-uncertain';
            reasonCode = 'post-run-proof-invalid';
            nextAction = 'human-reconcile-execution';
        }
        else {
            to = 'verification-pending';
            reasonCode = 'provider-completed';
            nextAction = 'run-independent-verifier';
        }
    }
    const transition = createRealAgentDogfoodTransition({ lifecycle: input.lifecycle, to, event_id: `${input.lifecycle.dogfood_id}:attempt-${input.lifecycle.attempt}:${to}`, occurred_at: now, fact_digest: factDigest, reason_code: reasonCode, next_action: nextAction });
    const appendResult = await appendRealAgentDogfoodEvent({ stateStore: input.stateStore, expected_revision: input.expected_revision, event: transition.event });
    if (appendResult.status === 'conflict')
        throw new Error('worker-lifecycle-revision-conflict');
    return { status: to, stdout_digest: stdoutEvidence.digest, stderr_digest: stderrEvidence.digest, stdout_size: stdoutEvidence.size, stderr_size: stderrEvidence.size, provider_fact_digest: factEvidence.digest, revision: appendResult.revision, reason_code: reasonCode, next_action: nextAction };
}
