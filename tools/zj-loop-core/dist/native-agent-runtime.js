import { validateAgentRegistration } from './agent-registration.js';
import { createNativeAgentExecution, transitionNativeAgentExecution } from './agent-execution.js';
import { validateBoundedLoopTask } from './agent-task.js';
import { validateTransportEnvelope } from './transport-contract.js';
export const NATIVE_AGENT_RUNTIME_SCHEMA = 'zj-loop.native_agent_runtime.v1';
function eventId(executionId, status) { return `agent-execution:${executionId}:${status}`; }
export function createNativeAgentRuntime(input) {
    if (validateAgentRegistration(input.registration).status !== 'valid')
        throw new Error('native-agent-registration-invalid');
    if (typeof input.executor !== 'function')
        throw new Error('native-agent-executor-required');
    const executions = new Map();
    async function persist(networkId, execution, status, now) {
        const revision = await input.stateStore.getRevision(networkId);
        await input.stateStore.appendEvent({
            network_id: networkId, expected_revision: revision,
            event: { event_id: eventId(execution.execution_id, status), aggregate_type: 'native-agent-execution', aggregate_id: execution.execution_id, event_type: `agent-execution.${status}`, occurred_at: now, payload: { execution } },
            now,
        });
    }
    async function acceptEnvelope(args) {
        const envelopeValidation = validateTransportEnvelope(args.envelope);
        if (envelopeValidation.status !== 'valid')
            return { status: 'blocked', reason: envelopeValidation.reason, side_effects_executed: false };
        if (args.envelope.target_node_id !== input.registration.agent_id)
            return { status: 'blocked', reason: 'target-agent-mismatch', side_effects_executed: false };
        if (args.envelope.notification_kind !== 'agent.task' || args.envelope.state !== 'available')
            return { status: 'blocked', reason: 'agent-task-envelope-invalid', side_effects_executed: false };
        if (args.envelope.task_id !== args.task.task_id || args.task.input_artifact_refs.some((ref) => !args.envelope.artifact_refs.some((item) => item.artifact_id === ref)))
            return { status: 'blocked', reason: 'agent-task-input-mismatch', side_effects_executed: false };
        if (validateBoundedLoopTask(args.task).status !== 'valid')
            return { status: 'blocked', reason: 'bounded-loop-task-invalid', side_effects_executed: false };
        let existing = executions.get(args.task.execution_id);
        if (!existing) {
            const persisted = await input.stateStore.readEvents({ network_id: args.envelope.network_id, aggregate_type: 'native-agent-execution', aggregate_id: args.task.execution_id });
            const last = persisted.events.at(-1)?.payload;
            existing = last?.execution;
            if (existing)
                executions.set(existing.execution_id, existing);
        }
        if (existing)
            return { status: 'duplicate', execution: existing, side_effects_executed: false };
        let execution = createNativeAgentExecution({ execution_id: args.task.execution_id, task_id: args.task.task_id, attempt: args.task.attempt, agent_id: input.registration.agent_id, task_digest: args.task.task_digest, registration_digest: input.registration.registration_digest, started_at: args.now });
        executions.set(execution.execution_id, execution);
        await persist(args.envelope.network_id, execution, 'received', args.now);
        for (const status of ['validated', 'dispatched', 'running']) {
            execution = transitionNativeAgentExecution({ execution, status, at: args.now });
            executions.set(execution.execution_id, execution);
            await persist(args.envelope.network_id, execution, status, args.now);
        }
        let result;
        try {
            result = await input.executor(args.task);
        }
        catch (error) {
            result = { status: 'failed', reason: error instanceof Error ? error.message : 'native-agent-executor-failed' };
        }
        if (result.status === 'succeeded')
            execution = transitionNativeAgentExecution({ execution, status: 'succeeded', at: args.now });
        else
            execution = transitionNativeAgentExecution({ execution, status: result.status, at: args.now, evidence_refs: result.evidence_refs, reason: result.reason ?? `executor-${result.status}` });
        executions.set(execution.execution_id, execution);
        await persist(args.envelope.network_id, execution, result.status, args.now);
        if (result.status === 'succeeded') {
            execution = transitionNativeAgentExecution({ execution, status: 'evidence-recorded', at: args.now, evidence_refs: result.evidence_refs });
            executions.set(execution.execution_id, execution);
            await persist(args.envelope.network_id, execution, 'evidence-recorded', args.now);
        }
        return { status: 'accepted', execution, side_effects_executed: false };
    }
    return { schema: NATIVE_AGENT_RUNTIME_SCHEMA, acceptEnvelope };
}
