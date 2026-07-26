import type { GitLabIssueNoteBridgeEnvelope } from "./gitlab-issue-note-bridge.js";
import { type AgentHandoff, type StateBranchClient } from "./agent-local.js";
export declare const AGENT_EXECUTION_REQUEST_SCHEMA = "zj-loop.agent_execution_request.v1";
export type AgentExecutionRequest = {
    schema: typeof AGENT_EXECUTION_REQUEST_SCHEMA;
    request_id?: string;
    registration: {
        ref: string;
        path: string;
        sha256: string;
    };
};
export type AgentLocalBridgeResult = {
    status: "created" | "duplicate" | "blocked";
    handoff: AgentHandoff | null;
    state_commit_id: string | null;
    side_effects_executed: boolean;
    reason?: string;
};
export declare function parseAgentExecutionRequest(note: string, marker: string): AgentExecutionRequest | null;
export declare function buildAgentLocalHandoff(input: {
    envelope: GitLabIssueNoteBridgeEnvelope;
    request: AgentExecutionRequest;
    registrationText: string;
    registrationCommit: string;
    workspaceBaseCommit: string;
    now: string;
}): AgentHandoff;
export declare function persistAgentLocalHandoff(input: {
    client: StateBranchClient;
    handoff: AgentHandoff;
}): Promise<AgentLocalBridgeResult>;
