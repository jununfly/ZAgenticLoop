import { createRealAgentDogfoodExecutionBinding, createRealAgentDogfoodExecutionBindingDigest } from './real-agent-dogfood-binding.js';
import { acquireRealAgentDogfoodWorkerLease, releaseRealAgentDogfoodWorkerLease } from './real-agent-dogfood-worker.js';
import { realAgentDogfoodWorkerLeaseDigest } from './real-agent-dogfood-digests.js';
import { createRealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
import { executeRealAgentDogfoodWorker } from './real-agent-dogfood-worker-runner.js';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
export function createRealAgentDogfoodGraphSourceExecutionAdapter(input) {
    return async () => {
        if (input.lifecycle.status !== 'running')
            return { status: 'outcome-uncertain', reason: 'source-execution-lifecycle-not-running' };
        if (input.lifecycle.execution_id !== input.plan.execution_id || input.lifecycle.attempt !== input.plan.attempt)
            return { status: 'outcome-uncertain', reason: 'source-execution-lifecycle-binding-invalid' };
        if (input.admission_bound_execution.preflight.cwd !== input.plan.source_worktree || input.admission_bound_execution.execution.execution_id !== input.plan.execution_id || input.admission_bound_execution.execution.attempt !== input.plan.attempt)
            return { status: 'outcome-uncertain', reason: 'source-execution-admission-binding-invalid' };
        let expectedBindingDigest;
        try {
            expectedBindingDigest = await createRealAgentDogfoodExecutionBindingDigest({ executable: input.executable, args: [...input.args], cwd: input.plan.source_worktree, worktree_path: input.plan.source_worktree });
        }
        catch {
            return { status: 'outcome-uncertain', reason: 'source-execution-binding-unavailable' };
        }
        if (expectedBindingDigest !== input.execution_binding_digest)
            return { status: 'outcome-uncertain', reason: 'source-execution-binding-digest-mismatch' };
        const lease = await acquireRealAgentDogfoodWorkerLease({ stateStore: input.state_store, network_id: input.network_id, execution_id: input.plan.execution_id, worker_id: input.worker_id, execution_binding_digest: input.execution_binding_digest, now: input.now });
        if (lease.status !== 'acquired' && lease.status !== 'reused' && lease.status !== 'renewed')
            return { status: 'outcome-uncertain', reason: lease.status === 'blocked' ? `source-execution-${lease.reason}` : 'source-execution-worker-lease-unavailable' };
        let binding;
        try {
            binding = await createRealAgentDogfoodExecutionBinding({ executable: input.executable, args: [...input.args], cwd: input.plan.source_worktree, worktree_path: input.plan.source_worktree, lease_id: lease.lease_id });
        }
        catch {
            return { status: 'outcome-uncertain', reason: 'source-execution-binding-unavailable' };
        }
        if (binding.execution_binding_digest !== input.execution_binding_digest)
            return { status: 'outcome-uncertain', reason: 'source-execution-binding-digest-mismatch' };
        let result;
        try {
            result = await (input.worker_runner ?? executeRealAgentDogfoodWorker)({ stateStore: input.state_store, evidenceStore: input.evidence_store, lifecycle: input.lifecycle, worker_id: input.worker_id, lease_id: lease.lease_id, binding, admission_bound_execution: input.admission_bound_execution, worktree_path: input.plan.source_worktree, executable: input.executable, goal: input.goal, execution_mode: input.plan.execution_mode, git_scope: { repo_root: input.plan.source_worktree, baseline_commit: input.plan.baseline_commit, allowed_files: [...input.plan.allowed_files] }, provider: input.provider, provider_cleanup: input.provider_cleanup, post_run_proof_factory: input.post_run_proof_factory, expected_revision: lease.revision, now: input.now });
        }
        catch {
            return { status: 'outcome-uncertain', reason: 'source-execution-worker-outcome-uncertain' };
        }
        const release = await releaseRealAgentDogfoodWorkerLease({ stateStore: input.state_store, network_id: input.network_id, execution_id: input.plan.execution_id, lease_id: lease.lease_id, worker_id: lease.worker_id, execution_binding_digest: input.execution_binding_digest, expected_revision: result.revision, now: input.now });
        const workerDigest = realAgentDogfoodWorkerLeaseDigest({ execution_binding_digest: input.execution_binding_digest, execution_id: input.plan.execution_id, lease_id: lease.lease_id, worker_id: lease.worker_id, expires_at: lease.expires_at });
        const evidence = DIGEST.test(result.provider_fact_digest) ? result.provider_fact_digest : undefined;
        const releaseOk = release.status === 'released';
        const status = result.status === 'verification-pending' && releaseOk ? 'passed' : result.status === 'blocked' && releaseOk ? 'blocked' : 'outcome-uncertain';
        const reason = releaseOk ? result.reason_code : 'source-execution-worker-lease-release-uncertain';
        const record = evidence ? createRealAgentDogfoodGraphPhaseRecord({ plan: input.plan, network_id: input.network_id, phase: 'source_execution', status, completed_phases: status === 'passed' ? ['source_execution'] : [], reason, actor_kind: 'agent-node', actor_identity: input.worker_id, evidence_digest: evidence, evidence_refs: [evidence], execution_binding_digest: input.execution_binding_digest, worker_lease_digest: workerDigest }) : undefined;
        return { status, ...(reason ? { reason } : {}), ...(evidence ? { evidence_digest: evidence } : {}), ...(record ? { record } : {}), worker_result: result };
    };
}
