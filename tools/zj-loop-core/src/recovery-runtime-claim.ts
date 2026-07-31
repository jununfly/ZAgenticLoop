import { parseBoundedJson } from './parse-bounded-json.js';
import type { ContentAddressedArtifactStore } from './content-addressed-artifact-store.js';
import type { OrchestrationPlan } from './orchestration-plan.js';
import { claimOrchestrationTask, type RuntimeClaimResult } from './orchestration-runtime-claim.js';
import { evaluateRecoveryPlanRevisionReadiness, type RecoveryPlanRevisionRecord } from './recovery-plan-revision.js';
import type { SqliteStateStore } from './sqlite-state-store.js';

function blocked(networkId: string, recoveryPlanId: string, taskId = 'unknown', nodeId = 'unknown', reason: string): RuntimeClaimResult {
  return {
    schema: 'zj-loop.orchestration_task_claim.v1',
    status: 'blocked',
    event_id: `recovery-task-claim:${networkId}:${recoveryPlanId}:${taskId}:${nodeId}`,
    side_effects_executed: false,
    reason,
  };
}

export async function claimRecoveryTask(input: {
  recovery_record: RecoveryPlanRevisionRecord;
  parent_execution_id: string;
  network_id: string;
  stateStore?: SqliteStateStore;
  artifactStore?: ContentAddressedArtifactStore;
  expected_revision?: number;
  preflight_artifact_id?: string;
  plan?: OrchestrationPlan;
  task_id?: string;
  node_id?: string;
  enrollment?: { node_id: string; network_id: string; status: 'approved' | 'pending' | 'revoked'; capability_ceiling: string[] };
  now?: string;
}): Promise<RuntimeClaimResult> {
  const taskId = input.task_id ?? 'unknown';
  const nodeId = input.node_id ?? 'unknown';
  if (input.recovery_record.parent_execution_id !== input.parent_execution_id) return blocked(input.network_id, input.recovery_record.recovery_plan_id, taskId, nodeId, 'recovery-parent-execution-mismatch');
  if (!input.recovery_record.repreflight_artifact_id) return blocked(input.network_id, input.recovery_record.recovery_plan_id, taskId, nodeId, 'recovery-repreflight-required');
  if (input.preflight_artifact_id !== undefined && input.preflight_artifact_id !== input.recovery_record.repreflight_artifact_id) return blocked(input.network_id, input.recovery_record.recovery_plan_id, taskId, nodeId, 'recovery-repreflight-artifact-mismatch');
  if (!input.stateStore) return blocked(input.network_id, input.recovery_record.recovery_plan_id, taskId, nodeId, 'recovery-parent-execution-fact-missing');
  const parentFact = await input.stateStore.runAtomic((transaction) => {
    const row = transaction.database.prepare("SELECT event_type, payload_json FROM state_events WHERE network_id = ? AND aggregate_type = 'execution' AND aggregate_id = ? AND event_type = 'execution.started' ORDER BY revision DESC LIMIT 1").get(input.network_id, input.parent_execution_id) as { event_type: string; payload_json: string } | undefined;
    if (!row) return null;
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
    const terminal = transaction.database.prepare("SELECT 1 FROM state_events WHERE network_id = ? AND aggregate_type = 'execution' AND aggregate_id = ? AND event_type IN ('execution.completed', 'execution.failed', 'execution.abandoned') LIMIT 1").get(input.network_id, input.parent_execution_id);
    if (terminal || payload.network_id !== input.network_id || payload.execution_id !== input.parent_execution_id || payload.event_id !== input.recovery_record.event_id || payload.plan_id !== input.recovery_record.parent_plan_id || payload.plan_revision !== input.recovery_record.parent_plan_revision || typeof payload.grant_digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(payload.grant_digest) || typeof payload.assigned_node !== 'string') return null;
    return payload;
  });
  if (!parentFact) return blocked(input.network_id, input.recovery_record.recovery_plan_id, taskId, nodeId, 'recovery-parent-execution-fact-missing');
  if (!input.artifactStore || input.expected_revision === undefined || !input.preflight_artifact_id || !input.plan || !input.enrollment || !input.now) return blocked(input.network_id, input.recovery_record.recovery_plan_id, taskId, nodeId, 'recovery-claim-input-incomplete');
  let artifact;
  try {
    artifact = await input.artifactStore.readArtifact({ network_id: input.network_id, artifact_id: input.preflight_artifact_id });
  } catch {
    return blocked(input.network_id, input.recovery_record.recovery_plan_id, taskId, nodeId, 'recovery-preflight-artifact-unavailable');
  }
  let preflight: Record<string, unknown>;
  try {
    preflight = parseBoundedJson(artifact.content) as Record<string, unknown>;
  } catch {
    return blocked(input.network_id, input.recovery_record.recovery_plan_id, taskId, nodeId, 'recovery-preflight-artifact-invalid');
  }
  const checked = evaluateRecoveryPlanRevisionReadiness({ record: { ...input.recovery_record, repreflight_artifact_id: input.preflight_artifact_id }, artifact_id: input.preflight_artifact_id, preflight });
  if (checked.status === 'blocked') return blocked(input.network_id, input.recovery_record.recovery_plan_id, taskId, nodeId, checked.reason ?? 'recovery-repreflight-blocked');
  return claimOrchestrationTask({
    stateStore: input.stateStore,
    artifactStore: input.artifactStore,
    network_id: input.network_id,
    execution_id: input.parent_execution_id,
    expected_revision: input.expected_revision,
    preflight_artifact_id: input.preflight_artifact_id,
    plan: input.plan,
    task_id: taskId,
    node_id: nodeId,
    enrollment: input.enrollment,
    now: input.now,
  });
}
