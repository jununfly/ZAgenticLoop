export const TASK_DISPATCHED_SCHEMA = 'zj-loop.task_dispatched.v1';
export async function recordTaskDispatched(input) {
    const event_id = input.intent.dispatch_event_id;
    if (input.gate.status !== 'dispatch-ready' || input.gate.intent_digest !== input.intent.intent_digest)
        return { schema: TASK_DISPATCHED_SCHEMA, status: 'blocked', event_id, side_effects_executed: false, reason: 'dispatch-gate-not-ready' };
    const result = await input.stateStore.runAtomic((transaction) => {
        const rows = transaction.database.prepare('SELECT event_id, payload_json FROM state_events WHERE network_id = ? AND aggregate_type = ? AND aggregate_id = ? AND event_type = ?').all(input.network_id, 'orchestration-task', input.intent.task_id, 'task.dispatched');
        for (const row of rows) {
            const payload = JSON.parse(row.payload_json);
            if (payload.intent_digest === input.intent.intent_digest && row.event_id === event_id)
                return { status: 'duplicate', event_id: row.event_id, current_revision: input.expected_revision };
            return { status: 'conflict', event_id, current_revision: input.expected_revision, reason: 'task-already-dispatched-with-different-intent' };
        }
        const appended = transaction.appendEvent({ network_id: input.network_id, expected_revision: input.expected_revision, now: input.now, event: { event_id, aggregate_type: 'orchestration-task', aggregate_id: input.intent.task_id, event_type: 'task.dispatched', occurred_at: input.now, payload: { schema: TASK_DISPATCHED_SCHEMA, network_id: input.network_id, plan_id: input.intent.plan_id, plan_revision: input.intent.plan_revision, plan_digest: input.intent.plan_digest, task_id: input.intent.task_id, node_id: input.intent.node_id, assigned_node: input.intent.assigned_node, grant_digest: input.intent.grant_digest, intent_digest: input.intent.intent_digest, claim_event_id: input.intent.claim_event_id, dispatch_event_id: event_id, authorized_by: input.intent.authorized_by, side_effects_executed: false } } });
        return appended.status === 'recorded' ? { status: 'recorded', event_id, revision: appended.revision, current_revision: appended.current_revision } : { status: appended.status === 'duplicate' ? 'duplicate' : 'conflict', event_id, current_revision: appended.current_revision, reason: appended.reason };
    });
    return { schema: TASK_DISPATCHED_SCHEMA, ...result, side_effects_executed: false };
}
