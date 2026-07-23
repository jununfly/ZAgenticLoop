import { createHash } from 'node:crypto';

export const COMPLETION_EVIDENCE_COMPATIBILITY_SCHEMA = 'zj-loop.completion_evidence_compatibility.v1';

export const COMPLETION_EVIDENCE_COMPATIBILITY_DIMENSIONS = [
  'target_digest',
  'route_table_digest',
  'route_digest',
  'adapter_digest',
  'runner_digest',
  'workflow_digest',
  'protocol_digest',
  'verification_digest',
] as const;

export type CompletionEvidenceCompatibilityDimension = typeof COMPLETION_EVIDENCE_COMPATIBILITY_DIMENSIONS[number];

export type CompletionEvidenceCompatibilityFingerprint = {
  schema: typeof COMPLETION_EVIDENCE_COMPATIBILITY_SCHEMA;
  target_id: string;
  route_id: string;
  adapter_id: string;
  dimensions: Record<CompletionEvidenceCompatibilityDimension, string>;
  fingerprint: string;
};

export type CompletionEvidenceFreshness = {
  schema: 'zj-loop.completion_evidence_freshness.v1';
  status: 'compatible' | 'stale' | 'missing';
  reason: 'compatible' | 'missing-fingerprint' | 'invalid-fingerprint' | 'relevant-change';
  changed_dimensions: CompletionEvidenceCompatibilityDimension[];
  side_effects_executed: false;
};

export type CompletionEvidenceCompatibilityInput = {
  targetId: string;
  routeId: string;
  adapterId: string;
} & Record<CompletionEvidenceCompatibilityDimension, string>;

export function buildCompletionEvidenceCompatibility(
  input: CompletionEvidenceCompatibilityInput,
): CompletionEvidenceCompatibilityFingerprint {
  const dimensions = Object.fromEntries(
    COMPLETION_EVIDENCE_COMPATIBILITY_DIMENSIONS.map((dimension) => [dimension, required(input[dimension], dimension)]),
  ) as Record<CompletionEvidenceCompatibilityDimension, string>;
  const base: Omit<CompletionEvidenceCompatibilityFingerprint, 'fingerprint'> = {
    schema: COMPLETION_EVIDENCE_COMPATIBILITY_SCHEMA,
    target_id: required(input.targetId, 'target_id'),
    route_id: required(input.routeId, 'route_id'),
    adapter_id: required(input.adapterId, 'adapter_id'),
    dimensions,
  };
  return { ...base, fingerprint: digest(stableStringify(base)) };
}

export function deriveCompletionEvidenceFreshness(
  recorded: CompletionEvidenceCompatibilityFingerprint | undefined,
  current: CompletionEvidenceCompatibilityFingerprint,
): CompletionEvidenceFreshness {
  if (!recorded) return freshness('missing', 'missing-fingerprint', []);
  const recordedValid = isValidFingerprint(recorded);
  if (!recordedValid) return freshness('stale', 'invalid-fingerprint', []);

  const changedDimensions = COMPLETION_EVIDENCE_COMPATIBILITY_DIMENSIONS.filter((dimension) =>
    recorded.dimensions[dimension] !== current.dimensions[dimension]);
  const identityChanged = recorded.target_id !== current.target_id
    || recorded.route_id !== current.route_id
    || recorded.adapter_id !== current.adapter_id;
  if (identityChanged || changedDimensions.length > 0 || recorded.fingerprint !== current.fingerprint) {
    return freshness('stale', 'relevant-change', changedDimensions);
  }
  return freshness('compatible', 'compatible', []);
}

function freshness(
  status: CompletionEvidenceFreshness['status'],
  reason: CompletionEvidenceFreshness['reason'],
  changedDimensions: CompletionEvidenceCompatibilityDimension[],
): CompletionEvidenceFreshness {
  return {
    schema: 'zj-loop.completion_evidence_freshness.v1',
    status,
    reason,
    changed_dimensions: changedDimensions,
    side_effects_executed: false,
  };
}

function isValidFingerprint(value: CompletionEvidenceCompatibilityFingerprint): boolean {
  if (value.schema !== COMPLETION_EVIDENCE_COMPATIBILITY_SCHEMA) return false;
  if (!value.target_id || !value.route_id || !value.adapter_id || !value.fingerprint) return false;
  const expected = digest(stableStringify({
    schema: value.schema,
    target_id: value.target_id,
    route_id: value.route_id,
    adapter_id: value.adapter_id,
    dimensions: value.dimensions,
  }));
  return expected === value.fingerprint
    && COMPLETION_EVIDENCE_COMPATIBILITY_DIMENSIONS.every((dimension) => typeof value.dimensions?.[dimension] === 'string' && value.dimensions[dimension].length > 0);
}

function required(value: string, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${name} is required`);
  return value;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}
