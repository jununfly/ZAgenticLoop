import type { AgentClaim, AgentExecution, AgentEvidence, AgentHandoff } from "./agent-local.js";
export declare const AGENT_CONTEXT_SNAPSHOT_SCHEMA = "zj-loop.agent_context_snapshot.v1";
export declare const ACTIVATION_SNAPSHOT_REF_SCHEMA = "zj-loop.activation_snapshot_ref.v1";
export type ContextValidationError = {
    code: string;
    path: string;
    message: string;
};
export type ActivationSnapshotRef = {
    schema: typeof ACTIVATION_SNAPSHOT_REF_SCHEMA;
    activation_id: string;
    project_path: string;
    commit: string;
    path: string;
    sha256: string;
};
export type AgentContextSnapshot = {
    schema: typeof AGENT_CONTEXT_SNAPSHOT_SCHEMA;
    status: "completed" | "blocked";
    state: {
        branch: "zj-loop-state";
        head_sha: string | null;
    };
    handoff: Record<string, unknown> | null;
    claim: Record<string, unknown> | null;
    history: {
        executions: AgentExecution[];
        evidence: AgentEvidence[];
    };
    current: {
        lifecycle_status: AgentExecution["status"] | "claimed" | "pending" | null;
        execution: AgentExecution | null;
        evidence: AgentEvidence[];
    };
    activation: {
        ref: ActivationSnapshotRef | null;
    };
    validation: {
        state_head_stable: boolean;
        errors: ContextValidationError[];
    };
    side_effects_executed: false;
    reason?: string;
};
export type ContextRecords = {
    handoff: AgentHandoff | null;
    claim: AgentClaim | null;
    activation: ActivationSnapshotRef | null;
    executions: AgentExecution[];
    evidence: AgentEvidence[];
};
export type ProjectReadClient = {
    readText?(path: string, ref: string): Promise<string | null>;
    readJson(path: string, ref: string): Promise<unknown | null>;
};
export declare function loadAgentContext(input: {
    state: {
        getHead(): Promise<string>;
        readJson(path: string, ref?: string): Promise<unknown | null>;
        list(path: string, ref?: string): Promise<string[]>;
    };
    project: ProjectReadClient;
    handoffId: string;
}): Promise<AgentContextSnapshot>;
export declare function reconstructAgentContext(input: {
    stateHead: string;
    finalStateHead: string;
    records: ContextRecords;
}): AgentContextSnapshot;
