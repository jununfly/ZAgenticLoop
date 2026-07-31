import { nativeOpnTracerEvidenceDigest } from './native-opn-tracer.js';
export const NATIVE_OPN_TRACER_EVIDENCE_RECORDED_SCHEMA = 'zj-loop.native_opn_tracer_evidence_recorded.v1';
function scopeId(evidence) {
    return [evidence.network_id, evidence.event_id, evidence.plan.plan_id, evidence.plan.plan_revision].join(':');
}
function eventId(evidence) {
    return `native-opn-tracer-evidence-recorded:${scopeId(evidence)}:${evidence.evidence_digest}`;
}
export async function recordNativeOpnTracerEvidence(input) {
    const evidence = input.evidence;
    const event_id = eventId(evidence);
    if (nativeOpnTracerEvidenceDigest(evidence) !== evidence.evidence_digest)
        return { schema: NATIVE_OPN_TRACER_EVIDENCE_RECORDED_SCHEMA, status: 'blocked', event_id, side_effects_executed: false, reason: 'native-opn-tracer-evidence-digest-invalid' };
    const aggregate_id = scopeId(evidence);
    const result = await input.stateStore.runAtomic((transaction) => {
        const row = transaction.database.prepare("SELECT event_id, payload_json FROM state_events WHERE network_id = ? AND aggregate_type = 'native-opn-tracer' AND aggregate_id = ? AND event_type = 'native-opn-tracer.evidence.recorded' ORDER BY revision LIMIT 1").get(evidence.network_id, aggregate_id);
        if (row) {
            const payload = JSON.parse(row.payload_json);
            return payload.evidence?.evidence_digest === evidence.evidence_digest && row.event_id === event_id
                ? { status: 'duplicate', event_id: row.event_id, current_revision: input.expected_revision }
                : { status: 'conflict', event_id, current_revision: input.expected_revision, reason: 'native-opn-tracer-evidence-conflict' };
        }
        const appended = transaction.appendEvent({
            network_id: evidence.network_id,
            expected_revision: input.expected_revision,
            now: input.now,
            event: {
                event_id,
                aggregate_type: 'native-opn-tracer',
                aggregate_id,
                event_type: 'native-opn-tracer.evidence.recorded',
                occurred_at: evidence.created_at,
                payload: { schema: NATIVE_OPN_TRACER_EVIDENCE_RECORDED_SCHEMA, evidence },
            },
        });
        return appended.status === 'recorded'
            ? { status: 'recorded', event_id, revision: appended.revision, current_revision: appended.current_revision }
            : { status: appended.status === 'duplicate' ? 'duplicate' : 'conflict', event_id, current_revision: appended.current_revision, reason: appended.reason };
    });
    return { schema: NATIVE_OPN_TRACER_EVIDENCE_RECORDED_SCHEMA, ...result, side_effects_executed: false };
}
