import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_TRIAGE_LABELS,
  buildIssueTriageActionRequest,
  FIXED_COMMENT_TEMPLATES,
  runIssueTriageActionRunner,
} from '../dist/index.js';

const ISSUE_TRIAGE_ACTION_CLI = fileURLToPath(new URL('../dist/issue-triage-action-cli.js', import.meta.url));

const ROUTE = {
  route_id: 'issue-triage-action',
  consumer: 'issue-triage-action',
  consumer_kind: 'triage-action-consumer',
  enabled: true,
  request_kind: 'triage-action-request',
  execution_mode: 'dry-run',
  side_effect_level: 'label',
  completion_forms: ['triage-label-applied', 'triage-comment-posted', 'triage-action-skipped', 'escalation-issue'],
  maturity_protocol: 'user-project-ready',
  maturity_runner: 'user-project-ready',
  max_side_effect_level: 'label',
  capability_scopes: [],
  capability_verifiers: ['route-replay', 'allowlisted-triage-action', 'forbidden-side-effect-check'],
  recent_success_evidence: ['test'],
  readiness: 'user-project-ready',
  readiness_reasons: [],
  user_project_ready: true,
  section: 'routes',
  destructive: false,
  side_effecting: true,
};

test('Issue Triage Action dry-runs allowlisted label and fixed comment actions', () => {
  const label = runIssueTriageActionRunner({ route: ROUTE, request: buildIssueTriageActionRequest() });
  const comment = runIssueTriageActionRunner({
    route: ROUTE,
    request: buildIssueTriageActionRequest({
      requested_action: 'post-fixed-triage-comment',
      action_value: 'needs-info-request',
    }),
  });

  assert.equal(label.decision.status, 'dry-run-completed');
  assert.equal(label.evidence.consumer_kind, 'triage-action-consumer');
  assert.equal(label.evidence.execution_mode, 'dry-run');
  assert.equal(label.evidence.completion_form, 'triage-label-applied');
  assert.equal(label.evidence.side_effects.executed, false);
  assert.deepEqual(label.evidence.side_effects.actions, [
    { kind: 'label', label: 'needs-info', mode: 'dry-run' },
  ]);
  assert.equal(comment.evidence.completion_form, 'triage-comment-posted');
  assert.deepEqual(comment.evidence.side_effects.actions, [
    { kind: 'issue-comment', template: 'needs-info-request', mode: 'dry-run' },
  ]);
});

test('Issue Triage Action uses fixed allowlists and rejects freeform actions', () => {
  const badLabel = runIssueTriageActionRunner({
    route: ROUTE,
    request: buildIssueTriageActionRequest({ action_value: 'bug' }),
  });
  const badComment = runIssueTriageActionRunner({
    route: ROUTE,
    request: buildIssueTriageActionRequest({
      requested_action: 'post-fixed-triage-comment',
      action_value: 'Please paste logs and screenshots.',
    }),
  });

  assert.deepEqual(ALLOWED_TRIAGE_LABELS, [
    'needs-info',
    'duplicate-candidate',
    'ready-for-roadmap-review',
  ]);
  assert.deepEqual(FIXED_COMMENT_TEMPLATES, [
    'needs-info-request',
    'duplicate-candidate-note',
    'roadmap-review-ready-note',
  ]);
  assert.equal(badLabel.decision.reason, 'label-not-allowlisted');
  assert.equal(badLabel.evidence.completion_form, 'triage-action-skipped');
  assert.equal(badComment.decision.reason, 'comment-template-not-fixed');
});

test('Issue Triage Action escalates human guarded requests and rejects live execution', () => {
  const guarded = runIssueTriageActionRunner({
    route: ROUTE,
    request: buildIssueTriageActionRequest({
      risk: 'high',
      security_or_privacy_related: true,
    }),
  });
  const live = runIssueTriageActionRunner({
    route: ROUTE,
    request: buildIssueTriageActionRequest(),
    live: true,
  });

  assert.equal(guarded.decision.status, 'escalated');
  assert.equal(guarded.evidence.completion_form, 'escalation-issue');
  assert.equal(live.decision.status, 'rejected');
  assert.equal(live.decision.reason, 'live-side-effects-not-enabled');
  assert.equal(live.evidence.side_effects.executed, false);
});

test('Issue Triage Action action-plan CLI reads route table and request JSON', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-issue-triage-action-'));
  const requestPath = path.join(dir, 'request.json');
  const root = path.join(dir, 'project');
  await writeFile(requestPath, JSON.stringify(buildIssueTriageActionRequest(), null, 2));
  await writeFile(path.join(dir, 'unused'), '');
  await import('node:fs/promises').then(async ({ mkdir, writeFile: write }) => {
    await mkdir(path.join(root, 'zj-loop'), { recursive: true });
    await write(path.join(root, 'zj-loop', 'zj-loop-route-table.yaml'), [
      'kind: zj-loop-route-table',
      'schemaVersion: 1',
      'routes:',
      '  - route_id: issue-triage-action',
      '    enabled: true',
      '    request_kind: triage-action-request',
      '    consumer: issue-triage-action',
      '    consumer_kind: triage-action-consumer',
      '    execution:',
      '      mode: dry-run',
      '      side_effect_level: label',
      '      completion_forms: [triage-label-applied, triage-comment-posted, triage-action-skipped, escalation-issue]',
      '      recent_success_evidence: [test]',
      '    maturity:',
      '      protocol: user-project-ready',
      '      runner: user-project-ready',
      '    capabilities:',
      '      max_side_effect_level: label',
      '      verifiers: [route-replay, allowlisted-triage-action, forbidden-side-effect-check]',
    ].join('\n'));
  });
  try {
    const result = spawnSync(process.execPath, [
      ISSUE_TRIAGE_ACTION_CLI,
      'action-plan',
      '--root',
      root,
      '--request',
      requestPath,
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.kind, 'zj-loop.issue-triage-action-runner-result');
    assert.equal(parsed.decision.status, 'dry-run-completed');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
