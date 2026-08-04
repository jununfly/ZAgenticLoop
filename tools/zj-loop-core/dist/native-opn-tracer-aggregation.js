import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
export const NATIVE_OPN_TRACER_AGGREGATION_SCHEMA = 'zj-loop.native_opn_tracer_aggregation.v1';
export const NATIVE_OPN_TRACER_AGGREGATION_RECORDED_SCHEMA = 'zj-loop.native_opn_tracer_aggregation_recorded.v1';
function text(value) { return typeof value === 'string' && value.length > 0; }
function digest(value) { return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value); }
function commit(value) { return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value); }
function mergeAuthorizationValid(value) {
    return commit(value.source_commit_sha) && text(value.target_ref) && text(value.target_worktree_ref) && value.strategy === 'fast-forward-only' && digest(value.scope_digest) && digest(value.deterministic_gate_digest);
}
function graphValid(graph, executionIds) {
    if (!['human', 'human+agent'].includes(graph.responsibility_unit) || !text(graph.human_id) || graph.lifecycle_status !== 'review-pending')
        return false;
    if (!Array.isArray(graph.execution_bindings) || graph.execution_bindings.length !== executionIds.length)
        return false;
    const bindingIds = new Set(graph.execution_bindings.map((binding) => binding.execution_id));
    if (bindingIds.size !== executionIds.length || executionIds.some((executionId) => !bindingIds.has(executionId)))
        return false;
    if (graph.execution_bindings.some((binding) => !text(binding.execution_id) || !text(binding.node_id) || !text(binding.task_id) || !commit(binding.commit_sha) || !text(binding.worktree_ref)))
        return false;
    const nodeIds = new Set(graph.execution_bindings.map((binding) => binding.node_id));
    const worktrees = new Set(graph.execution_bindings.map((binding) => binding.worktree_ref));
    if (nodeIds.size !== graph.execution_bindings.length || worktrees.size !== graph.execution_bindings.length)
        return false;
    if (!Array.isArray(graph.resource_isolation) || graph.resource_isolation.length !== graph.execution_bindings.length)
        return false;
    const isolatedNodes = new Set(graph.resource_isolation.map((isolation) => isolation.node_id));
    return isolatedNodes.size === graph.resource_isolation.length && graph.resource_isolation.every((isolation) => nodeIds.has(isolation.node_id) && text(isolation.resource_id) && text(isolation.strategy) && text(isolation.isolation_ref)) && (graph.merge_authorization === undefined || mergeAuthorizationValid(graph.merge_authorization));
}
function unsigned(aggregation) { const { aggregation_digest: _, ...value } = aggregation; return value; }
function aggregationDigest(aggregation) { const json = canonicalize(unsigned(aggregation)); if (typeof json !== 'string')
    throw new Error('native-opn-tracer-aggregation-canonicalization-invalid'); return `sha256:${createHash('sha256').update(json).digest('hex')}`; }
function scopeId(aggregation) { return [aggregation.network_id, aggregation.event_id, aggregation.plan_id, aggregation.plan_revision, aggregation.aggregation_id].join(':'); }
function eventId(aggregation) { return `native-opn-tracer-aggregation-recorded:${scopeId(aggregation)}:${aggregation.aggregation_digest}`; }
export function createNativeOpnTracerAggregation(input) {
    if (!text(input.network_id) || !text(input.event_id) || !text(input.plan_id) || !Number.isInteger(input.plan_revision) || input.plan_revision < 1 || !digest(input.plan_digest) || !text(input.aggregation_id) || !Array.isArray(input.execution_ids) || input.execution_ids.length < 2 || !input.execution_ids.every(text) || new Set(input.execution_ids).size !== input.execution_ids.length || !Array.isArray(input.input_evidence_digests) || !input.input_evidence_digests.every(digest) || !digest(input.output_evidence_digest) || !text(input.aggregated_at))
        throw new Error('native-opn-tracer-aggregation-invalid');
    if (input.graph !== undefined && !graphValid(input.graph, input.execution_ids))
        throw new Error('native-opn-tracer-aggregation-graph-invalid');
    const value = { schema: NATIVE_OPN_TRACER_AGGREGATION_SCHEMA, ...input, status: 'passed', execution_ids: [...input.execution_ids].sort(), input_evidence_digests: [...new Set(input.input_evidence_digests)].sort(), side_effects_executed: false, aggregation_digest: '' };
    value.aggregation_digest = aggregationDigest(value);
    return value;
}
export function nativeOpnTracerAggregationDigest(aggregation) { return aggregationDigest(aggregation); }
export async function recordNativeOpnTracerAggregation(input) {
    const aggregation = input.aggregation;
    const event_id = eventId(aggregation);
    if (nativeOpnTracerAggregationDigest(aggregation) !== aggregation.aggregation_digest)
        return { schema: NATIVE_OPN_TRACER_AGGREGATION_RECORDED_SCHEMA, status: 'blocked', event_id, side_effects_executed: false, reason: 'native-opn-tracer-aggregation-digest-invalid' };
    const aggregate_id = scopeId(aggregation);
    const result = await input.stateStore.runAtomic((transaction) => {
        const rows = transaction.database.prepare("SELECT payload_json FROM state_events WHERE network_id = ? AND aggregate_type = 'native-opn-tracer-execution' AND event_type = 'native-opn-tracer.execution.recorded'").all(aggregation.network_id);
        const executions = new Map(rows.map((row) => { const execution = JSON.parse(row.payload_json).execution; return [execution?.execution_id, execution]; }));
        const selected = aggregation.execution_ids.map((executionId) => executions.get(executionId));
        if (selected.some((execution) => !execution || execution.event_id !== aggregation.event_id || execution.plan_id !== aggregation.plan_id || execution.plan_revision !== aggregation.plan_revision || execution.plan_digest !== aggregation.plan_digest || execution.status !== 'succeeded'))
            return { status: 'blocked', event_id, current_revision: input.expected_revision, reason: 'aggregation-execution-not-ready' };
        const outputs = new Set(selected.map((execution) => execution?.output_evidence_digest).filter(digest));
        if (aggregation.input_evidence_digests.some((item) => !outputs.has(item)))
            return { status: 'blocked', event_id, current_revision: input.expected_revision, reason: 'aggregation-input-not-produced' };
        const existing = transaction.database.prepare("SELECT event_id, payload_json FROM state_events WHERE network_id = ? AND aggregate_type = 'native-opn-tracer-aggregation' AND aggregate_id = ? AND event_type = 'native-opn-tracer.aggregation.recorded'").get(aggregation.network_id, aggregate_id);
        if (existing) {
            const payload = JSON.parse(existing.payload_json);
            return payload.aggregation?.aggregation_digest === aggregation.aggregation_digest && existing.event_id === event_id
                ? { status: 'duplicate', event_id: existing.event_id, current_revision: input.expected_revision }
                : { status: 'conflict', event_id, current_revision: input.expected_revision, reason: 'native-opn-tracer-aggregation-conflict' };
        }
        const appended = transaction.appendEvent({ network_id: aggregation.network_id, expected_revision: input.expected_revision, now: input.now, event: { event_id, aggregate_type: 'native-opn-tracer-aggregation', aggregate_id, event_type: 'native-opn-tracer.aggregation.recorded', occurred_at: aggregation.aggregated_at, payload: { schema: NATIVE_OPN_TRACER_AGGREGATION_RECORDED_SCHEMA, aggregation } } });
        return appended.status === 'recorded' ? { status: 'recorded', event_id, revision: appended.revision, current_revision: appended.current_revision } : { status: appended.status === 'duplicate' ? 'duplicate' : 'conflict', event_id, current_revision: appended.current_revision, reason: appended.reason };
    });
    return { schema: NATIVE_OPN_TRACER_AGGREGATION_RECORDED_SCHEMA, ...result, side_effects_executed: false };
}
