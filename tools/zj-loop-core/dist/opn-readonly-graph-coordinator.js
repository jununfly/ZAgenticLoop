import { validateOpnReadOnlyGraphVerificationResult } from './opn-readonly-graph-verification.js';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
export async function receiveOpnReadOnlyGraphVerificationResult(input) {
    const envelope = await input.transport.receive({ session_id: input.session_id });
    if (!envelope)
        return { status: 'empty', side_effects_executed: false };
    const blocked = (reason) => ({ status: 'blocked', message_id: envelope.message_id, reason, side_effects_executed: false });
    if (envelope.target_node_id !== input.coordinator_id || envelope.notification_kind !== 'graph.verification.result' || envelope.artifact_refs.length < 1)
        return blocked('opn-read-only-graph-verification-result-envelope-invalid');
    const resultRef = envelope.artifact_refs[0].artifact_id;
    if (!DIGEST.test(resultRef) || envelope.artifact_refs[0].content_sha256 !== resultRef)
        return blocked('opn-read-only-graph-verification-result-artifact-ref-invalid');
    let result;
    try {
        const bytes = await input.downloadArtifact(resultRef);
        const stored = await input.artifact_store.put({ bytes, file_name: `${envelope.task_id}-verification-result.json`, media_type: 'application/json', expected_digest: resultRef });
        if (stored.metadata.artifact_id !== resultRef)
            return blocked('opn-read-only-graph-verification-result-artifact-binding-invalid');
        const parsed = JSON.parse(bytes.toString('utf8'));
        const validation = validateOpnReadOnlyGraphVerificationResult(parsed);
        if (validation.status === 'blocked')
            return blocked(validation.reason);
        result = parsed;
    }
    catch (error) {
        return blocked(error instanceof Error ? error.message : 'opn-read-only-graph-verification-result-unavailable');
    }
    const expected = input.expected;
    if (result.graph_id !== expected.graph_id || result.network_id !== expected.network_id || result.plan_id !== expected.plan_id || result.plan_revision !== expected.plan_revision || result.task_id !== expected.task_id || result.plan_digest !== expected.plan_digest || result.source_evidence_ref !== expected.source_evidence_ref || result.verifier_node_id !== expected.verifier_node_id || envelope.network_id !== expected.network_id || envelope.plan_id !== expected.plan_id || envelope.plan_revision !== expected.plan_revision || envelope.task_id !== expected.task_id || envelope.from_node_id !== expected.verifier_node_id)
        return blocked('opn-read-only-graph-verification-result-scope-mismatch');
    const event = { event_id: `graph-verification-result:${envelope.message_id}`, aggregate_type: 'opn-readonly-graph', aggregate_id: expected.task_id, event_type: 'graph.verification.result.received', occurred_at: envelope.created_at, payload: { schema: 'zj-loop.opn_read_only_graph_verification_received.v1', message_id: envelope.message_id, envelope_digest: envelope.envelope_digest, result_artifact_ref: resultRef, result, side_effects_executed: false } };
    const append = await input.state_store.appendEvent({ network_id: expected.network_id, expected_revision: await input.state_store.getRevision(expected.network_id), event });
    if (append.status === 'conflict')
        return blocked('opn-read-only-graph-verification-result-state-conflict');
    await input.transport.acknowledge({ session_id: input.session_id, message_id: envelope.message_id, envelope_digest: envelope.envelope_digest });
    return { status: append.status === 'duplicate' ? 'duplicate' : 'recorded', message_id: envelope.message_id, result, side_effects_executed: false };
}
