import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';

export const REAL_AGENT_DOGFOOD_CONFORMANCE_REPORT_SCHEMA = 'zj-loop.real_agent_dogfood_conformance_report.v1' as const;

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

export type RealAgentDogfoodFileRef = { path: string; start_line: number; end_line: number; content_sha256: string };
export type RealAgentDogfoodFinding = {
  finding_id: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  category: string;
  claim: string;
  status: 'implemented' | 'partial' | 'missing' | 'risk';
  file_refs: RealAgentDogfoodFileRef[];
  evidence_refs: string[];
  verification_refs: string[];
};
export type RealAgentDogfoodConformanceReport = {
  schema: typeof REAL_AGENT_DOGFOOD_CONFORMANCE_REPORT_SCHEMA;
  scope: { repository: string; input_commit: string; manifest_digest: string; worktree_identity: string; roadmap_revision: string };
  implemented: RealAgentDogfoodFinding[];
  partial: RealAgentDogfoodFinding[];
  missing: RealAgentDogfoodFinding[];
  risks: RealAgentDogfoodFinding[];
  evidence_refs: string[];
  verification_refs: string[];
  recommendations: string[];
  report_digest: string;
};

export const REAL_AGENT_DOGFOOD_RESULT_ENVELOPE_SCHEMA = 'zj-loop.real_agent_dogfood_result_envelope.v1' as const;
const ENVELOPE_KEYS = new Set(['schema', 'execution', 'report', 'observations', 'claims', 'output', 'envelope_digest']);
const EXECUTION_KEYS = new Set(['execution_id', 'attempt', 'provider_id', 'adapter_version']);
const OBSERVATION_KEYS = new Set(['observation_id', 'claim', 'value_digest', 'evidence_refs']);
const CLAIM_KEYS = new Set(['claim_id', 'claim', 'disposition', 'evidence_refs']);
const OUTPUT_KEYS = new Set(['events', 'terminal']);
const OUTPUT_EVENT_KEYS = new Set(['sequence', 'kind', 'payload_digest']);
const TERMINAL_KEYS = new Set(['outcome', 'payload_digest']);

export type RealAgentDogfoodResultEnvelope = {
  schema: typeof REAL_AGENT_DOGFOOD_RESULT_ENVELOPE_SCHEMA;
  execution: { execution_id: string; attempt: number; provider_id: string; adapter_version: string };
  report: RealAgentDogfoodConformanceReport;
  observations: Array<{ observation_id: string; claim: string; value_digest: string; evidence_refs: string[] }>;
  claims: Array<{ claim_id: string; claim: string; disposition: 'candidate'; evidence_refs: string[] }>;
  output: { events: Array<{ sequence: number; kind: string; payload_digest: string }>; terminal: { outcome: 'success' | 'failure'; payload_digest: string } };
  envelope_digest: string;
};

type ResultEnvelopeInput = Omit<RealAgentDogfoodResultEnvelope, 'schema' | 'envelope_digest'> | RealAgentDogfoodResultEnvelope;

function validateResultEnvelope(value: ResultEnvelopeInput): asserts value is Omit<RealAgentDogfoodResultEnvelope, 'envelope_digest'> {
  const candidate = value as Record<string, unknown>;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || Object.keys(candidate).some((key) => !ENVELOPE_KEYS.has(key)) || candidate.schema !== REAL_AGENT_DOGFOOD_RESULT_ENVELOPE_SCHEMA) throw new Error('real-agent-dogfood-result-envelope-input-invalid');
  const execution = candidate.execution as Record<string, unknown>;
  if (!execution || typeof execution !== 'object' || Array.isArray(execution) || Object.keys(execution).some((key) => !EXECUTION_KEYS.has(key)) || !text(execution.execution_id) || !Number.isInteger(execution.attempt) || (execution.attempt as number) < 1 || !text(execution.provider_id) || !text(execution.adapter_version)) throw new Error('real-agent-dogfood-result-envelope-execution-invalid');
  const report = candidate.report as RealAgentDogfoodConformanceReport;
  try {
    createRealAgentDogfoodConformanceReport(unsignedReport(report));
  } catch {
    throw new Error('real-agent-dogfood-result-envelope-report-invalid');
  }
  if (realAgentDogfoodConformanceReportDigest(report) !== report.report_digest) throw new Error('real-agent-dogfood-result-envelope-report-digest-invalid');
  const observations = candidate.observations;
  if (!Array.isArray(observations) || observations.length > MAX_REFS) throw new Error('real-agent-dogfood-result-envelope-observations-invalid');
  for (const observation of observations) {
    const item = observation as Record<string, unknown>;
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some((key) => !OBSERVATION_KEYS.has(key)) || !text(item.observation_id) || !text(item.claim) || !DIGEST.test(String(item.value_digest))) throw new Error('real-agent-dogfood-result-envelope-observation-invalid');
    refs(item.evidence_refs, 'observation-evidence-refs');
  }
  const claims = candidate.claims;
  if (!Array.isArray(claims) || claims.length > MAX_REFS) throw new Error('real-agent-dogfood-result-envelope-claims-invalid');
  for (const claim of claims) {
    const item = claim as Record<string, unknown>;
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some((key) => !CLAIM_KEYS.has(key)) || !text(item.claim_id) || !text(item.claim) || item.disposition !== 'candidate') throw new Error('real-agent-dogfood-result-envelope-claim-invalid');
    refs(item.evidence_refs, 'claim-evidence-refs');
  }
  const output = candidate.output as Record<string, unknown>;
  if (!output || typeof output !== 'object' || Array.isArray(output) || Object.keys(output).some((key) => !OUTPUT_KEYS.has(key)) || !Array.isArray(output.events) || output.events.length < 1 || output.events.length > MAX_REFS || !output.terminal || typeof output.terminal !== 'object' || Array.isArray(output.terminal)) throw new Error('real-agent-dogfood-result-envelope-output-invalid');
  const events = output.events as Array<Record<string, unknown>>;
  let terminalCount = 0;
  events.forEach((event, index) => {
    if (!event || typeof event !== 'object' || Array.isArray(event) || Object.keys(event).some((key) => !OUTPUT_EVENT_KEYS.has(key)) || event.sequence !== index + 1 || !text(event.kind) || !DIGEST.test(String(event.payload_digest))) throw new Error('real-agent-dogfood-result-envelope-event-invalid');
    if (event.kind === 'terminal') terminalCount += 1;
  });
  const terminal = output.terminal as Record<string, unknown>;
  if (Object.keys(terminal).some((key) => !TERMINAL_KEYS.has(key)) || !['success', 'failure'].includes(String(terminal.outcome)) || !DIGEST.test(String(terminal.payload_digest)) || terminalCount !== 1 || events.find((event) => event.kind === 'terminal')?.payload_digest !== terminal.payload_digest) throw new Error('real-agent-dogfood-result-envelope-terminal-invalid');
}

function unsignedEnvelope(value: RealAgentDogfoodResultEnvelope | Omit<RealAgentDogfoodResultEnvelope, 'envelope_digest'>): Omit<RealAgentDogfoodResultEnvelope, 'envelope_digest'> {
  const { envelope_digest: _, ...unsigned } = value as RealAgentDogfoodResultEnvelope;
  return unsigned;
}

export function createRealAgentDogfoodResultEnvelope(input: ResultEnvelopeInput): RealAgentDogfoodResultEnvelope {
  const unsigned = unsignedEnvelope({ schema: REAL_AGENT_DOGFOOD_RESULT_ENVELOPE_SCHEMA, ...input } as RealAgentDogfoodResultEnvelope);
  validateResultEnvelope(unsigned);
  if ('envelope_digest' in input && input.envelope_digest !== undefined && input.envelope_digest !== digest(unsigned)) throw new Error('real-agent-dogfood-result-envelope-digest-invalid');
  return Object.freeze({ ...unsigned, envelope_digest: digest(unsigned) });
}

function canonical(value: unknown): string {
  const result = canonicalize(value);
  if (typeof result !== 'string') throw new Error('real-agent-dogfood-report-canonicalization-invalid');
  return result;
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`;
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !value.includes('\0');
}

function refs(value: unknown, name: string): value is string[] {
  if (!Array.isArray(value) || value.length > MAX_REFS) throw new Error(`real-agent-dogfood-report-${name}-invalid`);
  if (!value.every((ref) => typeof ref === 'string' && DIGEST.test(ref))) throw new Error(`real-agent-dogfood-report-${name}-invalid`);
  return true;
}

function validateFileRef(value: unknown): asserts value is RealAgentDogfoodFileRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('real-agent-dogfood-report-file-ref-invalid');
  const ref = value as Record<string, unknown>;
  const startLine = ref.start_line;
  const endLine = ref.end_line;
  if (Object.keys(ref).some((key) => !FILE_REF_KEYS.has(key)) || !text(ref.path) || ref.path.startsWith('/') || ref.path.split('/').includes('..') || !Number.isInteger(startLine) || (startLine as number) < 1 || !Number.isInteger(endLine) || (endLine as number) < (startLine as number) || !DIGEST.test(String(ref.content_sha256))) throw new Error('real-agent-dogfood-report-file-ref-invalid');
}

function validateFinding(value: unknown, expectedStatus: RealAgentDogfoodFinding['status']): asserts value is RealAgentDogfoodFinding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('real-agent-dogfood-report-finding-invalid');
  const finding = value as Record<string, unknown>;
  if (Object.keys(finding).some((key) => !FINDING_KEYS.has(key)) || !text(finding.finding_id) || !SEVERITIES.has(String(finding.severity)) || !text(finding.category) || !text(finding.claim) || finding.status !== expectedStatus || !Array.isArray(finding.file_refs) || finding.file_refs.length > MAX_REFS) throw new Error('real-agent-dogfood-report-finding-invalid');
  finding.file_refs.forEach(validateFileRef);
  refs(finding.evidence_refs, 'finding-evidence-refs');
  refs(finding.verification_refs, 'finding-verification-refs');
}

function unsignedReport(value: RealAgentDogfoodConformanceReport | Omit<RealAgentDogfoodConformanceReport, 'report_digest'>): Omit<RealAgentDogfoodConformanceReport, 'report_digest'> {
  const { report_digest: _, ...unsigned } = value as RealAgentDogfoodConformanceReport;
  return unsigned;
}

export function realAgentDogfoodConformanceReportDigest(value: RealAgentDogfoodConformanceReport | Omit<RealAgentDogfoodConformanceReport, 'report_digest'>): string {
  return digest(unsignedReport(value));
}

export function createRealAgentDogfoodConformanceReport(input: Omit<RealAgentDogfoodConformanceReport, 'schema' | 'report_digest'>): RealAgentDogfoodConformanceReport {
  if (!input || typeof input !== 'object' || Object.keys(input).some((key) => !REPORT_KEYS.has(key)) || !input.scope || typeof input.scope !== 'object' || Array.isArray(input.scope)) throw new Error('real-agent-dogfood-report-input-invalid');
  const scope = input.scope as Record<string, unknown>;
  if (Object.keys(scope).some((key) => !SCOPE_KEYS.has(key)) || !text(scope.repository) || typeof scope.input_commit !== 'string' || !COMMIT.test(scope.input_commit) || !DIGEST.test(String(scope.manifest_digest)) || !text(scope.worktree_identity) || !text(scope.roadmap_revision)) throw new Error('real-agent-dogfood-report-scope-invalid');
  const arrays: Array<[keyof Pick<RealAgentDogfoodConformanceReport, 'implemented' | 'partial' | 'missing' | 'risks'>, RealAgentDogfoodFinding['status']]> = [['implemented', 'implemented'], ['partial', 'partial'], ['missing', 'missing'], ['risks', 'risk']];
  let count = 0;
  for (const [name, status] of arrays) {
    const values = input[name];
    if (!Array.isArray(values)) throw new Error('real-agent-dogfood-report-findings-invalid');
    count += values.length;
    if (count > MAX_FINDINGS) throw new Error('real-agent-dogfood-report-findings-limit-exceeded');
    values.forEach((finding) => validateFinding(finding, status));
  }
  refs(input.evidence_refs, 'evidence-refs');
  refs(input.verification_refs, 'verification-refs');
  if (!Array.isArray(input.recommendations) || input.recommendations.length > MAX_REFS || !input.recommendations.every(text)) throw new Error('real-agent-dogfood-report-recommendations-invalid');
  const unsigned: Omit<RealAgentDogfoodConformanceReport, 'report_digest'> = {
    schema: REAL_AGENT_DOGFOOD_CONFORMANCE_REPORT_SCHEMA,
    scope: { ...scope } as RealAgentDogfoodConformanceReport['scope'],
    implemented: input.implemented.map((finding) => ({ ...finding })),
    partial: input.partial.map((finding) => ({ ...finding })),
    missing: input.missing.map((finding) => ({ ...finding })),
    risks: input.risks.map((finding) => ({ ...finding })),
    evidence_refs: [...input.evidence_refs],
    verification_refs: [...input.verification_refs],
    recommendations: [...input.recommendations],
  };
  if (Buffer.byteLength(canonical(unsigned), 'utf8') > MAX_REPORT_BYTES) throw new Error('real-agent-dogfood-report-limit-exceeded');
  return Object.freeze({ ...unsigned, report_digest: realAgentDogfoodConformanceReportDigest(unsigned) });
}
