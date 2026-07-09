import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  PRD_HANDOFF_MARKER,
  buildPrdHandoffRequest,
  runPrdHandoffRunner,
} from '../dist/index.js';

const PRD_HANDOFF_CLI = fileURLToPath(new URL('../dist/prd-handoff-cli.js', import.meta.url));

test('PRD handoff report-only mode produces a manual gh issue comment command without side effects', () => {
  const result = runPrdHandoffRunner({ request: buildPrdHandoffRequest() });

  assert.equal(result.decision.status, 'planned');
  assert.equal(result.decision.reason, 'report-only-manual-command-required');
  assert.deepEqual(result.handoff_locations, ['local-report', 'manual-gh-command']);
  assert.equal(result.side_effects.executed, false);
  assert.equal(result.side_effects.issue_comment_planned, false);
  assert.equal(result.side_effects.issue_comment_written, false);
  assert.match(result.comment_body, new RegExp(PRD_HANDOFF_MARKER));
  assert.match(result.comment_body, /## ZJ Loop next command/);
  assert.match(result.comment_body, /Mode: report-only handoff/);
  assert.match(result.manual_command, /^gh issue comment '678' --repo 'jununfly\/ZCodeGraph' --body '/);
  assert.match(result.manual_command, /zj-loop:prd-next-command-handoff/);
});

test('PRD handoff comment-enabled mode plans the same marker but still does not execute writes', () => {
  const result = runPrdHandoffRunner({
    request: buildPrdHandoffRequest({
      mode: 'comment-enabled',
      detected_at: '2026-07-09T10:00:00Z',
    }),
  });

  assert.equal(result.decision.status, 'planned');
  assert.equal(result.decision.reason, 'comment-enabled-explicit-opt-in');
  assert.deepEqual(result.handoff_locations, ['prd-issue-comment']);
  assert.equal(result.side_effects.executed, false);
  assert.equal(result.side_effects.issue_comment_planned, true);
  assert.equal(result.side_effects.issue_comment_written, false);
  assert.match(result.comment_body, /Mode: approved PRD issue comment handoff/);
});

test('PRD handoff validates issue target and required command', () => {
  const missingCommand = runPrdHandoffRunner({
    request: buildPrdHandoffRequest({ next_command: '' }),
  });
  const badUrl = runPrdHandoffRunner({
    request: buildPrdHandoffRequest({ prd_issue_url: 'https://example.com/nope' }),
  });

  assert.equal(missingCommand.decision.status, 'rejected');
  assert.match(missingCommand.validation.errors.join('\n'), /next_command/);
  assert.equal(badUrl.decision.status, 'rejected');
  assert.match(badUrl.validation.errors.join('\n'), /GitHub issue URL/);
});

test('PRD handoff CLI writes JSON result and comment body', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-prd-handoff-'));
  const requestPath = path.join(dir, 'request.json');
  const outPath = path.join(dir, 'result.json');
  const commentPath = path.join(dir, 'comment.md');
  await writeFile(requestPath, JSON.stringify(buildPrdHandoffRequest(), null, 2));

  const result = spawnSync(process.execPath, [
    PRD_HANDOFF_CLI,
    'handoff-plan',
    '--request',
    requestPath,
    '--out',
    outPath,
    '--comment-out',
    commentPath,
    '--json',
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(await readFile(outPath, 'utf8'));
  const comment = await readFile(commentPath, 'utf8');
  assert.equal(parsed.schema, 'zj-loop.prd_handoff.v1');
  assert.match(comment, /zj-loop:prd-next-command-handoff/);
  assert.match(result.stdout, /manual_command/);
});
