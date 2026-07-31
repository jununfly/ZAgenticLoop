import { validateReviewHandoff } from './review-handoff.js';
export const REVIEW_HANDOFF_RECORDED_SCHEMA = 'zj-loop.review_handoff_recorded.v1';
function scopeId(handoff) {
    return [handoff.network_id, handoff.event_id, handoff.plan_id, handoff.plan_revision, handoff.execution_id, handoff.task_id, handoff.outcome_digest].join(':');
}
function eventId(handoff) {
    return `review-handoff-recorded:${scopeId(handoff)}:${handoff.handoff_digest}`;
}
export async function recordReviewHandoff(input) {
    const handoff = input.handoff;
    const event_id = eventId(handoff);
    if (validateReviewHandoff(handoff).status === 'blocked') {
        return { schema: REVIEW_HANDOFF_RECORDED_SCHEMA, status: 'blocked', event_id, side_effects_executed: false, reason: 'review-handoff-invalid' };
    }
    const aggregate_id = scopeId(handoff);
    const result = await input.stateStore.runAtomic((transaction) => {
        const rows = transaction.database.prepare("SELECT event_id, payload_json FROM state_events WHERE network_id = ? AND aggregate_type = 'review-handoff' AND aggregate_id = ? AND event_type IN ('review-handoff.accepted', 'review-handoff.blocked') ORDER BY revision LIMIT 1").all(handoff.network_id, aggregate_id);
        if (rows.length > 0) {
            const payload = JSON.parse(rows[0].payload_json);
            return payload.handoff?.handoff_digest === handoff.handoff_digest && rows[0].event_id === event_id
                ? { status: 'duplicate', event_id: rows[0].event_id, current_revision: input.expected_revision }
                : { status: 'conflict', event_id, current_revision: input.expected_revision, reason: 'review-handoff-conflict' };
        }
        const appended = transaction.appendEvent({
            network_id: handoff.network_id,
            expected_revision: input.expected_revision,
            now: input.now,
            event: {
                event_id,
                aggregate_type: 'review-handoff',
                aggregate_id,
                event_type: handoff.status === 'accepted' ? 'review-handoff.accepted' : 'review-handoff.blocked',
                occurred_at: handoff.accepted_at,
                payload: { schema: REVIEW_HANDOFF_RECORDED_SCHEMA, handoff },
            },
        });
        return appended.status === 'recorded'
            ? { status: 'recorded', event_id, revision: appended.revision, current_revision: appended.current_revision }
            : { status: appended.status === 'duplicate' ? 'duplicate' : 'conflict', event_id, current_revision: appended.current_revision, reason: appended.reason };
    });
    return { schema: REVIEW_HANDOFF_RECORDED_SCHEMA, ...result, side_effects_executed: false };
}
