import { createTransportEnvelope, type TransportAdapter, type TransportEnvelope } from './transport-contract.js';
import type { BoundedLoopTask } from './agent-task.js';
import type { OpnArtifactMetadata, OpnArtifactStore } from './opn-artifact-store.js';
import type { NativeAgentRuntimeResult } from './native-agent-runtime.js';
import type { OpnAgentWorkerSessionEvidence } from './opn-agent-worker.js';
import { evaluateOpnTaskAdmission, type SupervisionMode } from './opn-task-admission.js';
import type { AgentRegistration } from './agent-registration.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
import { appendInboundTaskLifecycle, createInboundTask, listInboundTasks, persistInboundTask, recoverExpiredInboundTasks, type InboundTask } from './opn-inbound-task.js';

export const OPN_AGENT_RESULT_SCHEMA = 'zj-loop.opn_agent_result.v1' as const;

type Runtime = { acceptEnvelope(input: { envelope: TransportEnvelope; task: BoundedLoopTask; now: string }): Promise<NativeAgentRuntimeResult> };

type ProviderRunResult = { status: 'completed' | 'failed' | 'cancelled' | 'timed-out'; success: boolean; evidence_refs?: string[] };

export function createProviderBackedNativeAgentExecutor(input: { provider: { run(request: Record<string, unknown>): Promise<ProviderRunResult> }; cwd: string; provider_kind: 'codex' | 'workbuddy-code'; prompt?: (task: BoundedLoopTask) => string; timeout_ms?: number; termination_grace_ms?: number; max_stdout_bytes?: number; max_stderr_bytes?: number }) {
  if (!input.provider || typeof input.provider.run !== 'function') throw new Error('opn-agent-provider-required');
  if (!input.cwd.trim()) throw new Error('opn-agent-provider-cwd-required');
  return async (task: BoundedLoopTask): Promise<{ status: 'succeeded' | 'failed' | 'blocked'; evidence_refs?: string[]; reason?: string }> => {
    const prompt = input.prompt?.(task) ?? task.objective;
    if (!prompt.trim()) return { status: 'blocked', reason: 'opn-agent-provider-prompt-required' };
    let result: ProviderRunResult;
    try {
      result = await input.provider.run({ cwd: input.cwd, prompt, ...(input.provider_kind === 'codex' ? { mode: 'read-only' } : {}), env_allowlist: [], env: {}, timeout_ms: input.timeout_ms ?? 15 * 60 * 1000, termination_grace_ms: input.termination_grace_ms ?? 5_000, max_stdout_bytes: input.max_stdout_bytes ?? 10 * 1024 * 1024, max_stderr_bytes: input.max_stderr_bytes ?? 10 * 1024 * 1024 });
    } catch (error) {
      return { status: 'failed', reason: error instanceof Error ? error.message : 'opn-agent-provider-failed' };
    }
    if (result.status === 'completed' && result.success) return { status: 'succeeded', evidence_refs: result.evidence_refs?.length ? result.evidence_refs : [`provider-result-${task.execution_id}`] };
    return { status: result.status === 'timed-out' ? 'blocked' : 'failed', reason: `provider-${result.status}`, evidence_refs: result.evidence_refs };
  };
}

export function createOpnAgentAdapter(input: { transport: TransportAdapter; runtime: Runtime; artifactStore: OpnArtifactStore; stateStore?: SqliteStateStore; network_id?: string; publishArtifact?: (input: { bytes: Buffer; metadata: OpnArtifactMetadata; transfer_id: string; target_node_id: string }) => Promise<void>; on_non_task?: (input: { envelope: TransportEnvelope; reason: string }) => void; agent_id: string; registration?: AgentRegistration; supervision_mode?: SupervisionMode; now?: () => string }) {
  if (!input.transport || !input.runtime || !input.artifactStore || !input.agent_id.trim()) throw new Error('opn-agent-adapter-dependency-required');
  const now = input.now ?? (() => new Date().toISOString());
  return {
    async processNext(args: { session_id: string; receive_wait_ms?: number; session_evidence?: OpnAgentWorkerSessionEvidence; resolveTask(envelope: TransportEnvelope): Promise<BoundedLoopTask> | BoundedLoopTask }): Promise<{ status: 'empty' | 'processed' | 'skipped' | 'blocked'; message_id?: string; result?: NativeAgentRuntimeResult; reason?: string; side_effects_executed: false }> {
      let inbound: InboundTask | undefined;
      let envelope: TransportEnvelope | null = null;
      if (input.stateStore) {
        if (input.network_id) {
          await recoverExpiredInboundTasks({ stateStore: input.stateStore, network_id: input.network_id, now: now() });
          inbound = (await listInboundTasks({ stateStore: input.stateStore, network_id: input.network_id, now: now() })).find((task) => task.status === 'admitted' && task.selected_agent_id === input.agent_id);
        }
      }
      if (inbound) envelope = inbound.envelope;
      else envelope = await input.transport.receive({ session_id: args.session_id, ...(args.receive_wait_ms === undefined ? {} : { wait_ms: args.receive_wait_ms }) });
      if (!envelope) return { status: 'empty', side_effects_executed: false };
      if (envelope.target_node_id !== input.agent_id) return { status: 'blocked', message_id: envelope.message_id, reason: 'opn-agent-target-node-mismatch', side_effects_executed: false };
      if (envelope.notification_kind !== 'agent.task') {
        await input.transport.acknowledge({ session_id: args.session_id, message_id: envelope.message_id, envelope_digest: envelope.envelope_digest });
        const reason = 'opn-agent-non-task-envelope-acknowledged';
        input.on_non_task?.({ envelope, reason });
        return { status: 'skipped', message_id: envelope.message_id, reason, side_effects_executed: false };
      }
      let task: BoundedLoopTask;
      try { task = await args.resolveTask(envelope); } catch { return { status: 'blocked', message_id: envelope.message_id, reason: 'opn-agent-task-unavailable', side_effects_executed: false }; }
      if (input.registration && input.supervision_mode) {
        const admission = evaluateOpnTaskAdmission({ task, registration: input.registration, target_node_id: envelope.target_node_id, supervision_mode: input.supervision_mode });
        if (admission.status !== 'admitted') {
          if (admission.status === 'pending-human-approval' && input.stateStore) {
            const pendingInbound = createInboundTask({ network_id: envelope.network_id, envelope, received_at: now() });
            await persistInboundTask({ stateStore: input.stateStore, inbound: pendingInbound, now: now() });
            await input.transport.acknowledge({ session_id: args.session_id, message_id: envelope.message_id, envelope_digest: envelope.envelope_digest });
            return { status: 'blocked', message_id: envelope.message_id, reason: 'pending-human-approval', side_effects_executed: false };
          }
          if (inbound && input.stateStore) await appendInboundTaskLifecycle({ stateStore: input.stateStore, inbound, status: 'failed', reason: admission.reason, now: now() });
          return { status: 'blocked', message_id: envelope.message_id, reason: admission.reason, side_effects_executed: false };
        }
      }
      if (inbound && input.stateStore) {
        const claimed = await appendInboundTaskLifecycle({ stateStore: input.stateStore, inbound, status: 'processing', now: now() });
        if (claimed.status !== 'recorded') return { status: 'blocked', message_id: envelope.message_id, reason: 'inbound-task-already-processing', side_effects_executed: false };
      }
      try {
        const result = await input.runtime.acceptEnvelope({ envelope, task, now: now() });
        if (result.status === 'blocked') throw new Error(result.reason);
        const bytes = Buffer.from(JSON.stringify({ schema: OPN_AGENT_RESULT_SCHEMA, message_id: envelope.message_id, execution: result.execution, ...(args.session_evidence ? { session_evidence: args.session_evidence } : {}), side_effects_executed: false }));
        const artifact = await input.artifactStore.put({ bytes, file_name: `${envelope.task_id}.agent-result.json`, media_type: 'application/json' });
        if (input.publishArtifact) await input.publishArtifact({ bytes, metadata: artifact.metadata, transfer_id: `result-artifact:${envelope.message_id}`, target_node_id: envelope.from_node_id });
        const response = createTransportEnvelope({ message_id: `agent-result:${envelope.message_id}`, network_id: envelope.network_id, event_id: envelope.event_id, plan_id: envelope.plan_id, plan_revision: envelope.plan_revision, task_id: envelope.task_id, from_node_id: input.agent_id, target_node_id: envelope.from_node_id, notification_kind: 'agent.result', state: result.execution.status === 'evidence-recorded' ? 'available' : 'blocked', artifact_refs: [{ artifact_id: artifact.metadata.artifact_id, content_sha256: artifact.metadata.content_sha256, kind: 'artifact' }], created_at: now(), expires_at: envelope.expires_at });
        await input.transport.send({ session_id: args.session_id, envelope: response });
        if (inbound && input.stateStore) await appendInboundTaskLifecycle({ stateStore: input.stateStore, inbound, status: 'completed', now: now() });
        else await input.transport.acknowledge({ session_id: args.session_id, message_id: envelope.message_id, envelope_digest: envelope.envelope_digest });
        return { status: 'processed', message_id: envelope.message_id, result, side_effects_executed: false };
      } catch (error) {
        const reason = error instanceof Error && error.message.trim() ? error.message : 'opn-agent-execution-failed';
        if (inbound && input.stateStore) {
          try { await appendInboundTaskLifecycle({ stateStore: input.stateStore, inbound, status: 'failed', reason, now: now() }); } catch { /* preserve the original failure for the worker result */ }
        }
        return { status: 'blocked', message_id: envelope.message_id, reason, side_effects_executed: false };
      }
    },
  };
}
