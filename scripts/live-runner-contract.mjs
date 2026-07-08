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
};

export const SIDE_EFFECT_LEVELS = [
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

const STRUCTURED_COMMENT_PATTERN =
  /<!--\s*zj-loop:live-runner-evidence\s+(?<json>[\s\S]*?)-->/g;

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

  for (const field of REQUIRED_FIELDS) {
    if (evidence[field] === undefined || evidence[field] === null || evidence[field] === '') {
      errors.push(`missing ${field}`);
    }
  }

  if (evidence.schema !== LIVE_RUNNER_EVIDENCE_SCHEMA) {
    errors.push(`schema must be ${LIVE_RUNNER_EVIDENCE_SCHEMA}`);
  }
  if (!Object.hasOwn(COMPLETION_FORMS_BY_KIND, evidence.consumer_kind)) {
    errors.push(`unsupported consumer_kind ${evidence.consumer_kind}`);
  } else if (!COMPLETION_FORMS_BY_KIND[evidence.consumer_kind].includes(evidence.completion_form)) {
    errors.push(`${evidence.consumer_kind} cannot use completion_form ${evidence.completion_form}`);
  }
  if (!RUNNER_EVIDENCE_STATUSES.includes(evidence.status)) {
    errors.push(`unsupported status ${evidence.status}`);
  }
  if (!['live', 'dry-run'].includes(evidence.execution_mode)) {
    errors.push('execution_mode must be live or dry-run');
  }
  if (!Array.isArray(evidence.verifier_evidence) || evidence.verifier_evidence.length === 0) {
    errors.push('verifier_evidence must be a non-empty array');
  }
  if (!evidence.source || typeof evidence.source !== 'object') {
    errors.push('source must be an object');
  } else if (!evidence.source.kind || !evidence.source.id) {
    errors.push('source.kind and source.id are required');
  }
  validateSideEffects(evidence.side_effects, errors);
  validateCompletionStatus(evidence, errors);

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
        const evidence = JSON.parse(match.groups.json.trim());
        if (evidence?.schema !== LIVE_RUNNER_EVIDENCE_SCHEMA) continue;
        parsed.push({
          commentId: comment.id,
          author: comment.author,
          createdAt: comment.createdAt,
          evidence,
          validation: validateLiveRunnerEvidence(evidence),
        });
      } catch (error) {
        parsed.push({
          commentId: comment.id,
          author: comment.author,
          createdAt: comment.createdAt,
          evidence: null,
          validation: { ok: false, errors: [`invalid-json: ${error.message}`] },
        });
      }
    }
  }
  return parsed;
}

function validateSideEffects(sideEffects, errors) {
  if (!sideEffects || typeof sideEffects !== 'object') {
    errors.push('side_effects must be an object');
    return;
  }
  if (typeof sideEffects.executed !== 'boolean') {
    errors.push('side_effects.executed must be boolean');
  }
  if (!SIDE_EFFECT_LEVELS.includes(sideEffects.level)) {
    errors.push(`unsupported side_effects.level ${sideEffects.level}`);
  }
  if (!Array.isArray(sideEffects.actions)) {
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
  if (['repair-pr', 'draft-pr', 'draft-evidence', 'cleanup-done', 'roadmap-branch-pr'].includes(form) && status !== 'completed') {
    errors.push(`${form} completion_form requires status completed`);
  }
  if (form === 'activation-resumable' && !['completed', 'skipped'].includes(status)) {
    errors.push('activation-resumable completion_form requires status completed or skipped');
  }
}
