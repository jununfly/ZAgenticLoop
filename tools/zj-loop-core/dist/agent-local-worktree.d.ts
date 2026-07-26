import type { AgentHandoff } from "./agent-local.js";
export declare const AGENT_WORKTREE_SCHEMA = "zj-loop.agent_local_worktree.v1";
export type AgentLocalWorktreeResult = {
    schema: typeof AGENT_WORKTREE_SCHEMA;
    status: "prepared" | "reused" | "blocked";
    handoff_id: string;
    branch: string | null;
    worktree_path: string | null;
    base_commit: string | null;
    side_effects_executed: boolean;
    reason?: string;
};
type GitRunner = (args: string[], cwd: string) => Promise<{
    stdout: string;
    stderr: string;
}>;
export declare function agentLocalBranchName(handoffId: string): string;
export declare function prepareAgentLocalWorktree(input: {
    handoff: AgentHandoff;
    repoRoot: string;
    worktreeRoot: string;
    gitRunner?: GitRunner;
}): Promise<AgentLocalWorktreeResult>;
export {};
