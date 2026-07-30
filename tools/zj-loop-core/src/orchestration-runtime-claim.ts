import { parseBoundedJson } from './parse-bounded-json.js';
import type { ContentAddressedArtifactStore } from './content-addressed-artifact-store.js';
import type { OrchestrationPlan } from './orchestration-plan.js';
import { orchestrationCapabilityGrantDigest } from './orchestration-preflight.js';
import type { SqliteStateStore } from './sqlite-state-store.js';

export const ORCHESTRATION_TASK_CLAIM_SCHEMA = 'zj-loop.orchestration_task_claim.v1' as const;
export type RuntimeClaimResult = { schema: typeof ORCHESTRATION_TASK_CLAIM_SCHEMA; status: 'claimed' | 'duplicate' | 'blocked'; event_id: string; side_effects_executed: false; reason?: string; revision?: number; current_revision?: number };

function claimEventId(input: { network_id: string; plan_id: string; plan_revision: number; task_id: string; node_id: string }): string {
  return `orchestration-task-claimed:${input.network_id}:${input.plan_id}:${input.plan_revision}:${input.task_id}:${input.node_id}`;
}

function blocked(event_id: string, reason: string): RuntimeClaimResult { return { schema: ORCHESTRATION_TASK_CLAIM_SCHEMA, status: 'blocked', event_id, side_effects_executed: false, reason }; }

export async function claimOrchestrationTask(input: {
  stateStore: SqliteStateStore;
  artifactStore: ContentAddressedArtifactStore;
  network_id: string;
  expected_revision: number;
  preflight_artifact_id: string;
  plan: OrchestrationPlan;
  task_id: string;
  node_id: string;
  enrollment: { node_id: string; network_id: string; status: 'approved' | 'pending' | 'revoked'; capability_ceiling: string[] };
  now: string;
}): Promise<RuntimeClaimResult> {
  const event_id = claimEventId({ network_id: input.network_id, plan_id: input.plan.plan_id, plan_revision: input.plan.plan_revision, task_id: input.task_id, node_id: input.node_id });
  let artifact;
  try { artifact = await input.artifactStore.readArtifact({ network_id: input.network_id, artifact_id: input.preflight_artifact_id }); } catch { return blocked(event_id, 'preflight-artifact-unavailable'); }
  let context: Record<string, unknown>;
  try { context = parseBoundedJson(artifact.content) as Record<string, unknown>; } catch { return blocked(event_id, 'preflight-artifact-invalid'); }
  if (context.schema !== 'zj-loop.orchestration_preflight.v1' || context.status !== 'execution-ready' || context.side_effects_executed !== false) return blocked(event_id, 'preflight-not-execution-ready');
  if (context.network_id !== input.network_id || context.plan_id !== input.plan.plan_id || context.plan_revision !== input.plan.plan_revision || context.plan_digest !== input.plan.plan_digest) return blocked(event_id, 'preflight-plan-binding-mismatch');
  if (typeof context.expires_at !== 'string' || Date.parse(input.now) >= Date.parse(context.expires_at)) return blocked(event_id, 'preflight-expired');
  if (input.enrollment.node_id !== nodeAssignedNode(input.plan, input.node_id) || input.enrollment.network_id !== input.network_id || input.enrollment.status !== 'approved') return blocked(event_id, 'enrollment-not-execution-ready');
  const node = input.plan.nodes.find((candidate) => candidate.node_id === input.node_id);
  if (!node || node.task.task_id !== input.task_id) return blocked(event_id, 'task-node-binding-mismatch');
  const grant = node.task.capability_grant;
  if (grant.grant_digest !== orchestrationCapabilityGrantDigest(grant)) return blocked(event_id, 'capability-grant-digest-invalid');
  if (grant.network_id !== input.network_id || grant.plan_id !== input.plan.plan_id || grant.plan_revision !== input.plan.plan_revision || grant.task_id !== input.task_id || grant.assigned_node !== nodeAssignedNode(input.plan, input.node_id)) return blocked(event_id, 'capability-grant-binding-mismatch');
  if (grant.capabilities.some((capability) => !input.enrollment.capability_ceiling.includes(capability))) return blocked(event_id, 'capability-exceeds-enrollment');
  const grants = Array.isArray(context.task_grants) ? context.task_grants as Array<Record<string, unknown>> : [];
  const contextGrant = grants.find((candidate) => candidate.task_id === input.task_id && candidate.node_id === input.node_id);
  if (!contextGrant || contextGrant.grant_digest !== grant.grant_digest) return blocked(event_id, 'preflight-grant-binding-mismatch');
  const result = await input.stateStore.runAtomic((transaction) => {
    const existing = transaction.database.prepare('SELECT event_id, payload_json FROM state_events WHERE network_id = ? AND aggregate_type = ? AND aggregate_id = ? AND event_type = ?').get(input.network_id, 'orchestration-task', input.task_id, 'task.claimed') as { event_id: string; payload_json: string } | undefined;
    if (existing) return { status: 'duplicate' as const, current_revision: input.expected_revision, event_id: existing.event_id };
    const appended = transaction.appendEvent({ network_id: input.network_id, expected_revision: input.expected_revision, now: input.now, event: { event_id, aggregate_type: 'orchestration-task', aggregate_id: input.task_id, event_type: 'task.claimed', occurred_at: input.now, payload: { schema: ORCHESTRATION_TASK_CLAIM_SCHEMA, network_id: input.network_id, plan_id: input.plan.plan_id, plan_revision: input.plan.plan_revision, plan_digest: input.plan.plan_digest, task_id: input.task_id, node_id: input.node_id, grant_digest: grant.grant_digest, preflight_artifact_id: input.preflight_artifact_id } } });
    return appended.status === 'recorded' ? { status: 'claimed' as const, revision: appended.revision, current_revision: appended.current_revision, event_id } : { status: appended.status === 'duplicate' ? 'duplicate' as const : 'blocked' as const, current_revision: appended.current_revision, event_id, reason: appended.reason };
  });
  return { schema: ORCHESTRATION_TASK_CLAIM_SCHEMA, status: result.status, event_id: result.event_id, side_effects_executed: false, ...(result.revision === undefined ? {} : { revision: result.revision }), ...(result.current_revision === undefined ? {} : { current_revision: result.current_revision }), ...(result.reason === undefined ? {} : { reason: result.reason }) };
}

function nodeAssignedNode(plan: OrchestrationPlan, nodeId: string): string | undefined {
  return plan.nodes.find((node) => node.node_id === nodeId)?.assigned_node;
}

export { claimEventId as orchestrationTaskClaimEventId };
