import type { AgentHandoff } from "./agent-local.js";
import type { AgentContextSnapshot } from "./agent-context.js";
export declare const AGENT_EXECUTION_CONTEXT_SCHEMA = "zj-loop.agent_execution_context.v1";
export type AgentExecutionContextStatus = "execution-ready" | "blocked-missing-roadmap" | "blocked-incomplete-contract" | "request-human-claim";
export type AgentExecutionContext = {
    schema: typeof AGENT_EXECUTION_CONTEXT_SCHEMA;
    status: AgentExecutionContextStatus;
    side_effects_executed: false;
    handoff: {
        id: string;
        status: AgentHandoff["status"];
        claim_id: string | null;
        human_id: number | null;
        agent_session_id: string | null;
    };
    activation: {
        id: string;
        contract_path: string;
        contract_sha256: string | null;
    };
    state: {
        branch: "zj-loop-state";
        head_sha: string | null;
    };
    executor: {
        kind: string | null;
        profile: string | null;
        allowed_side_effects: string[];
    };
    workspace: {
        repo_root: string;
        base_ref: string | null;
        base_commit: string | null;
        branch: string | null;
        roadmap_path: string;
        roadmap_exists: boolean;
    };
    merge_request: {
        target_branch: string | null;
        draft_required: boolean;
        create_allowed: boolean;
    };
    required_gates: string[];
    next_steps: string[];
    reason?: string;
};
export declare function buildAgentExecutionContext(input: {
    handoff: AgentHandoff | null;
    repoRoot: string;
    activationId: string;
    activationContractPath?: string;
    roadmapPath?: string;
    stateHead?: string | null;
    agentContext?: AgentContextSnapshot;
    requireContext?: boolean;
}): Promise<AgentExecutionContext>;
