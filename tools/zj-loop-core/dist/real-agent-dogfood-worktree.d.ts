export type RealAgentDogfoodWorktreeResult = {
    status: 'prepared' | 'reused';
    execution_id: string;
    branch: string;
    worktree_path: string;
    base_commit: string;
} | {
    status: 'blocked';
    reason: string;
};
export declare function prepareRealAgentDogfoodWorktree(input: {
    repo_root: string;
    worktree_root: string;
    execution_id: string;
}): Promise<RealAgentDogfoodWorktreeResult>;
