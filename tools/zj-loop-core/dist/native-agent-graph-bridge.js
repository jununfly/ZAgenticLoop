import { createNativeOpnTracerExecution } from './native-opn-tracer-execution.js';
export function buildNativeOpnTracerExecutionFromNativeAgent(input) {
    const status = input.execution.status === 'evidence-recorded' ? 'succeeded' : input.execution.status === 'blocked' || input.execution.status === 'failed' || input.execution.status === 'timed-out' || input.execution.status === 'cancelled' ? 'blocked' : undefined;
    if (!status)
        throw new Error('native-agent-graph-execution-not-terminal');
    if (status === 'succeeded' && !input.output_evidence_digest)
        throw new Error('native-agent-graph-output-required');
    return createNativeOpnTracerExecution({
        network_id: input.network_id, event_id: input.event_id, plan_id: input.plan_id, plan_revision: input.plan_revision, plan_digest: input.plan_digest,
        node_id: input.execution.agent_id, task_id: input.execution.task_id, execution_id: input.execution.execution_id, assigned_node: input.execution.agent_id,
        status, input_evidence_digests: input.input_evidence_digests, ...(status === 'succeeded' ? { output_evidence_digest: input.output_evidence_digest } : {}), recorded_at: input.recorded_at,
    });
}
