import { createTransportEnvelope, type TransportAdapter, type TransportEnvelope } from './transport-contract.js';
import type { BoundedLoopTask } from './agent-task.js';
import type { OpnArtifactMetadata, OpnArtifactStore } from './opn-artifact-store.js';
import type { NativeAgentRuntimeResult } from './native-agent-runtime.js';

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

export function createOpnAgentAdapter(input: { transport: TransportAdapter; runtime: Runtime; artifactStore: OpnArtifactStore; publishArtifact?: (input: { bytes: Buffer; metadata: OpnArtifactMetadata; transfer_id: string; target_node_id: string }) => Promise<void>; agent_id: string; now?: () => string }) {
  if (!input.transport || !input.runtime || !input.artifactStore || !input.agent_id.trim()) throw new Error('opn-agent-adapter-dependency-required');
  const now = input.now ?? (() => new Date().toISOString());
  return {
    async processNext(args: { session_id: string; resolveTask(envelope: TransportEnvelope): Promise<BoundedLoopTask> | BoundedLoopTask }): Promise<{ status: 'empty' | 'processed' | 'blocked'; message_id?: string; result?: NativeAgentRuntimeResult; reason?: string; side_effects_executed: false }> {
      const envelope = await input.transport.receive({ session_id: args.session_id });
      if (!envelope) return { status: 'empty', side_effects_executed: false };
      if (envelope.target_node_id !== input.agent_id || envelope.notification_kind !== 'agent.task') return { status: 'blocked', message_id: envelope.message_id, reason: 'opn-agent-task-envelope-invalid', side_effects_executed: false };
      let task: BoundedLoopTask;
      try { task = await args.resolveTask(envelope); } catch { return { status: 'blocked', message_id: envelope.message_id, reason: 'opn-agent-task-unavailable', side_effects_executed: false }; }
      const result = await input.runtime.acceptEnvelope({ envelope, task, now: now() });
      if (result.status === 'blocked') return { status: 'blocked', message_id: envelope.message_id, result, reason: result.reason, side_effects_executed: false };
      const bytes = Buffer.from(JSON.stringify({ schema: OPN_AGENT_RESULT_SCHEMA, message_id: envelope.message_id, execution: result.execution, side_effects_executed: false }));
      const artifact = await input.artifactStore.put({ bytes, file_name: `${envelope.task_id}.agent-result.json`, media_type: 'application/json' });
      if (input.publishArtifact) await input.publishArtifact({ bytes, metadata: artifact.metadata, transfer_id: `result-artifact:${envelope.message_id}`, target_node_id: envelope.from_node_id });
      const response = createTransportEnvelope({ message_id: `agent-result:${envelope.message_id}`, network_id: envelope.network_id, event_id: envelope.event_id, plan_id: envelope.plan_id, plan_revision: envelope.plan_revision, task_id: envelope.task_id, from_node_id: input.agent_id, target_node_id: envelope.from_node_id, notification_kind: 'agent.result', state: result.execution.status === 'evidence-recorded' ? 'available' : 'blocked', artifact_refs: [{ artifact_id: artifact.metadata.artifact_id, content_sha256: artifact.metadata.content_sha256, kind: 'artifact' }], created_at: now(), expires_at: envelope.expires_at });
      await input.transport.send({ session_id: args.session_id, envelope: response });
      await input.transport.acknowledge({ session_id: args.session_id, message_id: envelope.message_id, envelope_digest: envelope.envelope_digest });
      return { status: 'processed', message_id: envelope.message_id, result, side_effects_executed: false };
    },
  };
}
