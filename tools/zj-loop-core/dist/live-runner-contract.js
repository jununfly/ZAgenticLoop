export const LIVE_RUNNER_EVIDENCE_SCHEMA = 'zj-loop.live_runner_evidence.v1';
export const RUNNER_EVIDENCE_STATUSES = [
    'completed',
    'skipped',
    'failed',
    'escalated',
];
export const COMPLETION_FORMS_BY_KIND = {
    'fix-runner': ['repair-pr', 'escalation-issue'],
    'draft-consumer': ['draft-pr', 'draft-evidence', 'escalation-issue'],
    'cleanup-consumer': ['cleanup-done', 'cleanup-skipped', 'escalation-issue'],
    'activation-consumer': ['roadmap-branch-pr', 'activation-failed', 'activation-resumable'],
    'triage-action-consumer': [
        'triage-label-applied',
        'triage-comment-posted',
        'triage-transition-confirmed',
        'issue-fix-request-created',
        'triage-action-skipped',
        'escalation-issue',
    ],
};
export const LIVE_RUNNER_SIDE_EFFECT_LEVELS = [
    'none',
    'evidence',
    'request',
    'claim',
    'issue-comment',
    'label',
    'branch',
    'pr',
    'draft-pr',
    'cleanup',
];
const REQUIRED_FIELDS = [
    'schema',
    'runner_id',
    'route_id',
    'consumer_kind',
    'execution_mode',
    'completion_form',
    'status',
    'dedupe_key',
    'created_at',
    'source',
    'verifier_evidence',
    'side_effects',
];
const STRUCTURED_COMMENT_PATTERN = /<!--\s*zj-loop:live-runner-evidence\s+(?<json>[\s\S]*?)-->/g;
export function buildLiveRunnerEvidence(input) {
    return {
        schema: LIVE_RUNNER_EVIDENCE_SCHEMA,
        ...input,
    };
}
export function validateLiveRunnerEvidence(evidence) {
    const errors = [];
    if (!evidence || typeof evidence !== 'object') {
        return { ok: false, errors: ['evidence must be an object'] };
    }
    const value = evidence;
    for (const field of REQUIRED_FIELDS) {
        if (value[field] === undefined || value[field] === null || value[field] === '') {
            errors.push(`missing ${field}`);
        }
    }
    if (value.schema !== LIVE_RUNNER_EVIDENCE_SCHEMA) {
        errors.push(`schema must be ${LIVE_RUNNER_EVIDENCE_SCHEMA}`);
    }
    if (!Object.hasOwn(COMPLETION_FORMS_BY_KIND, String(value.consumer_kind))) {
        errors.push(`unsupported consumer_kind ${String(value.consumer_kind)}`);
    }
    else if (!completionFormsFor(String(value.consumer_kind)).includes(String(value.completion_form))) {
        errors.push(`${String(value.consumer_kind)} cannot use completion_form ${String(value.completion_form)}`);
    }
    if (!RUNNER_EVIDENCE_STATUSES.includes(value.status)) {
        errors.push(`unsupported status ${String(value.status)}`);
    }
    if (value.execution_mode !== 'live' && value.execution_mode !== 'dry-run') {
        errors.push('execution_mode must be live or dry-run');
    }
    if (!Array.isArray(value.verifier_evidence) || value.verifier_evidence.length === 0) {
        errors.push('verifier_evidence must be a non-empty array');
    }
    if (!value.source || typeof value.source !== 'object') {
        errors.push('source must be an object');
    }
    else if (!value.source.kind || !value.source.id) {
        errors.push('source.kind and source.id are required');
    }
    validateSideEffects(value.side_effects, errors);
    validateCompletionStatus(value, errors);
    return { ok: errors.length === 0, errors };
}
export function buildLiveRunnerEvidenceComment(evidence) {
    const validation = validateLiveRunnerEvidence(evidence);
    if (!validation.ok) {
        throw new Error(`Invalid live runner evidence: ${validation.errors.join(', ')}`);
    }
    return [
        '<!-- zj-loop:live-runner-evidence',
        JSON.stringify(evidence, null, 2),
        '-->',
        `Live runner evidence recorded for ${evidence.route_id}.`,
        '',
    ].join('\n');
}
export function parseLiveRunnerEvidenceComments(comments) {
    const parsed = [];
    for (const comment of Array.isArray(comments) ? comments : []) {
        const body = String(comment.body ?? '');
        for (const match of body.matchAll(STRUCTURED_COMMENT_PATTERN)) {
            try {
                const evidence = JSON.parse(match.groups?.json?.trim() ?? '');
                if (evidence?.schema !== LIVE_RUNNER_EVIDENCE_SCHEMA)
                    continue;
                parsed.push({
                    commentId: comment.id,
                    author: comment.author,
                    createdAt: comment.createdAt,
                    evidence,
                    validation: validateLiveRunnerEvidence(evidence),
                });
            }
            catch (error) {
                parsed.push({
                    commentId: comment.id,
                    author: comment.author,
                    createdAt: comment.createdAt,
                    evidence: null,
                    validation: { ok: false, errors: [`invalid-json: ${error instanceof Error ? error.message : String(error)}`] },
                });
            }
        }
    }
    return parsed;
}
function completionFormsFor(consumerKind) {
    return [...(COMPLETION_FORMS_BY_KIND[consumerKind] ?? [])];
}
function validateSideEffects(sideEffects, errors) {
    if (!sideEffects || typeof sideEffects !== 'object') {
        errors.push('side_effects must be an object');
        return;
    }
    const value = sideEffects;
    if (typeof value.executed !== 'boolean') {
        errors.push('side_effects.executed must be boolean');
    }
    if (!LIVE_RUNNER_SIDE_EFFECT_LEVELS.includes(value.level)) {
        errors.push(`unsupported side_effects.level ${String(value.level)}`);
    }
    if (!Array.isArray(value.actions)) {
        errors.push('side_effects.actions must be an array');
    }
}
function validateCompletionStatus(evidence, errors) {
    const form = evidence.completion_form;
    const status = evidence.status;
    if (form === 'escalation-issue' && status !== 'escalated') {
        errors.push('escalation-issue completion_form requires status escalated');
    }
    if (form === 'cleanup-skipped' && status !== 'skipped') {
        errors.push('cleanup-skipped completion_form requires status skipped');
    }
    if (form === 'activation-failed' && status !== 'failed') {
        errors.push('activation-failed completion_form requires status failed');
    }
    if (['repair-pr', 'draft-pr', 'draft-evidence', 'cleanup-done', 'roadmap-branch-pr'].includes(String(form)) && status !== 'completed') {
        errors.push(`${String(form)} completion_form requires status completed`);
    }
    if (form === 'activation-resumable' && status !== 'completed' && status !== 'skipped') {
        errors.push('activation-resumable completion_form requires status completed or skipped');
    }
    if (form === 'triage-action-skipped' && status !== 'skipped') {
        errors.push('triage-action-skipped completion_form requires status skipped');
    }
    if ((form === 'triage-label-applied' || form === 'triage-comment-posted') && status !== 'completed') {
        errors.push(`${form} completion_form requires status completed`);
    }
}
