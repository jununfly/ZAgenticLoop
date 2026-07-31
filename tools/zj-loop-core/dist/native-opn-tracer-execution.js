import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
export const NATIVE_OPN_TRACER_EXECUTION_SCHEMA = 'zj-loop.native_opn_tracer_execution.v1';
export const NATIVE_OPN_TRACER_EXECUTION_RECORDED_SCHEMA = 'zj-loop.native_opn_tracer_execution_recorded.v1';
function text(value) { return typeof value === 'string' && value.length > 0; }
function digest(value) { return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value); }
function unsigned(execution) {
    const { execution_digest: _, ...value } = execution;
    return value;
}
function executionDigest(execution) {
    const json = canonicalize(unsigned(execution));
    if (typeof json !== 'string')
        throw new Error('native-opn-tracer-execution-canonicalization-invalid');
    return `sha256:${createHash('sha256').update(json).digest('hex')}`;
}
function scopeId(execution) { return [execution.network_id, execution.event_id, execution.plan_id, execution.plan_revision, execution.execution_id, execution.task_id, execution.node_id].join(':'); }
function eventId(execution) { return `native-opn-tracer-execution-recorded:${scopeId(execution)}:${execution.execution_digest}`; }
export function createNativeOpnTracerExecution(input) {
    if (!text(input.network_id) || !text(input.event_id) || !text(input.plan_id) || !Number.isInteger(input.plan_revision) || input.plan_revision < 1 || !digest(input.plan_digest) || !text(input.node_id) || !text(input.task_id) || !text(input.execution_id) || !text(input.assigned_node) || !['succeeded', 'blocked'].includes(input.status) || !Array.isArray(input.input_evidence_digests) || !input.input_evidence_digests.every(digest) || !text(input.recorded_at))
        throw new Error('native-opn-tracer-execution-invalid');
    if (input.status === 'succeeded' && !digest(input.output_evidence_digest))
        throw new Error('native-opn-tracer-execution-output-required');
    if (input.status === 'blocked' && input.output_evidence_digest !== undefined)
        throw new Error('native-opn-tracer-execution-blocked-output-invalid');
    const value = { schema: NATIVE_OPN_TRACER_EXECUTION_SCHEMA, ...input, input_evidence_digests: [...new Set(input.input_evidence_digests)].sort(), side_effects_executed: false, execution_digest: '' };
    value.execution_digest = executionDigest(value);
    return value;
}
export function nativeOpnTracerExecutionDigest(execution) { return executionDigest(execution); }
export async function recordNativeOpnTracerExecution(input) {
    const execution = input.execution;
    const event_id = eventId(execution);
    if (nativeOpnTracerExecutionDigest(execution) !== execution.execution_digest)
        return { schema: NATIVE_OPN_TRACER_EXECUTION_RECORDED_SCHEMA, status: 'blocked', event_id, side_effects_executed: false, reason: 'native-opn-tracer-execution-digest-invalid' };
    const aggregate_id = scopeId(execution);
    const result = await input.stateStore.runAtomic((transaction) => {
        if (execution.input_evidence_digests.length > 0) {
            const rows = transaction.database.prepare("SELECT payload_json FROM state_events WHERE network_id = ? AND aggregate_type = 'native-opn-tracer-execution' AND event_type = 'native-opn-tracer.execution.recorded'").all(execution.network_id);
            const outputs = new Set(rows.map((row) => JSON.parse(row.payload_json).execution?.output_evidence_digest).filter(digest));
            if (execution.input_evidence_digests.some((item) => !outputs.has(item)))
                return { status: 'blocked', event_id, current_revision: input.expected_revision, reason: 'dependency-evidence-not-recorded' };
        }
        const existing = transaction.database.prepare("SELECT event_id, payload_json FROM state_events WHERE network_id = ? AND aggregate_type = 'native-opn-tracer-execution' AND aggregate_id = ? AND event_type = 'native-opn-tracer.execution.recorded'").get(execution.network_id, aggregate_id);
        if (existing) {
            const payload = JSON.parse(existing.payload_json);
            return payload.execution?.execution_digest === execution.execution_digest && existing.event_id === event_id
                ? { status: 'duplicate', event_id: existing.event_id, current_revision: input.expected_revision }
                : { status: 'conflict', event_id, current_revision: input.expected_revision, reason: 'native-opn-tracer-execution-conflict' };
        }
        const appended = transaction.appendEvent({ network_id: execution.network_id, expected_revision: input.expected_revision, now: input.now, event: { event_id, aggregate_type: 'native-opn-tracer-execution', aggregate_id, event_type: 'native-opn-tracer.execution.recorded', occurred_at: execution.recorded_at, payload: { schema: NATIVE_OPN_TRACER_EXECUTION_RECORDED_SCHEMA, execution } } });
        return appended.status === 'recorded' ? { status: 'recorded', event_id, revision: appended.revision, current_revision: appended.current_revision } : { status: appended.status === 'duplicate' ? 'duplicate' : 'conflict', event_id, current_revision: appended.current_revision, reason: appended.reason };
    });
    return { schema: NATIVE_OPN_TRACER_EXECUTION_RECORDED_SCHEMA, ...result, side_effects_executed: false };
}
