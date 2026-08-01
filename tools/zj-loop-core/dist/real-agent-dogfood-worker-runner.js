import { appendRealAgentDogfoodEvent, createRealAgentDogfoodTransition } from './real-agent-dogfood-lifecycle.js';
import { validateRealAgentDogfoodExecutionBinding } from './real-agent-dogfood-binding.js';
import { verifyRealAgentDogfoodPostRunProof } from './real-agent-dogfood-post-run-proof.js';
export async function executeRealAgentDogfoodWorker(input) {
    if (input.lifecycle.status !== 'running')
        throw new Error('worker-lifecycle-not-running');
    const binding = await validateRealAgentDogfoodExecutionBinding({ binding: input.binding, executable: input.executable, args: input.binding.args, cwd: input.worktree_path, worktree_path: input.worktree_path, lease_id: input.lease_id });
    if (binding.status === 'blocked')
        throw new Error(`worker-${binding.reason}`);
    const now = input.now ?? new Date().toISOString();
    const result = await input.provider.run({ cwd: input.worktree_path, prompt: input.goal, executable: input.executable });
    const stdoutEvidence = await input.evidenceStore.put({ content: result.stdout, kind: 'provider-stdout' });
    const stderrEvidence = await input.evidenceStore.put({ content: result.stderr, kind: 'provider-stderr' });
    const fact = { schema: 'zj-loop.real_agent_dogfood_provider_result.v1', execution_id: input.lifecycle.execution_id, attempt: input.lifecycle.attempt, worker_id: input.worker_id, lease_id: input.lease_id, executable: input.executable, executable_digest: input.binding.executable_digest, worktree_path: input.worktree_path, result: { status: result.status, success: result.success, pid: result.pid, exit_code: result.exit_code, signal: result.signal, reason: result.reason }, stdout: stdoutEvidence, stderr: stderrEvidence, post_run_proof: input.post_run_proof ?? null };
    const factEvidence = await input.evidenceStore.put({ content: JSON.stringify(fact), kind: 'provider-result-fact' });
    const factDigest = factEvidence.digest;
    let to;
    let reasonCode;
    let nextAction;
    if (!result.success || result.status !== 'completed') {
        to = 'blocked';
        reasonCode = `provider-${result.reason ?? result.status}`;
        nextAction = 'human-review-provider-failure';
    }
    else if (!input.post_run_proof) {
        to = 'outcome-uncertain';
        reasonCode = 'post-run-proof-missing-or-invalid';
        nextAction = 'human-reconcile-execution';
    }
    else {
        const proof = verifyRealAgentDogfoodPostRunProof({ proof: input.post_run_proof, execution_id: input.lifecycle.execution_id, attempt: input.lifecycle.attempt, worktree_path: input.worktree_path, executable_digest: input.binding.executable_digest, stdout_digest: stdoutEvidence.digest, stderr_digest: stderrEvidence.digest });
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
