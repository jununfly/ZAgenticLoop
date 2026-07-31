import { parseBoundedJson } from './parse-bounded-json.js';
import { orchestrationCapabilityGrantDigest } from './orchestration-preflight.js';
export const ORCHESTRATION_TASK_CLAIM_SCHEMA = 'zj-loop.orchestration_task_claim.v1';
function claimIdentity(input) {
    return [input.network_id, input.event_id, input.plan_id, input.plan_revision, input.execution_id, input.task_id, input.node_id].join(':');
}
function claimEventId(input) {
    return `orchestration-task-claimed:${claimIdentity(input)}`;
}
function blocked(event_id, reason) { return { schema: ORCHESTRATION_TASK_CLAIM_SCHEMA, status: 'blocked', event_id, side_effects_executed: false, reason }; }
export async function claimOrchestrationTask(input) {
    const event_id = claimEventId({ network_id: input.network_id, event_id: input.plan.event_id, plan_id: input.plan.plan_id, plan_revision: input.plan.plan_revision, execution_id: input.execution_id, task_id: input.task_id, node_id: input.node_id });
    const aggregate_id = claimIdentity({ network_id: input.network_id, event_id: input.plan.event_id, plan_id: input.plan.plan_id, plan_revision: input.plan.plan_revision, execution_id: input.execution_id, task_id: input.task_id, node_id: input.node_id });
    let artifact;
    try {
        artifact = await input.artifactStore.readArtifact({ network_id: input.network_id, artifact_id: input.preflight_artifact_id });
    }
    catch {
        return blocked(event_id, 'preflight-artifact-unavailable');
    }
    let context;
    try {
        context = parseBoundedJson(artifact.content);
    }
    catch {
        return blocked(event_id, 'preflight-artifact-invalid');
    }
    if (context.schema !== 'zj-loop.orchestration_preflight.v1' || context.status !== 'execution-ready' || context.side_effects_executed !== false)
        return blocked(event_id, 'preflight-not-execution-ready');
    if (context.network_id !== input.network_id || context.plan_id !== input.plan.plan_id || context.plan_revision !== input.plan.plan_revision || context.plan_digest !== input.plan.plan_digest)
        return blocked(event_id, 'preflight-plan-binding-mismatch');
    if (typeof context.expires_at !== 'string' || Date.parse(input.now) >= Date.parse(context.expires_at))
        return blocked(event_id, 'preflight-expired');
    if (input.enrollment.node_id !== nodeAssignedNode(input.plan, input.node_id) || input.enrollment.network_id !== input.network_id || input.enrollment.status !== 'approved')
        return blocked(event_id, 'enrollment-not-execution-ready');
    const node = input.plan.nodes.find((candidate) => candidate.node_id === input.node_id);
    if (!node || node.task.task_id !== input.task_id)
        return blocked(event_id, 'task-node-binding-mismatch');
    const grant = node.task.capability_grant;
    if (grant.grant_digest !== orchestrationCapabilityGrantDigest(grant))
        return blocked(event_id, 'capability-grant-digest-invalid');
    if (grant.network_id !== input.network_id || grant.plan_id !== input.plan.plan_id || grant.plan_revision !== input.plan.plan_revision || grant.task_id !== input.task_id || grant.assigned_node !== nodeAssignedNode(input.plan, input.node_id))
        return blocked(event_id, 'capability-grant-binding-mismatch');
    if (grant.capabilities.some((capability) => !input.enrollment.capability_ceiling.includes(capability)))
        return blocked(event_id, 'capability-exceeds-enrollment');
    const grants = Array.isArray(context.task_grants) ? context.task_grants : [];
    const contextGrant = grants.find((candidate) => candidate.task_id === input.task_id && candidate.node_id === input.node_id);
    if (!contextGrant || contextGrant.grant_digest !== grant.grant_digest)
        return blocked(event_id, 'preflight-grant-binding-mismatch');
    const result = await input.stateStore.runAtomic((transaction) => {
        const existing = transaction.database.prepare('SELECT event_id, payload_json FROM state_events WHERE network_id = ? AND aggregate_type = ? AND aggregate_id = ? AND event_type = ?').get(input.network_id, 'orchestration-task', aggregate_id, 'task.claimed');
        if (existing)
            return { status: 'duplicate', current_revision: input.expected_revision, event_id: existing.event_id };
        const appended = transaction.appendEvent({ network_id: input.network_id, expected_revision: input.expected_revision, now: input.now, event: { event_id, aggregate_type: 'orchestration-task', aggregate_id, event_type: 'task.claimed', occurred_at: input.now, payload: { schema: ORCHESTRATION_TASK_CLAIM_SCHEMA, network_id: input.network_id, event_id: input.plan.event_id, plan_id: input.plan.plan_id, plan_revision: input.plan.plan_revision, execution_id: input.execution_id, plan_digest: input.plan.plan_digest, task_id: input.task_id, node_id: input.node_id, grant_digest: grant.grant_digest, preflight_artifact_id: input.preflight_artifact_id } } });
        return appended.status === 'recorded' ? { status: 'claimed', revision: appended.revision, current_revision: appended.current_revision, event_id } : { status: appended.status === 'duplicate' ? 'duplicate' : 'blocked', current_revision: appended.current_revision, event_id, reason: appended.reason };
    });
    return { schema: ORCHESTRATION_TASK_CLAIM_SCHEMA, status: result.status, event_id: result.event_id, side_effects_executed: false, ...(result.revision === undefined ? {} : { revision: result.revision }), ...(result.current_revision === undefined ? {} : { current_revision: result.current_revision }), ...(result.reason === undefined ? {} : { reason: result.reason }) };
}
function nodeAssignedNode(plan, nodeId) {
    return plan.nodes.find((node) => node.node_id === nodeId)?.assigned_node;
}
export { claimEventId as orchestrationTaskClaimEventId, claimIdentity as orchestrationTaskClaimIdentity };
