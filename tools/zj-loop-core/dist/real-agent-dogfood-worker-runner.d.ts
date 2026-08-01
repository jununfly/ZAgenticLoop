import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
import { type RealAgentDogfoodLifecycle } from './real-agent-dogfood-lifecycle.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
import { type RealAgentDogfoodExecutionBinding } from './real-agent-dogfood-binding.js';
type ProviderResult = {
    status: 'completed' | 'failed' | 'cancelled' | 'timed-out';
    success: boolean;
    pid: number;
    exit_code: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    reason?: string;
};
type Provider = {
    run(input: {
        cwd: string;
        prompt: string;
        executable: string;
    }): Promise<ProviderResult>;
};
type PostRunObservation = {
    status: 'signed';
    all_descendants_terminated: boolean;
    after_worktree_clean: boolean;
    after_network_policy_proved: boolean;
    after_credentials_clean: boolean;
    side_effects_detected: boolean;
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
export declare function executeRealAgentDogfoodWorker(input: {
    stateStore: SqliteStateStore;
    evidenceStore: ContentAddressedEvidenceStore;
    lifecycle: RealAgentDogfoodLifecycle;
    worker_id: string;
    lease_id: string;
    binding: RealAgentDogfoodExecutionBinding;
    worktree_path: string;
    executable: string;
    goal: string;
    provider: Provider;
    post_run_observation?: PostRunObservation;
    expected_revision: number;
    now?: string;
}): Promise<RealAgentDogfoodWorkerResult>;
export {};
