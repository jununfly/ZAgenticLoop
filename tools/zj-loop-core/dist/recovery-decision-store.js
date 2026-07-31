import { createRecoveryDecision } from './recovery-decision.js';
function result(input) {
    return { schema: 'zj-loop.recovery_decision.v1', lifecycle_status: 'recovery-decision-recorded', side_effects_executed: false, ...input };
}
function eventId(decision) {
    return `recovery-decision:${decision.parent_execution_id}:${decision.decision_digest}`;
}
function payloadDecision(payload) {
    if (!payload || typeof payload !== 'object' || !('decision' in payload))
        return null;
    return structuredClone(payload.decision);
}
export async function persistRecoveryDecision(input) {
    const decision = createRecoveryDecision(input.decision);
    const outcome = await input.stateStore.runAtomic((transaction) => {
        const row = transaction.database.prepare("SELECT payload_json FROM state_events WHERE network_id = ? AND aggregate_type = 'recovery-decision' AND aggregate_id = ? AND event_type = 'recovery.decision-recorded' ORDER BY revision LIMIT 1").get(input.network_id, decision.parent_execution_id);
        if (row) {
            const current = payloadDecision(JSON.parse(row.payload_json));
            if (current?.decision_digest === decision.decision_digest)
                return { status: 'duplicate', current_decision: current, current_revision: input.expected_revision };
            return { status: 'conflict', current_decision: current ?? undefined, current_revision: input.expected_revision };
        }
        const appended = transaction.appendEvent({
            network_id: input.network_id,
            expected_revision: input.expected_revision,
            now: input.now,
            event: {
                event_id: eventId(decision),
                aggregate_type: 'recovery-decision',
                aggregate_id: decision.parent_execution_id,
                event_type: 'recovery.decision-recorded',
                occurred_at: input.now,
                payload: { schema: 'zj-loop.recovery_decision.v1', decision },
            },
        });
        if (appended.status !== 'recorded')
            return { status: 'conflict', current_revision: appended.current_revision };
        return { status: 'accepted', decision, state_revision: appended.revision, current_revision: appended.current_revision };
    });
    return result(outcome);
}
