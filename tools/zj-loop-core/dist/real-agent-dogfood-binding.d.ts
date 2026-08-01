type ExecutionBindingInput = {
    executable: string;
    args: string[];
    cwd: string;
    worktree_path: string;
    lease_id: string;
};
export type RealAgentDogfoodExecutionBinding = ExecutionBindingInput & {
    executable_digest: string;
    argv_digest: string;
};
export declare function createRealAgentDogfoodExecutionBinding(input: ExecutionBindingInput): Promise<RealAgentDogfoodExecutionBinding>;
export declare function validateRealAgentDogfoodExecutionBinding(input: {
    binding: RealAgentDogfoodExecutionBinding;
} & ExecutionBindingInput): Promise<{
    status: 'accepted';
} | {
    status: 'blocked';
    reason: 'executable-digest-mismatch' | 'argv-digest-mismatch' | 'worktree-binding-mismatch' | 'lease-binding-mismatch';
}>;
export {};
