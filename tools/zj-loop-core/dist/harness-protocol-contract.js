export const LOOP_HARNESS_OUTPUT_SCHEMA = 'zj-loop.harness_output.v1';
export const LOOP_HARNESS_INPUT_SCHEMA = 'zj-loop.harness_input.v1';
export const LOOP_RUN_METRICS_SCHEMA = 'zj-loop.run_metrics.v1';
export const LOOP_HARNESS_RUN_STATE_SCHEMA = 'zj-loop.harness_run_state.v1';
export const LOOP_HARNESS_SCHEMA_VERSION = 1;
export const LOOP_HARNESS_INPUT_ENVELOPE_TYPES = [
    'slash_command',
    'fenced_protocol_block',
    'deterministic_cli_output',
];
export const LOOP_HARNESS_INPUT_INTENTS = [
    'run_route',
    'resume_loop',
    'confirm',
    'closeout',
];
export const LOOP_HARNESS_OUTPUT_STATUSES = [
    'completed',
    'in_progress',
    'stopped',
    'failed',
    'skipped',
    'needs_protocol_repair',
];
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
];
const REQUIRED_OUTPUT_FIELDS = [
    'schema',
    'schema_version',
    'human_summary',
    'machine_envelope',
];
const REQUIRED_MACHINE_ENVELOPE_FIELDS = [
    'status',
    'run_id',
    'route_id',
    'consumer',
    'completed_steps',
    'next_action',
    'evidence',
    'artifacts',
];
const REQUIRED_INPUT_FIELDS = [
    'schema',
    'schema_version',
    'envelope_type',
    'intent',
    'source',
    'payload',
];
const REQUIRED_NORMALIZED_PAYLOAD_FIELDS = [
    'route_id',
    'consumer',
    'authority',
    'review_artifact_target',
];
export function validateLoopProtocolInput(input) {
    const errors = [];
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { ok: false, errors: ['protocol input must be an object'] };
    }
    const value = input;
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
    if (!LOOP_HARNESS_INPUT_ENVELOPE_TYPES.includes(value.envelope_type)) {
        errors.push(`unsupported envelope_type ${String(value.envelope_type)}`);
    }
    if (!LOOP_HARNESS_INPUT_INTENTS.includes(value.intent)) {
        errors.push(`unsupported intent ${String(value.intent)}`);
    }
    if (!value.source || typeof value.source !== 'object' || Array.isArray(value.source)) {
        errors.push('source must be an object');
    }
    else if (!value.source.kind || !value.source.id) {
        errors.push('source.kind and source.id are required');
    }
    if (!value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)) {
        errors.push('payload must be an object');
    }
    return { ok: errors.length === 0, errors };
}
export function normalizeLoopProtocolInput(input, defaults = {}) {
    const validation = validateLoopProtocolInput(input);
    const autofillAttempted = [];
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
    const normalized = cloneProtocolInput(input);
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
export function validateLoopProtocolOutput(output) {
    const errors = [];
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
        return { ok: false, errors: ['protocol output must be an object'] };
    }
    const value = output;
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
export function renderLoopProtocolOutputMarkdown(output) {
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
export function recordLoopRunMetrics(input) {
    const surfaces = [];
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
        if (envelope.next_action.type === 'request_confirmation')
            humanHandoffCount++;
        if (envelope.stop_signal !== undefined)
            structuredStopSignals++;
        if (!envelope.next_action.type || !envelope.next_action.target || !envelope.next_action.label) {
            ambiguousNextSteps++;
        }
        for (const item of [...envelope.evidence, ...envelope.artifacts]) {
            const surface = surfaceForReference(item);
            if (surface && !surfaces.includes(surface))
                surfaces.push(surface);
            if (surface === 'github-pr' || surface === 'gitlab-mr' || surface === 'local-artifact') {
                hasReviewArtifact = true;
            }
            if (surface === 'closeout')
                postMergeCloseoutEvidenceCount++;
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
export function buildHarnessRunStateRecord(input) {
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
export function getHarnessRunStatePath(runId) {
    return `zj-loop/harness/runs/${sanitizeRunId(runId)}.json`;
}
export function findHarnessResumeEnvelope(records, query) {
    for (const record of records) {
        if (query.active_run_id && record.run_id !== query.active_run_id)
            continue;
        if (query.route_id && record.route_id !== query.route_id)
            continue;
        if (query.source?.kind && record.source.kind !== query.source.kind)
            continue;
        if (query.source?.id && record.source.id !== query.source.id)
            continue;
        for (const resume of record.resume_envelopes) {
            if (!query.resume_id)
                return resume;
            if (resume && typeof resume === 'object' && resume.resume_id === query.resume_id) {
                return resume;
            }
        }
    }
    return undefined;
}
function surfaceForReference(item) {
    if (!item || typeof item !== 'object')
        return undefined;
    const value = item;
    const kind = String(value.kind ?? '');
    if (kind === 'github-pr' || kind === 'gitlab-mr' || kind === 'github-issue' || kind === 'gitlab-issue') {
        return kind;
    }
    if (kind === 'github-comment' && typeof value.url === 'string') {
        if (value.url.includes('/pull/'))
            return 'github-pr';
        if (value.url.includes('/issues/'))
            return 'github-issue';
    }
    if (kind === 'closeout' || kind === 'post-merge-closeout')
        return 'closeout';
    if (typeof value.path === 'string')
        return 'local-artifact';
    return kind || undefined;
}
function cloneProtocolInput(input) {
    return JSON.parse(JSON.stringify(input));
}
function autofillPayloadField(payload, field, value, autofillAttempted) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
        payload[field] = value;
        autofillAttempted.push(field);
    }
}
function buildProtocolRepairRequest(input) {
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
        resume_envelope: {
            resume_id: `protocol-repair-${stableHash(input.input)}`,
            original_input: input.input,
            next_safe_step: 'repair_protocol_input',
        },
        next_command_hint: 'Provide a complete harness input envelope and resume with the included resume_envelope.',
    };
}
function stableHash(value) {
    const text = JSON.stringify(value, Object.keys(flattenForStableStringify(value)).sort());
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
        hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
}
function sanitizeRunId(runId) {
    const sanitized = runId.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return sanitized || 'run';
}
function flattenForStableStringify(value) {
    const keys = {};
    collectKeys(value, keys);
    return keys;
}
function collectKeys(value, keys) {
    if (!value || typeof value !== 'object')
        return;
    for (const [key, nested] of Object.entries(value)) {
        keys[key] = true;
        collectKeys(nested, keys);
    }
}
function renderNextAction(nextAction) {
    return [`- \`${nextAction.type}\` -> \`${nextAction.target}\`: ${nextAction.label}`];
}
function renderUnknownList(items) {
    if (items.length === 0)
        return ['- None'];
    return items.map((item) => `- ${JSON.stringify(item)}`);
}
function validateMachineEnvelope(machineEnvelope, errors) {
    if (!machineEnvelope || typeof machineEnvelope !== 'object' || Array.isArray(machineEnvelope)) {
        errors.push('machine_envelope must be an object');
        return;
    }
    const value = machineEnvelope;
    for (const field of REQUIRED_MACHINE_ENVELOPE_FIELDS) {
        if (value[field] === undefined || value[field] === null || value[field] === '') {
            errors.push(`missing machine_envelope.${field}`);
        }
    }
    if (!LOOP_HARNESS_OUTPUT_STATUSES.includes(value.status)) {
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
function validateStatusSpecificFields(value, errors) {
    if (value.status === 'stopped') {
        if (value.stop_signal === undefined)
            errors.push('stopped status requires machine_envelope.stop_signal');
        if (value.resume === undefined)
            errors.push('stopped status requires machine_envelope.resume');
    }
    if (value.status === 'failed') {
        if (value.failure === undefined)
            errors.push('failed status requires machine_envelope.failure');
        if (value.retry_policy === undefined)
            errors.push('failed status requires machine_envelope.retry_policy');
    }
    if (value.status === 'needs_protocol_repair') {
        if (value.protocol_repair_request === undefined) {
            errors.push('needs_protocol_repair status requires machine_envelope.protocol_repair_request');
        }
    }
}
function validateNextAction(nextAction, path, errors) {
    if (!nextAction || typeof nextAction !== 'object' || Array.isArray(nextAction)) {
        errors.push(`${path} must be an object`);
        return;
    }
    const value = nextAction;
    if (!LOOP_HARNESS_NEXT_ACTION_TYPES.includes(value.type)) {
        errors.push(`unsupported ${path}.type ${String(value.type)}`);
    }
    if (typeof value.target !== 'string' || value.target.trim() === '') {
        errors.push(`${path}.target must be a non-empty string`);
    }
    if (typeof value.label !== 'string' || value.label.trim() === '') {
        errors.push(`${path}.label must be a non-empty string`);
    }
}
