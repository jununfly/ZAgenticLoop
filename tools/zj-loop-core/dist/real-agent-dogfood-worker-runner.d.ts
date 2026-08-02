import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
import { type RealAgentDogfoodLifecycle } from './real-agent-dogfood-lifecycle.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
import { type RealAgentDogfoodExecutionBinding } from './real-agent-dogfood-binding.js';
import { type RealAgentDogfoodPostRunProofFactory } from './real-agent-dogfood-post-run-proof.js';
import type { AdmissionBoundExecution } from './trusted-runner-admission-binding.js';
import { type ProviderResult as NormalizedProviderResult } from './provider-runtime-adapter.js';
type ProviderResult = {
    status: 'completed' | 'failed' | 'cancelled' | 'timed-out';
    success: boolean;
    pid: number;
    exit_code: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    reason?: string;
    provider_result?: NormalizedProviderResult;
};
type Provider = {
    run(input: {
        cwd: string;
        prompt: string;
        executable: string;
    }): Promise<ProviderResult>;
};
export type RealAgentDogfoodWorkerResult = {
    status: 'verification-pending' | 'blocked' | 'outcome-uncertain';
    stdout_digest: string;
    stderr_digest: string;
    stdout_size: number;
    stderr_size: number;
    provider_fact_digest: string;
    revision: number;
    reason_code: string;
    next_action: string;
};
type ProviderCleanupResult = {
    status: 'cleaned';
    proof_digest: string;
} | {
    status: 'uncertain';
    reason: string;
};
export declare function executeRealAgentDogfoodWorker(input: {
    stateStore: SqliteStateStore;
    evidenceStore: ContentAddressedEvidenceStore;
    lifecycle: RealAgentDogfoodLifecycle;
    worker_id: string;
    lease_id: string;
    binding: RealAgentDogfoodExecutionBinding;
    admission_bound_execution: AdmissionBoundExecution;
    worktree_path: string;
    executable: string;
    goal: string;
    provider: Provider;
    provider_cleanup?: () => Promise<ProviderCleanupResult>;
    post_run_proof_factory?: RealAgentDogfoodPostRunProofFactory;
    expected_revision: number;
    now?: string;
}): Promise<RealAgentDogfoodWorkerResult>;
export {};
