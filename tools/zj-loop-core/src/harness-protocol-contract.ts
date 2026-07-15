export const LOOP_HARNESS_OUTPUT_SCHEMA = 'zj-loop.harness_output.v1';
export const LOOP_HARNESS_INPUT_SCHEMA = 'zj-loop.harness_input.v1';
export const LOOP_RUN_METRICS_SCHEMA = 'zj-loop.run_metrics.v1';
export const LOOP_HARNESS_RUN_STATE_SCHEMA = 'zj-loop.harness_run_state.v1';
export const LOOP_HARNESS_SCHEMA_VERSION = 1;

export const LOOP_HARNESS_INPUT_ENVELOPE_TYPES = [
  'slash_command',
  'fenced_protocol_block',
  'deterministic_cli_output',
] as const;

export const LOOP_HARNESS_INPUT_INTENTS = [
  'run_route',
  'resume_loop',
  'confirm',
  'closeout',
] as const;

export const LOOP_HARNESS_OUTPUT_STATUSES = [
  'completed',
  'in_progress',
  'stopped',
  'failed',
  'skipped',
  'needs_protocol_repair',
] as const;

export const LOOP_HARNESS_NEXT_ACTION_TYPES = [
  'continue_loop',
  'resume_loop',
  'request_confirmation',
  'create_review_artifact',
  'run_verification',
  'perform_closeout',
  'open_provider_link',
  'write_local_evidence',
  'stop',
] as const;

export type LoopHarnessOutputStatus = typeof LOOP_HARNESS_OUTPUT_STATUSES[number];
export type LoopHarnessNextActionType = typeof LOOP_HARNESS_NEXT_ACTION_TYPES[number];
export type LoopHarnessInputEnvelopeType = typeof LOOP_HARNESS_INPUT_ENVELOPE_TYPES[number];
export type LoopHarnessInputIntent = typeof LOOP_HARNESS_INPUT_INTENTS[number];

export type LoopHarnessProtocolInput = {
  schema: typeof LOOP_HARNESS_INPUT_SCHEMA;
  schema_version: typeof LOOP_HARNESS_SCHEMA_VERSION;
  envelope_type: LoopHarnessInputEnvelopeType | string;
  intent: LoopHarnessInputIntent | string;
  source: {
    kind?: string;
    id?: string;
    [key: string]: unknown;
  };
  payload: Record<string, unknown>;
  [key: string]: unknown;
};

export type LoopHarnessProtocolInputDefaults = {
  run_id?: string;
  created_at?: string;
  max_slices?: number;
  evidence_target?: unknown;
  closeout_strategy?: unknown;
  resume_policy?: unknown;
  repo?: {
    provider?: string;
    owner?: string;
    name?: string;
    branch?: string;
    [key: string]: unknown;
  };
};

export type LoopProtocolRepairRequest = {
  missing_fields: string[];
  invalid_fields: string[];
  autofill_attempted: string[];
  safe_defaults_available: string[];
  required_human_input: string[];
  repair_location: 'protocol-input';
  confirmation_required: false;
  next_action: LoopHarnessNextAction;
  resume_envelope: {
    resume_id: string;
    original_input: unknown;
    next_safe_step: string;
  };
  next_command_hint: string;
};

export type LoopHarnessProtocolInputNormalization =
  | {
      ok: true;
      input: LoopHarnessProtocolInput;
      autofill_attempted: string[];
      protocol_repair_request?: never;
    }
  | {
      ok: false;
      input?: never;
      autofill_attempted: string[];
      protocol_repair_request: LoopProtocolRepairRequest;
    };

export type LoopHarnessNextAction = {
  type: LoopHarnessNextActionType | string;
  target: string;
  label: string;
};

export type LoopHarnessProtocolOutput = {
  schema: typeof LOOP_HARNESS_OUTPUT_SCHEMA;
  schema_version: typeof LOOP_HARNESS_SCHEMA_VERSION;
  human_summary: string;
  machine_envelope: {
    status: LoopHarnessOutputStatus | string;
    run_id: string;
    route_id: string;
    consumer: string;
    completed_steps: string[];
    next_action: LoopHarnessNextAction;
    evidence: unknown[];
    artifacts: unknown[];
    stop_signal?: unknown;
    failure?: unknown;
    retry_policy?: unknown;
    protocol_repair_request?: unknown;
    resume?: unknown;
    closeout?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type LoopRunMetrics = {
  schema: typeof LOOP_RUN_METRICS_SCHEMA;
  schema_version: typeof LOOP_HARNESS_SCHEMA_VERSION;
  run_id: string;
  human_handoff_count: number;
  location_switch_count: number;
  unnecessary_confirmation_count: number;
  ambiguous_natural_language_next_step_count: number;
  structured_stop_signal_count: number;
  signal_to_review_artifact_completed: boolean;
  post_merge_closeout_evidence_count: number;
  surfaces: string[];
};

export type LoopHarnessRunStateRecord = {
  schema: typeof LOOP_HARNESS_RUN_STATE_SCHEMA;
  schema_version: typeof LOOP_HARNESS_SCHEMA_VERSION;
  run_id: string;
  source: {
    kind?: string;
    id?: string;
    [key: string]: unknown;
  };
  route_id: string;
  consumer: string;
  status: LoopHarnessOutputStatus | string;
  completed_steps: string[];
  resume_envelopes: unknown[];
  evidence: unknown[];
  artifacts: unknown[];
  storage: {
    local_path: string;
  };
};

const REQUIRED_OUTPUT_FIELDS = [
  'schema',
  'schema_version',
  'human_summary',
  'machine_envelope',
] as const;

const REQUIRED_MACHINE_ENVELOPE_FIELDS = [
  'status',
  'run_id',
  'route_id',
  'consumer',
  'completed_steps',
  'next_action',
  'evidence',
  'artifacts',
] as const;

const REQUIRED_INPUT_FIELDS = [
  'schema',
  'schema_version',
  'envelope_type',
  'intent',
  'source',
  'payload',
] as const;

const REQUIRED_NORMALIZED_PAYLOAD_FIELDS = [
  'route_id',
  'consumer',
  'authority',
  'review_artifact_target',
] as const;

export function validateLoopProtocolInput(input: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['protocol input must be an object'] };
  }

  const value = input as Partial<LoopHarnessProtocolInput>;
  for (const field of REQUIRED_INPUT_FIELDS) {
    if (value[field] === undefined || value[field] === null || value[field] === '') {
      errors.push(`missing ${field}`);
    }
  }
  if (value.schema !== LOOP_HARNESS_INPUT_SCHEMA) {
    errors.push(`schema must be ${LOOP_HARNESS_INPUT_SCHEMA}`);
  }
  if (value.schema_version !== LOOP_HARNESS_SCHEMA_VERSION) {
    errors.push(`schema_version must be ${LOOP_HARNESS_SCHEMA_VERSION}`);
  }
  if (!LOOP_HARNESS_INPUT_ENVELOPE_TYPES.includes(value.envelope_type as LoopHarnessInputEnvelopeType)) {
    errors.push(`unsupported envelope_type ${String(value.envelope_type)}`);
  }
  if (!LOOP_HARNESS_INPUT_INTENTS.includes(value.intent as LoopHarnessInputIntent)) {
    errors.push(`unsupported intent ${String(value.intent)}`);
  }
  if (!value.source || typeof value.source !== 'object' || Array.isArray(value.source)) {
    errors.push('source must be an object');
  } else if (!value.source.kind || !value.source.id) {
    errors.push('source.kind and source.id are required');
  }
  if (!value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)) {
    errors.push('payload must be an object');
  }

  return { ok: errors.length === 0, errors };
}

export function normalizeLoopProtocolInput(
  input: unknown,
  defaults: LoopHarnessProtocolInputDefaults = {},
): LoopHarnessProtocolInputNormalization {
  const validation = validateLoopProtocolInput(input);
  const autofillAttempted: string[] = [];
  if (!validation.ok) {
    return {
      ok: false,
      autofill_attempted: autofillAttempted,
      protocol_repair_request: buildProtocolRepairRequest({
        input,
        missingFields: validation.errors.filter((error) => error.startsWith('missing ')).map((error) => error.replace('missing ', '')),
        invalidFields: validation.errors.filter((error) => !error.startsWith('missing ')),
        autofillAttempted,
      }),
    };
  }

  const normalized = cloneProtocolInput(input as LoopHarnessProtocolInput);
  normalized.payload = { ...normalized.payload };
  autofillPayloadField(normalized.payload, 'run_id', defaults.run_id ?? `run-${Date.now()}`, autofillAttempted);
  autofillPayloadField(normalized.payload, 'created_at', defaults.created_at ?? new Date().toISOString(), autofillAttempted);
  autofillPayloadField(normalized.payload, 'tool', 'codex', autofillAttempted);
  autofillPayloadField(normalized.payload, 'max_slices', defaults.max_slices ?? 30, autofillAttempted);
  autofillPayloadField(normalized.payload, 'evidence_target', defaults.evidence_target ?? { kind: 'local-file', path: 'zj-loop/evidence' }, autofillAttempted);
  autofillPayloadField(normalized.payload, 'closeout_strategy', defaults.closeout_strategy ?? { mode: 'post-merge-closeout' }, autofillAttempted);
  autofillPayloadField(normalized.payload, 'resume_policy', defaults.resume_policy ?? { mode: 'resume-envelope-required' }, autofillAttempted);
  if (defaults.repo !== undefined) {
    autofillPayloadField(normalized.payload, 'repo', defaults.repo, autofillAttempted);
  }

  const missingPayloadFields = REQUIRED_NORMALIZED_PAYLOAD_FIELDS
    .filter((field) => normalized.payload[field] === undefined || normalized.payload[field] === null || normalized.payload[field] === '')
    .map((field) => `payload.${field}`);

  if (missingPayloadFields.length > 0) {
    return {
      ok: false,
      autofill_attempted: autofillAttempted,
      protocol_repair_request: buildProtocolRepairRequest({
        input: normalized,
        missingFields: missingPayloadFields,
        invalidFields: [],
        autofillAttempted,
      }),
    };
  }

  return {
    ok: true,
    input: normalized,
    autofill_attempted: autofillAttempted,
  };
}

export function validateLoopProtocolOutput(output: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return { ok: false, errors: ['protocol output must be an object'] };
  }

  const value = output as Partial<LoopHarnessProtocolOutput>;
  for (const field of REQUIRED_OUTPUT_FIELDS) {
    if (value[field] === undefined || value[field] === null || value[field] === '') {
      errors.push(`missing ${field}`);
    }
  }

  if (value.schema !== LOOP_HARNESS_OUTPUT_SCHEMA) {
    errors.push(`schema must be ${LOOP_HARNESS_OUTPUT_SCHEMA}`);
  }
  if (value.schema_version !== LOOP_HARNESS_SCHEMA_VERSION) {
    errors.push(`schema_version must be ${LOOP_HARNESS_SCHEMA_VERSION}`);
  }
  if (typeof value.human_summary !== 'string' || value.human_summary.trim() === '') {
    errors.push('human_summary must be a non-empty string');
  }
  validateMachineEnvelope(value.machine_envelope, errors);

  return { ok: errors.length === 0, errors };
}

export function renderLoopProtocolOutputMarkdown(output: LoopHarnessProtocolOutput): string {
  const validation = validateLoopProtocolOutput(output);
  if (!validation.ok) {
    throw new Error(`Invalid loop protocol output: ${validation.errors.join(', ')}`);
  }

  return [
    '## ZJ Loop Protocol Output',
    '',
    '> Structured JSON is the source of truth. This Markdown is a human-readable rendering.',
    '',
    `Status: \`${output.machine_envelope.status}\``,
    '',
    `Summary: ${output.human_summary}`,
    '',
    '### Next Action',
    ...renderNextAction(output.machine_envelope.next_action),
    '',
    '### Evidence',
    ...renderUnknownList(output.machine_envelope.evidence),
    '',
    '### Artifacts',
    ...renderUnknownList(output.machine_envelope.artifacts),
    '',
  ].join('\n');
}

export function recordLoopRunMetrics(input: {
  run_id: string;
  outputs: LoopHarnessProtocolOutput[];
}): LoopRunMetrics {
  const surfaces: string[] = [];
  let humanHandoffCount = 0;
  let ambiguousNextSteps = 0;
  let structuredStopSignals = 0;
  let postMergeCloseoutEvidenceCount = 0;
  let hasReviewArtifact = false;

  for (const output of input.outputs) {
    const validation = validateLoopProtocolOutput(output);
    if (!validation.ok) {
      throw new Error(`Invalid loop protocol output: ${validation.errors.join(', ')}`);
    }
    const envelope = output.machine_envelope;
    if (envelope.next_action.type === 'request_confirmation') humanHandoffCount++;
    if (envelope.stop_signal !== undefined) structuredStopSignals++;
    if (!envelope.next_action.type || !envelope.next_action.target || !envelope.next_action.label) {
      ambiguousNextSteps++;
    }
    for (const item of [...envelope.evidence, ...envelope.artifacts]) {
      const surface = surfaceForReference(item);
      if (surface && !surfaces.includes(surface)) surfaces.push(surface);
      if (surface === 'github-pr' || surface === 'gitlab-mr' || surface === 'local-artifact') {
        hasReviewArtifact = true;
      }
      if (surface === 'closeout') postMergeCloseoutEvidenceCount++;
    }
  }

  return {
    schema: LOOP_RUN_METRICS_SCHEMA,
    schema_version: LOOP_HARNESS_SCHEMA_VERSION,
    run_id: input.run_id,
    human_handoff_count: humanHandoffCount,
    location_switch_count: Math.max(0, surfaces.length - 1),
    unnecessary_confirmation_count: 0,
    ambiguous_natural_language_next_step_count: ambiguousNextSteps,
    structured_stop_signal_count: structuredStopSignals,
    signal_to_review_artifact_completed: hasReviewArtifact,
    post_merge_closeout_evidence_count: postMergeCloseoutEvidenceCount,
    surfaces,
  };
}

export function buildHarnessRunStateRecord(input: {
  source: LoopHarnessRunStateRecord['source'];
  output: LoopHarnessProtocolOutput;
}): LoopHarnessRunStateRecord {
  const validation = validateLoopProtocolOutput(input.output);
  if (!validation.ok) {
    throw new Error(`Invalid loop protocol output: ${validation.errors.join(', ')}`);
  }

  const envelope = input.output.machine_envelope;
  return {
    schema: LOOP_HARNESS_RUN_STATE_SCHEMA,
    schema_version: LOOP_HARNESS_SCHEMA_VERSION,
    run_id: envelope.run_id,
    source: input.source,
    route_id: envelope.route_id,
    consumer: envelope.consumer,
    status: envelope.status,
    completed_steps: envelope.completed_steps,
    resume_envelopes: envelope.resume === undefined ? [] : [envelope.resume],
    evidence: envelope.evidence,
    artifacts: envelope.artifacts,
    storage: {
      local_path: getHarnessRunStatePath(envelope.run_id),
    },
  };
}

export function getHarnessRunStatePath(runId: string): string {
  return `zj-loop/harness/runs/${sanitizeRunId(runId)}.json`;
}

export function findHarnessResumeEnvelope(
  records: LoopHarnessRunStateRecord[],
  query: {
    resume_id?: string;
    source?: { kind?: string; id?: string };
    route_id?: string;
    active_run_id?: string;
  },
): unknown | undefined {
  for (const record of records) {
    if (query.active_run_id && record.run_id !== query.active_run_id) continue;
    if (query.route_id && record.route_id !== query.route_id) continue;
    if (query.source?.kind && record.source.kind !== query.source.kind) continue;
    if (query.source?.id && record.source.id !== query.source.id) continue;

    for (const resume of record.resume_envelopes) {
      if (!query.resume_id) return resume;
      if (resume && typeof resume === 'object' && (resume as { resume_id?: unknown }).resume_id === query.resume_id) {
        return resume;
      }
    }
  }
  return undefined;
}

function surfaceForReference(item: unknown): string | undefined {
  if (!item || typeof item !== 'object') return undefined;
  const value = item as { kind?: unknown; url?: unknown; path?: unknown };
  const kind = String(value.kind ?? '');
  if (kind === 'github-pr' || kind === 'gitlab-mr' || kind === 'github-issue' || kind === 'gitlab-issue') {
    return kind;
  }
  if (kind === 'github-comment' && typeof value.url === 'string') {
    if (value.url.includes('/pull/')) return 'github-pr';
    if (value.url.includes('/issues/')) return 'github-issue';
  }
  if (kind === 'closeout' || kind === 'post-merge-closeout') return 'closeout';
  if (typeof value.path === 'string') return 'local-artifact';
  return kind || undefined;
}

function cloneProtocolInput(input: LoopHarnessProtocolInput): LoopHarnessProtocolInput {
  return JSON.parse(JSON.stringify(input)) as LoopHarnessProtocolInput;
}

function autofillPayloadField(
  payload: Record<string, unknown>,
  field: string,
  value: unknown,
  autofillAttempted: string[],
) {
  if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
    payload[field] = value;
    autofillAttempted.push(field);
  }
}

function buildProtocolRepairRequest(input: {
  input: unknown;
  missingFields: string[];
  invalidFields: string[];
  autofillAttempted: string[];
}): LoopProtocolRepairRequest {
  const resumeId = `protocol-repair-${stableHash(input.input)}`;
  return {
    missing_fields: input.missingFields,
    invalid_fields: input.invalidFields,
    autofill_attempted: input.autofillAttempted,
    safe_defaults_available: [
      'run_id',
      'created_at',
      'tool',
      'max_slices',
      'evidence_target',
      'closeout_strategy',
      'resume_policy',
      'repo',
    ],
    required_human_input: input.missingFields,
    repair_location: 'protocol-input',
    confirmation_required: false,
    next_action: {
      type: 'resume_loop',
      target: `protocol-repair:${resumeId}`,
      label: 'Repair protocol input and resume',
    },
    resume_envelope: {
      resume_id: resumeId,
      original_input: input.input,
      next_safe_step: 'repair_protocol_input',
    },
    next_command_hint: 'Provide a complete harness input envelope and resume with the included resume_envelope.',
  };
}

function stableHash(value: unknown): string {
  const text = JSON.stringify(value, Object.keys(flattenForStableStringify(value)).sort());
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

function sanitizeRunId(runId: string): string {
  const sanitized = runId.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return sanitized || 'run';
}

function flattenForStableStringify(value: unknown): Record<string, unknown> {
  const keys: Record<string, unknown> = {};
  collectKeys(value, keys);
  return keys;
}

function collectKeys(value: unknown, keys: Record<string, unknown>) {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    keys[key] = true;
    collectKeys(nested, keys);
  }
}

function renderNextAction(nextAction: LoopHarnessNextAction): string[] {
  return [`- \`${nextAction.type}\` -> \`${nextAction.target}\`: ${nextAction.label}`];
}

function renderUnknownList(items: unknown[]): string[] {
  if (items.length === 0) return ['- None'];
  return items.map((item) => `- ${JSON.stringify(item)}`);
}

function validateMachineEnvelope(machineEnvelope: unknown, errors: string[]) {
  if (!machineEnvelope || typeof machineEnvelope !== 'object' || Array.isArray(machineEnvelope)) {
    errors.push('machine_envelope must be an object');
    return;
  }

  const value = machineEnvelope as LoopHarnessProtocolOutput['machine_envelope'];
  for (const field of REQUIRED_MACHINE_ENVELOPE_FIELDS) {
    if (value[field] === undefined || value[field] === null || value[field] === '') {
      errors.push(`missing machine_envelope.${field}`);
    }
  }

  if (!LOOP_HARNESS_OUTPUT_STATUSES.includes(value.status as LoopHarnessOutputStatus)) {
    errors.push(`unsupported machine_envelope.status ${String(value.status)}`);
  }
  if (typeof value.run_id !== 'string' || value.run_id.trim() === '') {
    errors.push('machine_envelope.run_id must be a non-empty string');
  }
  if (typeof value.route_id !== 'string' || value.route_id.trim() === '') {
    errors.push('machine_envelope.route_id must be a non-empty string');
  }
  if (typeof value.consumer !== 'string' || value.consumer.trim() === '') {
    errors.push('machine_envelope.consumer must be a non-empty string');
  }
  if (!Array.isArray(value.completed_steps)) {
    errors.push('machine_envelope.completed_steps must be an array');
  }
  validateNextAction(value.next_action, 'machine_envelope.next_action', errors);
  if (!Array.isArray(value.evidence)) {
    errors.push('machine_envelope.evidence must be an array');
  }
  if (!Array.isArray(value.artifacts)) {
    errors.push('machine_envelope.artifacts must be an array');
  }
  validateStatusSpecificFields(value, errors);
}

function validateStatusSpecificFields(value: LoopHarnessProtocolOutput['machine_envelope'], errors: string[]) {
  if (value.status === 'stopped') {
    if (value.stop_signal === undefined) errors.push('stopped status requires machine_envelope.stop_signal');
    if (value.resume === undefined) errors.push('stopped status requires machine_envelope.resume');
  }
  if (value.status === 'failed') {
    if (value.failure === undefined) errors.push('failed status requires machine_envelope.failure');
    if (value.retry_policy === undefined) errors.push('failed status requires machine_envelope.retry_policy');
  }
  if (value.status === 'needs_protocol_repair') {
    if (value.protocol_repair_request === undefined) {
      errors.push('needs_protocol_repair status requires machine_envelope.protocol_repair_request');
    }
  }
}

function validateNextAction(nextAction: unknown, path: string, errors: string[]) {
  if (!nextAction || typeof nextAction !== 'object' || Array.isArray(nextAction)) {
    errors.push(`${path} must be an object`);
    return;
  }
  const value = nextAction as Partial<LoopHarnessNextAction>;
  if (!LOOP_HARNESS_NEXT_ACTION_TYPES.includes(value.type as LoopHarnessNextActionType)) {
    errors.push(`unsupported ${path}.type ${String(value.type)}`);
  }
  if (typeof value.target !== 'string' || value.target.trim() === '') {
    errors.push(`${path}.target must be a non-empty string`);
  }
  if (typeof value.label !== 'string' || value.label.trim() === '') {
    errors.push(`${path}.label must be a non-empty string`);
  }
}
