import type { TrustedRunnerProcessBoundary, TrustedRunnerSignature } from './trusted-runner.js';
export declare const REAL_AGENT_DOGFOOD_POST_RUN_PROOF_SCHEMA: "zj-loop.real_agent_dogfood_post_run_proof.v1";
export type RealAgentDogfoodPostRunProof = {
    schema: typeof REAL_AGENT_DOGFOOD_POST_RUN_PROOF_SCHEMA;
    status: 'signed' | 'uncertain';
    runner_id: string;
    execution_id: string;
    attempt: number;
    worktree_path: string;
    executable_digest: string;
    stdout_digest: string;
    stderr_digest: string;
    process_boundary: TrustedRunnerProcessBoundary;
    after_worktree_clean: boolean;
    after_network_policy_proved: boolean;
    after_credentials_clean: boolean;
    side_effects_detected: boolean;
    issued_at: string;
    signature: TrustedRunnerSignature;
};
export declare function realAgentDogfoodPostRunProofDigest(proof: Omit<RealAgentDogfoodPostRunProof, 'signature'>): string;
export declare function verifyRealAgentDogfoodPostRunProof(input: {
    proof: RealAgentDogfoodPostRunProof;
    execution_id: string;
    attempt: number;
    worktree_path: string;
    executable_digest: string;
    stdout_digest: string;
    stderr_digest: string;
}): {
    status: 'accepted';
} | {
    status: 'blocked';
    reasons: string[];
};
export declare function createFakeRealAgentDogfoodPostRunProof(input: {
    runner_id?: string;
    execution_id: string;
    attempt: number;
    worktree_path: string;
    executable_digest: string;
    stdout_digest: string;
    stderr_digest: string;
    now?: string;
    process_boundary?: TrustedRunnerProcessBoundary;
    after_worktree_clean?: boolean;
    after_network_policy_proved?: boolean;
    after_credentials_clean?: boolean;
    side_effects_detected?: boolean;
}): RealAgentDogfoodPostRunProof;
