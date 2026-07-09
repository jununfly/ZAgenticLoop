import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const PRD_HANDOFF_SCHEMA = 'zj-loop.prd_handoff.v1';
export const PRD_HANDOFF_MARKER = '<!-- zj-loop:prd-next-command-handoff -->';
export const PRD_HANDOFF_MODES = ['report-only', 'comment-enabled'] as const;

export type PrdHandoffMode = typeof PRD_HANDOFF_MODES[number];

export type PrdHandoffRequest = {
  schema?: string;
  prd_issue_url: string;
  next_command: string;
  detected_by?: string;
  detected_at?: string;
  mode?: PrdHandoffMode;
  repo?: string;
  issue?: number | string;
};

export async function readPrdHandoffRequest(path: string): Promise<PrdHandoffRequest> {
  return JSON.parse(await readFile(path, 'utf8'));
}

export function buildPrdHandoffRequest(overrides: Partial<PrdHandoffRequest> = {}): PrdHandoffRequest {
  return {
    schema: PRD_HANDOFF_SCHEMA,
    prd_issue_url: 'https://github.com/jununfly/ZCodeGraph/issues/678',
    next_command:
      'Ask Codex: "Run the roadmap-sliced-development loop for ZCodeGraph issue #678. Create an isolated branch, implement the smallest C++ baseline extraction slice, validate on a suitably sized C++ GitHub project, and stop before PR unless explicitly approved."',
    detected_by: 'daily-triage',
    detected_at: '2026-07-09T00:00:00Z',
    mode: 'report-only',
    ...overrides,
  };
}

export function runPrdHandoffRunner(input: { request: PrdHandoffRequest }) {
  const request = normalizeRequest(input.request);
  const validation = validatePrdHandoffRequest(request);
  const target = parseGitHubIssueUrl(request.prd_issue_url, request.repo, request.issue);
  const commentBody = validation.ok && target.ok ? buildPrdHandoffCommentBody(request) : '';
  const manualCommand = validation.ok && target.ok
    ? buildGhIssueCommentCommand({
        repo: target.repo,
        issue: target.issue,
        body: commentBody,
      })
    : '';
  const commentWriteAllowed = request.mode === 'comment-enabled';

  return {
    kind: 'zj-loop.prd-handoff-runner-result',
    schema: PRD_HANDOFF_SCHEMA,
    request_id: `prd_handoff_${stableHash(`${request.prd_issue_url}:${request.next_command}`)}`,
    decision: validation.ok && target.ok
      ? {
          status: 'planned',
          reason: commentWriteAllowed
            ? 'comment-enabled-explicit-opt-in'
            : 'report-only-manual-command-required',
        }
      : {
          status: 'rejected',
          reason: validation.errors[0] ?? target.error ?? 'invalid-request',
        },
    prd_issue: target.ok
      ? {
          provider: 'github',
          repo: target.repo,
          issue: target.issue,
          url: request.prd_issue_url,
        }
      : null,
    mode: request.mode,
    handoff_locations: commentWriteAllowed
      ? ['prd-issue-comment']
      : ['local-report', 'manual-gh-command'],
    idempotency: {
      marker: PRD_HANDOFF_MARKER,
      policy: 'skip-or-update-existing-marker',
    },
    comment_body: commentBody,
    manual_command: manualCommand,
    side_effects: {
      executed: false,
      issue_comment_planned: commentWriteAllowed,
      issue_comment_written: false,
      report_only: request.mode === 'report-only',
    },
    validation: target.ok
      ? validation
      : { ok: false, errors: [...validation.errors, target.error].filter(Boolean) },
  };
}

export function buildPrdHandoffCommentBody(request: PrdHandoffRequest) {
  const detectedBy = request.detected_by ?? 'daily-triage';
  const detectedAt = request.detected_at ?? 'unknown';
  const mode = request.mode ?? 'report-only';
  return [
    PRD_HANDOFF_MARKER,
    '## ZJ Loop next command',
    '',
    `Detected by ${detectedBy} on ${detectedAt}.`,
    '',
    'Recommended command:',
    '',
    '```text',
    request.next_command,
    '```',
    '',
    `Mode: ${mode === 'comment-enabled' ? 'approved PRD issue comment handoff' : 'report-only handoff. Human approval required before execution'}.`,
    '',
  ].join('\n');
}

export function buildGhIssueCommentCommand(input: { repo: string; issue: string; body: string }) {
  return [
    'gh',
    'issue',
    'comment',
    shellQuote(input.issue),
    '--repo',
    shellQuote(input.repo),
    '--body',
    shellQuote(input.body),
  ].join(' ');
}

function normalizeRequest(request: PrdHandoffRequest): PrdHandoffRequest {
  return {
    ...request,
    schema: request.schema ?? PRD_HANDOFF_SCHEMA,
    detected_by: request.detected_by ?? 'daily-triage',
    mode: request.mode ?? 'report-only',
  };
}

function validatePrdHandoffRequest(request: PrdHandoffRequest) {
  const errors: string[] = [];
  if (request.schema !== PRD_HANDOFF_SCHEMA) errors.push('schema');
  if (!request.prd_issue_url) errors.push('prd_issue_url');
  if (!request.next_command?.trim()) errors.push('next_command');
  if (!PRD_HANDOFF_MODES.includes((request.mode ?? 'report-only') as PrdHandoffMode)) errors.push('mode');
  return { ok: errors.length === 0, errors };
}

function parseGitHubIssueUrl(url: string, repoOverride?: string, issueOverride?: string | number) {
  if (repoOverride && issueOverride !== undefined) {
    return { ok: true as const, repo: repoOverride, issue: String(issueOverride) };
  }
  const match = String(url).match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)(?:[/?#].*)?$/);
  if (!match) return { ok: false as const, error: 'prd_issue_url must be a GitHub issue URL or repo/issue must be provided' };
  return { ok: true as const, repo: match[1], issue: match[2] };
}

function stableHash(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function shellQuote(value: string) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
