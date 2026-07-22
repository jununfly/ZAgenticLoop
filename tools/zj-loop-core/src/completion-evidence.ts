export const COMPLETION_EVIDENCE_SCHEMA = 'zj-loop.completion_evidence.v1';

export const COMPLETION_STATUSES = [
  'planned',
  'executed_to_review_artifact',
  'hard_stopped',
  'duplicate',
  'resume',
] as const;

export type CompletionStatus = typeof COMPLETION_STATUSES[number];

export type CompletionEvidenceRecord = {
  schema: typeof COMPLETION_EVIDENCE_SCHEMA;
  orchestration_id: string;
  signal_id: string;
  route_id: string;
  request_id: string;
  carrier: {
    kind: string;
    id?: string;
    url?: string;
  };
  consumer_id: string;
  current_head_sha: string;
  status: CompletionStatus;
  review_artifact: {
    kind: string;
    path?: string;
    schema?: string;
  } | null;
  stop_reason: string | null;
  side_effects_executed: boolean;
  evidence_refs: Array<{
    kind: string;
    path?: string;
    url?: string;
  }>;
  resume_anchor: string | null;
  provenance: Record<string, unknown>;
  duplicate_of?: string;
};

export type CompletionEvidenceValidation = {
  ok: boolean;
  status: 'valid' | 'hard_stop';
  errors: string[];
  side_effects_executed: boolean;
  evidence?: CompletionEvidenceRecord;
};

export function buildCompletionEvidence(input: {
  orchestrationId: string;
  signalId: string;
  routeId: string;
  requestId: string;
  carrier: CompletionEvidenceRecord['carrier'];
  consumerId: string;
  currentHeadSha: string;
  status: CompletionStatus;
  reviewArtifact: CompletionEvidenceRecord['review_artifact'];
  stopReason?: string | null;
  resumeAnchor?: string | null;
  evidenceRefs: CompletionEvidenceRecord['evidence_refs'];
  provenance: Record<string, unknown>;
  sideEffectsExecuted?: boolean;
  duplicateOf?: string;
}): CompletionEvidenceRecord {
  return {
    schema: COMPLETION_EVIDENCE_SCHEMA,
    orchestration_id: input.orchestrationId,
    signal_id: input.signalId,
    route_id: input.routeId,
    request_id: input.requestId,
    carrier: input.carrier,
    consumer_id: input.consumerId,
    current_head_sha: input.currentHeadSha,
    status: input.status,
    review_artifact: input.reviewArtifact,
    stop_reason: input.stopReason ?? null,
    side_effects_executed: input.sideEffectsExecuted ?? false,
    evidence_refs: input.evidenceRefs,
    resume_anchor: input.resumeAnchor ?? null,
    provenance: input.provenance,
    ...(input.duplicateOf ? { duplicate_of: input.duplicateOf } : {}),
  };
}

type CompletionValidationOptions = {
  expected?: Partial<Pick<CompletionEvidenceRecord,
    'orchestration_id' | 'signal_id' | 'route_id' | 'request_id' | 'consumer_id' | 'current_head_sha'>>;
  allowSideEffects?: boolean;
};

export function validateCompletionEvidence(
  value: unknown,
  options: CompletionValidationOptions = {},
): CompletionEvidenceValidation {
  const errors: string[] = [];
  const candidate = isRecord(value) ? value : null;
  if (!candidate) {
    return invalid(['completion evidence must be an object']);
  }

  if (candidate.schema !== COMPLETION_EVIDENCE_SCHEMA) {
    errors.push(`schema must be ${COMPLETION_EVIDENCE_SCHEMA}`);
  }

  const stringFields = [
    'orchestration_id',
    'signal_id',
    'route_id',
    'request_id',
    'consumer_id',
    'current_head_sha',
  ] as const;
  for (const field of stringFields) {
    if (!isNonEmptyString(candidate[field])) errors.push(`${field} is required`);
  }

  if (!isCarrier(candidate.carrier)) errors.push('carrier is required');
  if (!COMPLETION_STATUSES.includes(candidate.status as CompletionStatus)) {
    errors.push(`unsupported status ${String(candidate.status)}`);
  }
  if (!isReviewArtifact(candidate.review_artifact) && candidate.review_artifact !== null) {
    errors.push('review_artifact must be an object or null');
  }
  if (candidate.stop_reason !== null && !isNonEmptyString(candidate.stop_reason)) {
    errors.push('stop_reason must be a non-empty string or null');
  }
  if (typeof candidate.side_effects_executed !== 'boolean') {
    errors.push('side_effects_executed must be boolean');
  } else if (candidate.side_effects_executed === true && options.allowSideEffects !== true) {
    errors.push('side_effects_executed must be false in report-only validation');
  }
  if (!Array.isArray(candidate.evidence_refs) || candidate.evidence_refs.length === 0
    || candidate.evidence_refs.some((item) => !isEvidenceRef(item))) {
    errors.push('evidence_refs must be a non-empty array of evidence references');
  }
  if (candidate.resume_anchor !== null && !isNonEmptyString(candidate.resume_anchor)) {
    errors.push('resume_anchor must be a non-empty string or null');
  }
  if (!isProviderProvenance(candidate.provenance)) errors.push('provenance is incomplete');

  for (const [field, expected] of Object.entries(options.expected ?? {})) {
    if (expected === undefined) continue;
    const observed = candidate[field];
    if (observed !== expected) errors.push(`${field} mismatch: expected ${expected}, observed ${String(observed)}`);
  }

  if (candidate.status === 'executed_to_review_artifact' && !isReviewArtifact(candidate.review_artifact)) {
    errors.push('review_artifact is required for executed_to_review_artifact');
  }
  if (candidate.status === 'hard_stopped' && !isNonEmptyString(candidate.stop_reason)) {
    errors.push('stop_reason is required for hard_stopped');
  }
  if (candidate.status === 'hard_stopped' && candidate.side_effects_executed === true) {
    errors.push('hard_stopped evidence cannot report executed side effects');
  }
  if (candidate.status === 'resume' && !isNonEmptyString(candidate.resume_anchor)) {
    errors.push('resume_anchor is required for resume');
  }
  if (candidate.status === 'duplicate' && !isNonEmptyString(candidate.duplicate_of)) {
    errors.push('duplicate_of is required for duplicate');
  }

  if (errors.length > 0) return invalid(errors, candidate.side_effects_executed === true);
  return {
    ok: true,
    status: 'valid',
    errors: [],
    side_effects_executed: candidate.side_effects_executed as boolean,
    evidence: candidate as unknown as CompletionEvidenceRecord,
  };
}

function invalid(errors: string[], sideEffects = false): CompletionEvidenceValidation {
  return {
    ok: false,
    status: 'hard_stop',
    errors,
    side_effects_executed: sideEffects,
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCarrier(value: unknown): boolean {
  return isRecord(value) && isNonEmptyString(value.kind)
    && (value.id === undefined || isNonEmptyString(value.id))
    && (value.url === undefined || isNonEmptyString(value.url));
}

function isReviewArtifact(value: unknown): boolean {
  return isRecord(value) && isNonEmptyString(value.kind)
    && (value.path === undefined || isNonEmptyString(value.path))
    && (value.schema === undefined || isNonEmptyString(value.schema));
}

function isEvidenceRef(value: unknown): boolean {
  return isRecord(value) && isNonEmptyString(value.kind)
    && (value.path === undefined || isNonEmptyString(value.path))
    && (value.url === undefined || isNonEmptyString(value.url));
}

function isProviderProvenance(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || !isNonEmptyString(value.provider)) return false;
  if (value.provider === 'none') return isNonEmptyString(value.orchestration_id)
    || isNonEmptyString(value.commit)
    || isNonEmptyString(value.head_sha);
  if (value.provider !== 'github' && value.provider !== 'gitlab') return false;
  const project = value.project ?? value.repository;
  const pipeline = value.pipeline_id ?? value.workflow_id;
  const job = value.job_id ?? value.check_id;
  const commit = value.commit ?? value.head_sha;
  return isNonEmptyString(project)
    && isIdentifier(pipeline)
    && isIdentifier(job)
    && isNonEmptyString(commit);
}

function isIdentifier(value: unknown): boolean {
  return isNonEmptyString(value) || (typeof value === 'number' && Number.isInteger(value));
}
