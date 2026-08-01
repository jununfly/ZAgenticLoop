import { createHash } from 'node:crypto';
import { appendRealAgentDogfoodEvent, createRealAgentDogfoodTransition } from './real-agent-dogfood-lifecycle.js';
function digest(value) { return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`; }
export async function executeRealAgentDogfoodWorker(input) {
    if (input.lifecycle.status !== 'running')
        throw new Error('worker-lifecycle-not-running');
    const now = input.now ?? new Date().toISOString();
    const result = await input.provider.run({ cwd: input.worktree_path, prompt: input.goal, executable: input.executable });
    const stdoutEvidence = await input.evidenceStore.put({ content: result.stdout, kind: 'provider-stdout' });
    const stderrEvidence = await input.evidenceStore.put({ content: result.stderr, kind: 'provider-stderr' });
    const fact = { schema: 'zj-loop.real_agent_dogfood_provider_result.v1', execution_id: input.lifecycle.execution_id, attempt: input.lifecycle.attempt, worker_id: input.worker_id, lease_id: input.lease_id, executable: input.executable, worktree_path: input.worktree_path, result: { status: result.status, success: result.success, pid: result.pid, exit_code: result.exit_code, signal: result.signal, reason: result.reason }, stdout: stdoutEvidence, stderr: stderrEvidence, post_run_observation: input.post_run_observation ?? null };
    const factDigest = digest(fact);
    let to;
    let reasonCode;
    let nextAction;
    if (!result.success || result.status !== 'completed') {
        to = 'blocked';
        reasonCode = `provider-${result.reason ?? result.status}`;
        nextAction = 'human-review-provider-failure';
    }
    else if (!input.post_run_observation || input.post_run_observation.status !== 'signed' || !input.post_run_observation.all_descendants_terminated || !input.post_run_observation.after_worktree_clean || !input.post_run_observation.after_network_policy_proved || !input.post_run_observation.after_credentials_clean || input.post_run_observation.side_effects_detected) {
        to = 'outcome-uncertain';
        reasonCode = 'post-run-proof-missing-or-invalid';
        nextAction = 'human-reconcile-execution';
    }
    else {
        to = 'verification-pending';
        reasonCode = 'provider-completed';
        nextAction = 'run-independent-verifier';
    }
    const transition = createRealAgentDogfoodTransition({ lifecycle: input.lifecycle, to, event_id: `${input.lifecycle.dogfood_id}:attempt-${input.lifecycle.attempt}:${to}`, occurred_at: now, fact_digest: factDigest, reason_code: reasonCode, next_action: nextAction });
    const appendResult = await appendRealAgentDogfoodEvent({ stateStore: input.stateStore, expected_revision: input.expected_revision, event: transition.event });
    if (appendResult.status === 'conflict')
        throw new Error('worker-lifecycle-revision-conflict');
    return { status: to, stdout_digest: stdoutEvidence.digest, stderr_digest: stderrEvidence.digest, stdout_size: stdoutEvidence.size, stderr_size: stderrEvidence.size, reason_code: reasonCode, next_action: nextAction };
}
