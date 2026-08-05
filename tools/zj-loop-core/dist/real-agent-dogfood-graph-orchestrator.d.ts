export declare const REAL_AGENT_DOGFOOD_GRAPH_ORCHESTRATOR_SCHEMA: "zj-loop.real_agent_dogfood_graph_orchestrator.v1";
export declare const REAL_AGENT_DOGFOOD_GRAPH_PHASES: readonly ["source_execution", "scope_observation", "independent_verification", "human_acceptance", "merge", "post_merge_gate", "cleanup"];
export declare const REAL_AGENT_DOGFOOD_GRAPH_DIGEST_PROFILE: "zj-loop.real-agent-dogfood-graph-digest.v1";
export declare const REAL_AGENT_DOGFOOD_GRAPH_EDGES: {
    from: "cleanup" | "merge" | "post_merge_gate" | "source_execution" | "scope_observation" | "independent_verification" | "human_acceptance";
    to: "cleanup" | "merge" | "post_merge_gate" | "source_execution" | "scope_observation" | "independent_verification" | "human_acceptance";
}[];
export type RealAgentDogfoodGraphPhase = typeof REAL_AGENT_DOGFOOD_GRAPH_PHASES[number];
export type RealAgentDogfoodGraphPlan = {
    schema: typeof REAL_AGENT_DOGFOOD_GRAPH_ORCHESTRATOR_SCHEMA;
    dogfood_id: string;
    execution_id: string;
    attempt: number;
    goal: string;
    repo_root: string;
    baseline_commit: string;
    target_worktree: string;
    source_worktree: string;
    verifier_worktree: string;
    evidence_store: string;
    allowed_files: readonly string[];
    execution_mode: 'write-enabled';
    network_policy: 'network-allowed';
    plan_digest: string;
    plan_definition_digest: string;
    digest_profile: typeof REAL_AGENT_DOGFOOD_GRAPH_DIGEST_PROFILE;
};
export type RealAgentDogfoodGraphResult = {
    status: 'in-progress' | 'closed' | 'blocked' | 'outcome-uncertain';
    completed_phases: RealAgentDogfoodGraphPhase[];
    current_phase?: RealAgentDogfoodGraphPhase;
    next_phase?: RealAgentDogfoodGraphPhase;
    reason?: string;
    side_effects_executed: boolean;
};
type StageResult = {
    status: 'passed';
    reason?: string;
} | {
    status: 'blocked' | 'outcome-uncertain';
    reason?: string;
};
type GraphStages = {
    [phase in RealAgentDogfoodGraphPhase]: () => Promise<StageResult>;
};
export declare function createRealAgentDogfoodGraphPlan(input: {
    dogfood_id: string;
    execution_id: string;
    attempt: number;
    goal: string;
    repo_root: string;
    baseline_commit: string;
    target_worktree: string;
    source_worktree: string;
    verifier_worktree: string;
    evidence_store: string;
    allowed_files: readonly string[];
    execution_mode: 'write-enabled';
    network_policy: 'network-allowed';
}): RealAgentDogfoodGraphPlan;
export declare function validateRealAgentDogfoodGraphWorktrees(input: {
    plan: RealAgentDogfoodGraphPlan;
}): Promise<{
    status: 'valid' | 'blocked';
    reason?: string;
    source_branch?: string;
}>;
export declare function advanceRealAgentDogfoodGraph(input: GraphStages & {
    plan: RealAgentDogfoodGraphPlan;
    completed_phases?: readonly string[];
}): Promise<RealAgentDogfoodGraphResult>;
export declare function runRealAgentDogfoodGraph(input: GraphStages & {
    plan: RealAgentDogfoodGraphPlan;
}): Promise<RealAgentDogfoodGraphResult>;
export {};
