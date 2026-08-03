import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
export const REAL_AGENT_DOGFOOD_CONFORMANCE_REPORT_SCHEMA = 'zj-loop.real_agent_dogfood_conformance_report.v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/i;
const SEVERITIES = new Set(['info', 'low', 'medium', 'high', 'critical']);
const FINDING_STATUSES = new Set(['implemented', 'partial', 'missing', 'risk']);
const REPORT_KEYS = new Set(['schema', 'scope', 'implemented', 'partial', 'missing', 'risks', 'evidence_refs', 'verification_refs', 'recommendations', 'report_digest']);
const SCOPE_KEYS = new Set(['repository', 'input_commit', 'manifest_digest', 'worktree_identity', 'roadmap_revision']);
const FINDING_KEYS = new Set(['finding_id', 'severity', 'category', 'claim', 'status', 'file_refs', 'evidence_refs', 'verification_refs']);
const FILE_REF_KEYS = new Set(['path', 'start_line', 'end_line', 'content_sha256']);
const MAX_REPORT_BYTES = 64 * 1024;
const MAX_FINDINGS = 256;
const MAX_REFS = 256;
export const REAL_AGENT_DOGFOOD_RESULT_ENVELOPE_SCHEMA = 'zj-loop.real_agent_dogfood_result_envelope.v1';
const ENVELOPE_KEYS = new Set(['schema', 'execution', 'report', 'observations', 'claims', 'output', 'envelope_digest']);
const EXECUTION_KEYS = new Set(['execution_id', 'attempt', 'provider_id', 'adapter_version']);
const OBSERVATION_KEYS = new Set(['observation_id', 'claim', 'value_digest', 'evidence_refs']);
const CLAIM_KEYS = new Set(['claim_id', 'claim', 'disposition', 'evidence_refs']);
const OUTPUT_KEYS = new Set(['events', 'terminal']);
const OUTPUT_EVENT_KEYS = new Set(['sequence', 'kind', 'payload_digest']);
const TERMINAL_KEYS = new Set(['outcome', 'payload_digest']);
function validateResultEnvelope(value) {
    const candidate = value;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || Object.keys(candidate).some((key) => !ENVELOPE_KEYS.has(key)) || candidate.schema !== REAL_AGENT_DOGFOOD_RESULT_ENVELOPE_SCHEMA)
        throw new Error('real-agent-dogfood-result-envelope-input-invalid');
    const execution = candidate.execution;
    if (!execution || typeof execution !== 'object' || Array.isArray(execution) || Object.keys(execution).some((key) => !EXECUTION_KEYS.has(key)) || !text(execution.execution_id) || !Number.isInteger(execution.attempt) || execution.attempt < 1 || !text(execution.provider_id) || !text(execution.adapter_version))
        throw new Error('real-agent-dogfood-result-envelope-execution-invalid');
    const report = candidate.report;
    try {
        createRealAgentDogfoodConformanceReport(unsignedReport(report));
    }
    catch {
        throw new Error('real-agent-dogfood-result-envelope-report-invalid');
    }
    if (realAgentDogfoodConformanceReportDigest(report) !== report.report_digest)
        throw new Error('real-agent-dogfood-result-envelope-report-digest-invalid');
    const observations = candidate.observations;
    if (!Array.isArray(observations) || observations.length > MAX_REFS)
        throw new Error('real-agent-dogfood-result-envelope-observations-invalid');
    for (const observation of observations) {
        const item = observation;
        if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some((key) => !OBSERVATION_KEYS.has(key)) || !text(item.observation_id) || !text(item.claim) || !DIGEST.test(String(item.value_digest)))
            throw new Error('real-agent-dogfood-result-envelope-observation-invalid');
        refs(item.evidence_refs, 'observation-evidence-refs');
    }
    const claims = candidate.claims;
    if (!Array.isArray(claims) || claims.length > MAX_REFS)
        throw new Error('real-agent-dogfood-result-envelope-claims-invalid');
    for (const claim of claims) {
        const item = claim;
        if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some((key) => !CLAIM_KEYS.has(key)) || !text(item.claim_id) || !text(item.claim) || item.disposition !== 'candidate')
            throw new Error('real-agent-dogfood-result-envelope-claim-invalid');
        refs(item.evidence_refs, 'claim-evidence-refs');
    }
    const output = candidate.output;
    if (!output || typeof output !== 'object' || Array.isArray(output) || Object.keys(output).some((key) => !OUTPUT_KEYS.has(key)) || !Array.isArray(output.events) || output.events.length < 1 || output.events.length > MAX_REFS || !output.terminal || typeof output.terminal !== 'object' || Array.isArray(output.terminal))
        throw new Error('real-agent-dogfood-result-envelope-output-invalid');
    const events = output.events;
    let terminalCount = 0;
    events.forEach((event, index) => {
        if (!event || typeof event !== 'object' || Array.isArray(event) || Object.keys(event).some((key) => !OUTPUT_EVENT_KEYS.has(key)) || event.sequence !== index + 1 || !text(event.kind) || !DIGEST.test(String(event.payload_digest)))
            throw new Error('real-agent-dogfood-result-envelope-event-invalid');
        if (event.kind === 'terminal')
            terminalCount += 1;
    });
    const terminal = output.terminal;
    if (Object.keys(terminal).some((key) => !TERMINAL_KEYS.has(key)) || !['success', 'failure'].includes(String(terminal.outcome)) || !DIGEST.test(String(terminal.payload_digest)) || terminalCount !== 1 || events.find((event) => event.kind === 'terminal')?.payload_digest !== terminal.payload_digest)
        throw new Error('real-agent-dogfood-result-envelope-terminal-invalid');
}
function unsignedEnvelope(value) {
    const { envelope_digest: _, ...unsigned } = value;
    return unsigned;
}
export function createRealAgentDogfoodResultEnvelope(input) {
    const unsigned = unsignedEnvelope({ schema: REAL_AGENT_DOGFOOD_RESULT_ENVELOPE_SCHEMA, ...input });
    validateResultEnvelope(unsigned);
    if ('envelope_digest' in input && input.envelope_digest !== undefined && input.envelope_digest !== digest(unsigned))
        throw new Error('real-agent-dogfood-result-envelope-digest-invalid');
    return Object.freeze({ ...unsigned, envelope_digest: digest(unsigned) });
}
function canonical(value) {
    const result = canonicalize(value);
    if (typeof result !== 'string')
        throw new Error('real-agent-dogfood-report-canonicalization-invalid');
    return result;
}
function digest(value) {
    return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`;
}
function text(value) {
    return typeof value === 'string' && value.trim().length > 0 && !value.includes('\0');
}
function refs(value, name) {
    if (!Array.isArray(value) || value.length > MAX_REFS)
        throw new Error(`real-agent-dogfood-report-${name}-invalid`);
    if (!value.every((ref) => typeof ref === 'string' && DIGEST.test(ref)))
        throw new Error(`real-agent-dogfood-report-${name}-invalid`);
    return true;
}
function validateFileRef(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('real-agent-dogfood-report-file-ref-invalid');
    const ref = value;
    const startLine = ref.start_line;
    const endLine = ref.end_line;
    if (Object.keys(ref).some((key) => !FILE_REF_KEYS.has(key)) || !text(ref.path) || ref.path.startsWith('/') || ref.path.split('/').includes('..') || !Number.isInteger(startLine) || startLine < 1 || !Number.isInteger(endLine) || endLine < startLine || !DIGEST.test(String(ref.content_sha256)))
        throw new Error('real-agent-dogfood-report-file-ref-invalid');
}
function validateFinding(value, expectedStatus) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('real-agent-dogfood-report-finding-invalid');
    const finding = value;
    if (Object.keys(finding).some((key) => !FINDING_KEYS.has(key)) || !text(finding.finding_id) || !SEVERITIES.has(String(finding.severity)) || !text(finding.category) || !text(finding.claim) || finding.status !== expectedStatus || !Array.isArray(finding.file_refs) || finding.file_refs.length > MAX_REFS)
        throw new Error('real-agent-dogfood-report-finding-invalid');
    finding.file_refs.forEach(validateFileRef);
    refs(finding.evidence_refs, 'finding-evidence-refs');
    refs(finding.verification_refs, 'finding-verification-refs');
}
function unsignedReport(value) {
    const { report_digest: _, ...unsigned } = value;
    return unsigned;
}
export function realAgentDogfoodConformanceReportDigest(value) {
    return digest(unsignedReport(value));
}
export function createRealAgentDogfoodConformanceReport(input) {
    if (!input || typeof input !== 'object' || Object.keys(input).some((key) => !REPORT_KEYS.has(key)) || !input.scope || typeof input.scope !== 'object' || Array.isArray(input.scope))
        throw new Error('real-agent-dogfood-report-input-invalid');
    const scope = input.scope;
    if (Object.keys(scope).some((key) => !SCOPE_KEYS.has(key)) || !text(scope.repository) || typeof scope.input_commit !== 'string' || !COMMIT.test(scope.input_commit) || !DIGEST.test(String(scope.manifest_digest)) || !text(scope.worktree_identity) || !text(scope.roadmap_revision))
        throw new Error('real-agent-dogfood-report-scope-invalid');
    const arrays = [['implemented', 'implemented'], ['partial', 'partial'], ['missing', 'missing'], ['risks', 'risk']];
    let count = 0;
    for (const [name, status] of arrays) {
        const values = input[name];
        if (!Array.isArray(values))
            throw new Error('real-agent-dogfood-report-findings-invalid');
        count += values.length;
        if (count > MAX_FINDINGS)
            throw new Error('real-agent-dogfood-report-findings-limit-exceeded');
        values.forEach((finding) => validateFinding(finding, status));
    }
    refs(input.evidence_refs, 'evidence-refs');
    refs(input.verification_refs, 'verification-refs');
    if (!Array.isArray(input.recommendations) || input.recommendations.length > MAX_REFS || !input.recommendations.every(text))
        throw new Error('real-agent-dogfood-report-recommendations-invalid');
    const unsigned = {
        schema: REAL_AGENT_DOGFOOD_CONFORMANCE_REPORT_SCHEMA,
        scope: { ...scope },
        implemented: input.implemented.map((finding) => ({ ...finding })),
        partial: input.partial.map((finding) => ({ ...finding })),
        missing: input.missing.map((finding) => ({ ...finding })),
        risks: input.risks.map((finding) => ({ ...finding })),
        evidence_refs: [...input.evidence_refs],
        verification_refs: [...input.verification_refs],
        recommendations: [...input.recommendations],
    };
    if (Buffer.byteLength(canonical(unsigned), 'utf8') > MAX_REPORT_BYTES)
        throw new Error('real-agent-dogfood-report-limit-exceeded');
    return Object.freeze({ ...unsigned, report_digest: realAgentDogfoodConformanceReportDigest(unsigned) });
}
