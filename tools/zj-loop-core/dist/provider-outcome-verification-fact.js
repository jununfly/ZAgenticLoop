import { validateProviderOutcomeVerification } from './provider-outcome-verification.js';
export const PROVIDER_VERIFICATION_RECORDED_SCHEMA = 'zj-loop.provider_verification_recorded.v1';
function aggregateId(value) { return [value.network_id, value.event_id, value.plan_id, value.plan_revision, value.execution_id, value.task_id, value.outcome_digest].join(':'); }
function eventId(value) { return `provider-verification-recorded:${aggregateId(value)}:${value.verification_digest}`; }
export async function recordProviderOutcomeVerification(input) {
    const verification = input.verification;
    const event_id = eventId(verification);
    if (validateProviderOutcomeVerification(verification).status === 'blocked')
        return { schema: PROVIDER_VERIFICATION_RECORDED_SCHEMA, status: 'blocked', event_id, side_effects_executed: false, reason: 'provider-verification-invalid' };
    const aggregate_id = aggregateId(verification);
    const event_type = verification.status === 'passed' ? 'verification.passed' : 'verification.failed';
    const result = await input.stateStore.runAtomic((transaction) => {
        const rows = transaction.database.prepare("SELECT event_id, event_type, payload_json FROM state_events WHERE network_id = ? AND aggregate_type = 'provider-verification' AND aggregate_id = ? AND event_type IN ('verification.passed', 'verification.failed')").all(verification.network_id, aggregate_id);
        if (rows.length > 0) {
            const existing = JSON.parse(rows[0].payload_json);
            return existing.verification?.verification_digest === verification.verification_digest && rows[0].event_id === event_id && rows[0].event_type === event_type
                ? { status: 'duplicate', event_id: rows[0].event_id, current_revision: input.expected_revision }
                : { status: 'conflict', event_id, current_revision: input.expected_revision, reason: 'provider-verification-conflict' };
        }
        const appended = transaction.appendEvent({ network_id: verification.network_id, expected_revision: input.expected_revision, now: input.now, event: { event_id, aggregate_type: 'provider-verification', aggregate_id, event_type, occurred_at: verification.checked_at, payload: { schema: PROVIDER_VERIFICATION_RECORDED_SCHEMA, verification } } });
        return appended.status === 'recorded' ? { status: 'recorded', event_id, revision: appended.revision, current_revision: appended.current_revision } : { status: appended.status === 'duplicate' ? 'duplicate' : 'conflict', event_id, current_revision: appended.current_revision, reason: appended.reason };
    });
    return { schema: PROVIDER_VERIFICATION_RECORDED_SCHEMA, ...result, side_effects_executed: false };
}
