export const LOOP_HARNESS_OUTPUT_SCHEMA = 'zj-loop.harness_output.v1';
export const LOOP_HARNESS_INPUT_SCHEMA = 'zj-loop.harness_input.v1';
export const LOOP_RUN_METRICS_SCHEMA = 'zj-loop.run_metrics.v1';
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
    'continued',
    'stopped',
    'completed',
    'failed',
    'needs_confirmation',
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
const CONFIRMATION_REQUIRED_FIELDS = [
    'kind',
    'confirmation_id',
    'required_phrase',
    'scope',
    'side_effects',
    'location',
    'actor_requirement',
];
const REQUIRED_OUTPUT_FIELDS = [
    'schema',
    'schema_version',
    'status',
    'summary',
    'next_actions',
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
    if (!LOOP_HARNESS_OUTPUT_STATUSES.includes(value.status)) {
        errors.push(`unsupported status ${String(value.status)}`);
    }
    if (typeof value.summary !== 'string' || value.summary.trim() === '') {
        errors.push('summary must be a non-empty string');
    }
    validateNextActions(value.next_actions, errors);
    if (!Array.isArray(value.evidence)) {
        errors.push('evidence must be an array');
    }
    if (!Array.isArray(value.artifacts)) {
        errors.push('artifacts must be an array');
    }
    validateStatusSpecificFields(value, errors);
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
        `Status: \`${output.status}\``,
        '',
        `Summary: ${output.summary}`,
        '',
        '### Next Actions',
        ...renderNextActions(output.next_actions),
        '',
        '### Evidence',
        ...renderUnknownList(output.evidence),
        '',
        '### Artifacts',
        ...renderUnknownList(output.artifacts),
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
        if (output.status === 'needs_confirmation')
            humanHandoffCount++;
        if (output.stop_signal !== undefined)
            structuredStopSignals++;
        if (output.next_actions.some((action) => !action.type || !action.target || !action.label)) {
            ambiguousNextSteps++;
        }
        for (const item of [...output.evidence, ...output.artifacts]) {
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
function renderNextActions(nextActions) {
    if (nextActions.length === 0)
        return ['- None'];
    return nextActions.map((action) => `- \`${action.type}\` -> \`${action.target}\`: ${action.label}`);
}
function renderUnknownList(items) {
    if (items.length === 0)
        return ['- None'];
    return items.map((item) => `- ${JSON.stringify(item)}`);
}
function validateStatusSpecificFields(value, errors) {
    if (value.status === 'stopped' && value.stop_signal === undefined) {
        errors.push('stopped status requires stop_signal');
    }
    if (value.status === 'failed' && value.stop_signal === undefined) {
        errors.push('failed status requires stop_signal');
    }
    if (value.status === 'needs_confirmation') {
        if (value.stop_signal === undefined) {
            errors.push('needs_confirmation status requires stop_signal');
        }
        if (value.confirmation === undefined) {
            errors.push('needs_confirmation status requires confirmation');
        }
        else {
            validateConfirmationEnvelope(value.confirmation, errors);
        }
    }
}
function validateConfirmationEnvelope(confirmation, errors) {
    if (!confirmation || typeof confirmation !== 'object' || Array.isArray(confirmation)) {
        errors.push('confirmation must be an object');
        return;
    }
    const value = confirmation;
    for (const field of CONFIRMATION_REQUIRED_FIELDS) {
        if (value[field] === undefined || value[field] === null || value[field] === '') {
            errors.push(`confirmation.${field} is required`);
        }
    }
    if (value.kind !== 'confirmation') {
        errors.push('confirmation.kind must be confirmation');
    }
    if (!Array.isArray(value.side_effects)) {
        errors.push('confirmation.side_effects must be an array');
    }
    if (value.valid_until_state === undefined && value.expires_at === undefined) {
        errors.push('confirmation.valid_until_state or confirmation.expires_at is required');
    }
}
function validateNextActions(nextActions, errors) {
    if (!Array.isArray(nextActions)) {
        errors.push('next_actions must be an array');
        return;
    }
    for (const [index, action] of nextActions.entries()) {
        if (!action || typeof action !== 'object' || Array.isArray(action)) {
            errors.push(`next_actions[${index}] must be an object`);
            continue;
        }
        const value = action;
        if (!LOOP_HARNESS_NEXT_ACTION_TYPES.includes(value.type)) {
            errors.push(`unsupported next_actions[${index}].type ${String(value.type)}`);
        }
        if (typeof value.target !== 'string' || value.target.trim() === '') {
            errors.push(`next_actions[${index}].target must be a non-empty string`);
        }
        if (typeof value.label !== 'string' || value.label.trim() === '') {
            errors.push(`next_actions[${index}].label must be a non-empty string`);
        }
    }
}
