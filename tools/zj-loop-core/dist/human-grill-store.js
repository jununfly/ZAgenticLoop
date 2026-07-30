import { createHumanGrill, createHumanGrillCoordinator } from './human-grill.js';
function eventId(grill, decision) {
    return `human-grill-decision:${grill.grill_id}:${decision.decision_digest}`;
}
function result(input) {
    return { schema: 'zj-loop.human_grill_decision.v1', lifecycle_status: 'decision-recorded', side_effects_executed: false, ...input };
}
function readDecision(payload) {
    if (!payload || typeof payload !== 'object' || !('decision' in payload))
        return null;
    return structuredClone(payload.decision);
}
export async function persistHumanGrillDecision(input) {
    const grill = createHumanGrill(input.grill);
    const coordinator = createHumanGrillCoordinator({ grill });
    const normalized = coordinator.submitDecision(input.decision);
    if (normalized.status === 'stale-decision')
        return result({ status: normalized.status, current_revision: input.expected_revision });
    const decision = normalized.decision ?? normalized.current_decision;
    if (!decision)
        throw new Error('human-grill-decision-missing');
    const id = eventId(grill, decision);
    const outcome = await input.stateStore.runAtomic((transaction) => {
        const rows = transaction.database.prepare("SELECT payload_json FROM state_events WHERE network_id = ? AND aggregate_type = 'human-grill' AND aggregate_id = ? AND event_type = 'human-grill.decision-recorded' ORDER BY revision LIMIT 1").get(input.network_id, grill.grill_id);
        if (rows) {
            const current = readDecision(JSON.parse(rows.payload_json));
            if (current?.decision_digest === decision.decision_digest)
                return { status: 'duplicate', current_decision: current, current_revision: input.expected_revision };
            return { status: 'conflict', current_decision: current ?? undefined, current_revision: input.expected_revision };
        }
        const appended = transaction.appendEvent({
            network_id: input.network_id,
            expected_revision: input.expected_revision,
            now: input.now,
            event: {
                event_id: id,
                aggregate_type: 'human-grill',
                aggregate_id: grill.grill_id,
                event_type: 'human-grill.decision-recorded',
                occurred_at: input.now,
                payload: { schema: 'zj-loop.human_grill_decision.v1', grill, decision },
            },
        });
        if (appended.status !== 'recorded')
            return { status: 'conflict', current_revision: appended.current_revision };
        return { status: 'accepted', decision, state_revision: appended.revision, current_revision: appended.current_revision };
    });
    return result(outcome);
}
