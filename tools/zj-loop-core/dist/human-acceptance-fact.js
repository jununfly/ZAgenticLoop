import { validateHumanAcceptance } from './human-acceptance.js';
export const HUMAN_ACCEPTANCE_RECORDED_SCHEMA = 'zj-loop.human_acceptance_recorded.v1';
function eventId(acceptance) {
    return `human-acceptance-recorded:${acceptance.event_id}:${acceptance.canonical_payload_digest}`;
}
export async function recordHumanAcceptance(input) {
    const acceptance = input.acceptance;
    const event_id = eventId(acceptance);
    const validation = validateHumanAcceptance({ acceptance, identity: input.identity, handoff: input.handoff, now: input.now });
    if (validation.status === 'blocked')
        return { schema: HUMAN_ACCEPTANCE_RECORDED_SCHEMA, status: 'blocked', event_id, side_effects_executed: false, reason: validation.errors.join(',') || 'human-acceptance-invalid' };
    const result = await input.stateStore.runAtomic((transaction) => {
        const existing = transaction.database.prepare("SELECT event_id, payload_json FROM state_events WHERE network_id = ? AND aggregate_type = 'human-acceptance' AND aggregate_id = ? AND event_type = 'human-acceptance.accepted' ORDER BY revision LIMIT 1").get(acceptance.network_id, acceptance.event_id);
        if (existing) {
            const payload = JSON.parse(existing.payload_json);
            return payload.acceptance?.canonical_payload_digest === acceptance.canonical_payload_digest && existing.event_id === event_id
                ? { status: 'duplicate', event_id: existing.event_id, current_revision: input.expected_revision }
                : { status: 'conflict', event_id, current_revision: input.expected_revision, reason: 'human-acceptance-event-already-accepted' };
        }
        const appended = transaction.appendEvent({
            network_id: acceptance.network_id,
            expected_revision: input.expected_revision,
            now: input.now,
            event: {
                event_id,
                aggregate_type: 'human-acceptance',
                aggregate_id: acceptance.event_id,
                event_type: 'human-acceptance.accepted',
                occurred_at: acceptance.accepted_at,
                payload: { schema: HUMAN_ACCEPTANCE_RECORDED_SCHEMA, acceptance },
            },
        });
        return appended.status === 'recorded'
            ? { status: 'recorded', event_id, revision: appended.revision, current_revision: appended.current_revision }
            : { status: appended.status === 'duplicate' ? 'duplicate' : 'conflict', event_id, current_revision: appended.current_revision, reason: appended.reason };
    });
    return { schema: HUMAN_ACCEPTANCE_RECORDED_SCHEMA, ...result, side_effects_executed: false };
}
