import type { OpnArtifactStore } from './opn-artifact-store.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
import { type OutboundTaskApproval } from './opn-outbound-task-approval.js';
export declare const OPN_AGENT_TASK_CHAIN_READ_MODEL_SCHEMA: "zj-loop.opn_agent_task_chain_read_model.v1";
export type OpnAgentTaskChain = {
    task_id: string;
    network_id: string;
    approval?: OutboundTaskApproval;
    task_message?: {
        message_id: string;
        envelope_digest: string;
        target_node_id: string;
        delivery_state: string;
    };
    result_message?: {
        message_id: string;
        envelope_digest: string;
        from_node_id: string;
        delivery_state: string;
    };
    execution?: Record<string, unknown>;
    evidence_refs: string[];
    status: 'pending-approval' | 'published' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'unknown';
    side_effects_executed: false;
};
export declare function projectOpnAgentTaskChains(input: {
    stateStore: SqliteStateStore;
    artifactStore: OpnArtifactStore;
    network_id: string;
    node_id: string;
}): Promise<{
    schema: typeof OPN_AGENT_TASK_CHAIN_READ_MODEL_SCHEMA;
    network_id: string;
    tasks: OpnAgentTaskChain[];
    side_effects_executed: false;
}>;
