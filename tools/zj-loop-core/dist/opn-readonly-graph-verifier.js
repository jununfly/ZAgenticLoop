import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';
import { createOpnReadOnlyGraphVerificationResult } from './opn-readonly-graph-verification.js';
import { createTransportEnvelope } from './transport-contract.js';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const SOURCE_SCHEMA = 'zj-loop.opn_read_only_graph_source_evidence.v1';
function canonical(value) {
    const result = canonicalize(value);
    if (typeof result !== 'string')
        throw new Error('opn-read-only-graph-verifier-canonicalization-invalid');
    return result;
}
function digest(value) { return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`; }
function bytesDigest(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function text(value) { return typeof value === 'string' && value.trim() !== '' && !value.includes('\0'); }
function sourceEvidence(value, artifact_id) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('opn-read-only-graph-source-evidence-invalid');
    const item = value;
    if (item.schema !== SOURCE_SCHEMA || !text(item.graph_id) || !text(item.plan_digest) || !DIGEST.test(item.plan_digest) || !text(item.task_id) || !text(item.node_id) || !text(item.snapshot_digest) || !DIGEST.test(item.snapshot_digest) || !text(item.findings))
        throw new Error('opn-read-only-graph-source-evidence-invalid');
    if (!DIGEST.test(artifact_id))
        throw new Error('opn-read-only-graph-source-evidence-binding-invalid');
    return { graph_id: item.graph_id, plan_digest: item.plan_digest, task_id: item.task_id, node_id: item.node_id, snapshot_digest: item.snapshot_digest, findings: item.findings };
}
function verificationEvidence(input) {
    return {
        schema: 'zj-loop.opn_read_only_graph_verification_evidence.v1',
        graph_id: input.source.graph_id,
        network_id: input.envelope.network_id,
        plan_id: input.envelope.plan_id,
        plan_revision: input.envelope.plan_revision,
        task_id: input.envelope.task_id,
        plan_digest: input.source.plan_digest,
        source_evidence_ref: input.source_evidence_ref,
        verifier_node_id: input.verifier_node_id,
        provider_status: input.provider.status,
        provider_success: input.provider.success,
        stdout_digest: bytesDigest(Buffer.from(input.provider.stdout, 'utf8')),
        stderr_digest: bytesDigest(Buffer.from(input.provider.stderr, 'utf8')),
        findings: input.provider.success ? input.provider.stdout.slice(0, 64 * 1024) || 'provider completed without textual findings' : undefined,
        reason: input.provider.success ? undefined : 'independent-verification-provider-not-passed',
        side_effects_executed: false,
    };
}
export async function processOpnReadOnlyGraphVerificationRequest(input) {
    const now = input.now ?? (() => new Date().toISOString());
    const envelope = input.envelope;
    if (envelope.target_node_id !== input.verifier_node_id || envelope.notification_kind !== 'graph.verification.request' || envelope.state !== 'available' || envelope.artifact_refs.length !== 1)
        return { status: 'blocked', message_id: envelope.message_id, reason: 'opn-read-only-graph-verification-request-invalid', side_effects_executed: false };
    const sourceRef = envelope.artifact_refs[0].artifact_id;
    if (!DIGEST.test(sourceRef) || envelope.artifact_refs[0].content_sha256 !== sourceRef)
        return { status: 'blocked', message_id: envelope.message_id, reason: 'opn-read-only-graph-verification-source-ref-invalid', side_effects_executed: false };
    let source;
    let sourceBytes;
    try {
        sourceBytes = await input.downloadArtifact(sourceRef);
        if (bytesDigest(sourceBytes) !== sourceRef)
            throw new Error('opn-read-only-graph-source-artifact-integrity-invalid');
        source = sourceEvidence(JSON.parse(sourceBytes.toString('utf8')), sourceRef);
        if (source.task_id !== envelope.task_id)
            throw new Error('opn-read-only-graph-source-task-binding-invalid');
    }
    catch (error) {
        return { status: 'blocked', message_id: envelope.message_id, reason: error instanceof Error ? error.message : 'opn-read-only-graph-source-unavailable', side_effects_executed: false };
    }
    let provider;
    try {
        provider = await input.provider.run({ cwd: input.cwd, prompt: `Independently verify this read-only Graph Atom source evidence for task ${envelope.task_id}. The source evidence is already available as JSON; inspect the local task context and return concise findings only. Do not edit files, run writes, or create side effects.`, mode: 'read-only', env_allowlist: [], env: {}, timeout_ms: 15 * 60 * 1000, termination_grace_ms: 5_000, max_stdout_bytes: 10 * 1024 * 1024, max_stderr_bytes: 10 * 1024 * 1024 });
    }
    catch {
        provider = { status: 'failed', success: false, stdout: '', stderr: '' };
    }
    const evidencePayload = verificationEvidence({ envelope, source, verifier_node_id: input.verifier_node_id, provider, source_evidence_ref: sourceRef });
    const evidenceBytes = Buffer.from(JSON.stringify(evidencePayload), 'utf8');
    const evidence = await input.artifact_store.put({ bytes: evidenceBytes, file_name: `${envelope.task_id}-verification-evidence.json`, media_type: 'application/json' });
    if (input.publishArtifact)
        await input.publishArtifact({ bytes: evidenceBytes, metadata: evidence.metadata, transfer_id: `verification-evidence:${envelope.message_id}`, target_node_id: envelope.from_node_id });
    const result = createOpnReadOnlyGraphVerificationResult({ graph_id: source.graph_id, network_id: envelope.network_id, plan_id: envelope.plan_id, plan_revision: envelope.plan_revision, task_id: envelope.task_id, plan_digest: source.plan_digest, source_evidence_ref: sourceRef, verification_evidence_ref: evidence.metadata.artifact_id, verifier_node_id: input.verifier_node_id, status: provider.status === 'completed' && provider.success ? 'passed' : 'outcome-uncertain' });
    const resultBytes = Buffer.from(JSON.stringify(result), 'utf8');
    const resultArtifact = await input.artifact_store.put({ bytes: resultBytes, file_name: `${envelope.task_id}-verification-result.json`, media_type: 'application/json' });
    if (input.publishArtifact)
        await input.publishArtifact({ bytes: resultBytes, metadata: resultArtifact.metadata, transfer_id: `verification-result:${envelope.message_id}`, target_node_id: envelope.from_node_id });
    const response = createTransportEnvelope({ message_id: `graph.verification.result:${envelope.message_id}`, network_id: envelope.network_id, event_id: envelope.event_id, plan_id: envelope.plan_id, plan_revision: envelope.plan_revision, task_id: envelope.task_id, from_node_id: input.verifier_node_id, target_node_id: envelope.from_node_id, notification_kind: 'graph.verification.result', state: result.status === 'passed' ? 'available' : 'blocked', artifact_refs: [{ artifact_id: resultArtifact.metadata.artifact_id, content_sha256: resultArtifact.metadata.content_sha256, kind: 'artifact' }, { artifact_id: evidence.metadata.artifact_id, content_sha256: evidence.metadata.content_sha256, kind: 'evidence' }], created_at: now(), expires_at: envelope.expires_at });
    await input.transport.send({ session_id: input.session_id, envelope: response });
    await input.transport.acknowledge({ session_id: input.session_id, message_id: envelope.message_id, envelope_digest: envelope.envelope_digest });
    return { status: 'processed', message_id: envelope.message_id, verification_result: result, result_artifact_id: resultArtifact.metadata.artifact_id, side_effects_executed: false };
}
