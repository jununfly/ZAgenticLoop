export declare const AGENT_HANDOFF_SCHEMA = "zj-loop.agent_handoff.v1";
export declare const AGENT_CLAIM_SCHEMA = "zj-loop.agent_claim.v1";
export declare const AGENT_STATE_BRANCH = "zj-loop-state";
export type AgentHandoff = {
    schema: typeof AGENT_HANDOFF_SCHEMA;
    handoff_id: string;
    request_id: string;
    status: "pending" | "claimed" | "running" | "completed" | "blocked" | "released";
    created_at: string;
    source: {
        provider: "gitlab";
        project_path: string;
        issue_iid: number;
        note_id: number;
        event_id: string;
        dedupe_key: string;
        source_url: string;
    };
    route: {
        route_id: string;
    };
    executor: {
        kind: string;
        profile: string;
        capabilities: string[];
    };
    registration: {
        commit: string;
        path: string;
        sha256: string;
    };
    workspace: {
        project_path: string;
        base_ref: string;
        base_commit: string;
    };
    claim: AgentClaim | null;
    side_effects_executed: false;
};
export type AgentClaim = {
    schema: typeof AGENT_CLAIM_SCHEMA;
    claim_id: string;
    handoff_id: string;
    human_id: number;
    agent_session_id: string;
    claimed_at: string;
    status: "claimed";
};
export type StateBranchClient = {
    getHead(): Promise<string>;
    readJson(path: string): Promise<unknown | null>;
    list(path: string): Promise<string[]>;
    commit(input: {
        branch: string;
        message: string;
        last_commit_id: string;
        actions: Array<{
            action: "create";
            file_path: string;
            content: string;
        }>;
    }): Promise<{
        id: string;
    }>;
};
export type AgentLocalListResult = {
    schema: "zj-loop.agent_local_list.v1";
    status: "completed" | "blocked";
    handoffs: AgentHandoff[];
    side_effects_executed: false;
    reason?: string;
};
export type AgentLocalClaimResult = {
    schema: "zj-loop.agent_local_claim.v1";
    status: "claimed" | "already-claimed" | "blocked";
    handoff_id: string;
    claim: AgentClaim | null;
    commit_id: string | null;
    side_effects_executed: boolean;
    reason?: string;
};
export declare const AGENT_EXECUTION_SCHEMA = "zj-loop.agent_execution.v1";
export declare const AGENT_EVIDENCE_SCHEMA = "zj-loop.agent_evidence.v1";
export type AgentExecutionStatus = "running" | "completed" | "blocked" | "released";
export type AgentExecution = {
    schema: typeof AGENT_EXECUTION_SCHEMA;
    execution_id: string;
    handoff_id: string;
    claim_id: string;
    status: AgentExecutionStatus;
    recorded_at: string;
    branch: string | null;
    worktree_path: string | null;
    reason: string | null;
    side_effects_executed: false;
};
export type AgentEvidence = {
    schema: typeof AGENT_EVIDENCE_SCHEMA;
    evidence_id: string;
    handoff_id: string;
    execution_id: string;
    claim_id: string;
    kind: string;
    status: "passed" | "failed" | "informational";
    path: string | null;
    sha256: string | null;
    recorded_at: string;
    side_effects_executed: false;
};
export type AgentExecutionWriteResult = {
    schema: "zj-loop.agent_local_execution.v1" | "zj-loop.agent_local_evidence.v1";
    status: "recorded" | "blocked";
    record: AgentExecution | AgentEvidence | null;
    commit_id: string | null;
    side_effects_executed: boolean;
    reason?: string;
};
export declare function recordAgentLocalExecution(input: {
    client: StateBranchClient;
    handoffId: string;
    claimId: string;
    status: AgentExecutionStatus;
    executionId?: string;
    branch?: string;
    worktreePath?: string;
    reason?: string;
    now?: string;
}): Promise<AgentExecutionWriteResult>;
export declare function recordAgentLocalEvidence(input: {
    client: StateBranchClient;
    handoffId: string;
    claimId: string;
    executionId: string;
    kind: string;
    status: AgentEvidence["status"];
    path?: string;
    sha256?: string;
    now?: string;
}): Promise<AgentExecutionWriteResult>;
export declare function listAgentLocalHandoffs(input: {
    client: StateBranchClient;
}): Promise<AgentLocalListResult>;
export declare function claimAgentLocalHandoff(input: {
    client: StateBranchClient;
    handoffId: string;
    humanId: number;
    agentSessionId: string;
    now?: string;
}): Promise<AgentLocalClaimResult>;
export declare function buildHandoffId(input: {
    projectPath: string;
    eventId: string;
    dedupeKey: string;
}): string;
export declare function isAgentHandoff(value: unknown): value is AgentHandoff;
export declare function createGitLabStateBranchClient(input: {
    apiBaseUrl: string;
    projectPath: string;
    token: string;
    fetchImpl?: typeof fetch;
}): StateBranchClient;
