export type RealAgentDogfoodVerificationCommand = {
    id: string;
    executable: string;
    args: string[];
    timeout_ms: number;
};
export type RealAgentDogfoodVerificationPlan = {
    schema: 'zj-loop.real_agent_dogfood_verification_plan.v1';
    execution_id: string;
    attempt: number;
    input_commit: string;
    verifier: {
        identity: string;
        worktree_root: string;
    };
    commands: RealAgentDogfoodVerificationCommand[];
    plan_digest: string;
};
export declare function createRealAgentDogfoodVerificationPlan(input: {
    execution_id: string;
    attempt: number;
    verifier_id: string;
    input_commit: string;
    repo_root: string;
    verifier_worktree_root: string;
    commands: RealAgentDogfoodVerificationCommand[];
}): RealAgentDogfoodVerificationPlan;
export type DisposableVerifierWorktree = {
    status: 'prepared';
    execution_id: string;
    attempt: number;
    verifier_id: string;
    worktree_path: string;
    input_commit: string;
    pre_cleanup: {
        status: 'clean';
        head_commit: string;
        untracked: false;
    };
};
export declare function prepareDisposableRealAgentDogfoodVerifierWorktree(input: {
    repo_root: string;
    worktree_root: string;
    execution_id: string;
    attempt: number;
    input_commit: string;
    verifier_id: string;
}): Promise<DisposableVerifierWorktree>;
export declare function verifyDisposableRealAgentDogfoodWorktreeCleanup(input: {
    worktree_path: string;
    repo_root: string;
}): Promise<{
    status: 'clean' | 'blocked';
    reason?: string;
    head_commit?: string;
}>;
export declare function validateRealAgentDogfoodVerificationPlan(plan: RealAgentDogfoodVerificationPlan): {
    status: 'valid' | 'blocked';
    reason?: string;
};
