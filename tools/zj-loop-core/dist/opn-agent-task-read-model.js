import { projectOpnInbox } from './opn-transport-inbox.js';
import { listOutboundTaskApprovals } from './opn-outbound-task-approval.js';
export const OPN_AGENT_TASK_CHAIN_READ_MODEL_SCHEMA = 'zj-loop.opn_agent_task_chain_read_model.v1';
async function resultArtifact(input) {
    if (!input.artifact_id)
        return null;
    try {
        const value = JSON.parse((await input.artifactStore.read(input.artifact_id)).bytes.toString('utf8'));
        const execution = value.execution && typeof value.execution === 'object' && !Array.isArray(value.execution) ? value.execution : undefined;
        const refs = Array.isArray(execution?.evidence_refs) ? execution.evidence_refs.filter((ref) => typeof ref === 'string') : [];
        return { ...(execution ? { execution } : {}), evidence_refs: refs };
    }
    catch {
        return null;
    }
}
export async function projectOpnAgentTaskChains(input) {
    const approvals = await listOutboundTaskApprovals({ stateStore: input.stateStore, network_id: input.network_id });
    const messages = await projectOpnInbox({ stateStore: input.stateStore, network_id: input.network_id, node_id: input.node_id });
    const chains = new Map();
    for (const approval of approvals) {
        chains.set(approval.envelope.task_id, { task_id: approval.envelope.task_id, network_id: input.network_id, approval, task_message: { message_id: approval.envelope.message_id, envelope_digest: approval.envelope.envelope_digest, target_node_id: approval.envelope.target_node_id, delivery_state: approval.status === 'published' ? 'published' : approval.status }, evidence_refs: [], status: approval.status === 'pending' ? 'pending-approval' : approval.status === 'published' ? 'published' : approval.status === 'rejected' ? 'blocked' : 'unknown', side_effects_executed: false });
    }
    for (const message of messages.filter((value) => value.notification_kind === 'agent.result')) {
        const current = chains.get(message.task_id) ?? { task_id: message.task_id, network_id: input.network_id, evidence_refs: [], status: 'unknown', side_effects_executed: false };
        const result = await resultArtifact({ artifactStore: input.artifactStore, artifact_id: message.artifact_refs[0]?.artifact_id });
        const execution = result?.execution;
        const executionStatus = typeof execution?.status === 'string' ? execution.status : undefined;
        const status = executionStatus === 'evidence-recorded' || executionStatus === 'succeeded' ? 'succeeded' : executionStatus === 'failed' ? 'failed' : executionStatus === 'blocked' ? 'blocked' : 'running';
        chains.set(message.task_id, { ...current, result_message: { message_id: message.message_id, envelope_digest: message.envelope_digest, from_node_id: message.from_node_id, delivery_state: message.delivery_state }, ...(execution ? { execution } : {}), evidence_refs: result?.evidence_refs ?? [], status });
    }
    return { schema: OPN_AGENT_TASK_CHAIN_READ_MODEL_SCHEMA, network_id: input.network_id, tasks: [...chains.values()], side_effects_executed: false };
}
