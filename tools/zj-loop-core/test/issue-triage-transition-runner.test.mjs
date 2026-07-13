import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildIssueTriageTransitionIssueFixRequestBody,
  buildIssueTriageTransitionIssueFixRequestTitle,
  buildIssueRecommendationsArtifact,
  buildRecommendedTriageTransitionFixture,
  buildTransitionRequestsArtifact,
  parseIssueFixRequestComments,
  runIssueTriageTransitionRunner,
  TRIAGE_AI_DISCLAIMER,
} from '../dist/index.js';

const ISSUE_TRIAGE_TRANSITION_CLI = fileURLToPath(new URL('../dist/issue-triage-transition-cli.js', import.meta.url));

const ROUTE = {
  route_id: 'issue-triage-transition',
  consumer: 'issue-triage-transition',
  consumer_kind: 'triage-action-consumer',
  enabled: true,
  request_kind: 'triage-transition-confirmation',
  execution_mode: 'request-only',
  side_effect_level: 'request',
  completion_forms: ['triage-transition-confirmed', 'issue-fix-request-created', 'triage-action-skipped', 'escalation-issue'],
  maturity_protocol: 'user-project-ready',
  maturity_runner: 'user-project-ready',
  max_side_effect_level: 'request',
  capability_scopes: ['issue-backlog', 'triage-transition', 'zj-triage-role'],
  capability_verifiers: ['route-replay', 'zj-triage-brief', 'forbidden-side-effect-check'],
  recent_success_evidence: ['test'],
  readiness: 'user-project-ready',
  readiness_reasons: [],
  user_project_ready: true,
  section: 'routes',
  destructive: false,
  side_effecting: true,
  guards: {
    trusted_automation_confirmation_allowed: true,
    trusted_automation_states: ['ready-for-agent'],
    trusted_automation_authorities: ['trusted-workflow'],
    side_effects_allowed: 'request-carrier-only',
  },
};

test('Issue Triage Transition confirms ready-for-agent into Issue Fix Request carrier', () => {
  const result = runIssueTriageTransitionRunner({ route: ROUTE });

  assert.equal(result.decision.status, 'confirmed');
  assert.equal(result.evidence.completion_form, 'issue-fix-request-created');
  assert.equal(result.evidence.execution_mode, 'request-only');
  assert.equal(result.evidence.side_effects.executed, false);
  assert.equal(result.evidence.side_effects.issue_fix_request_planned, true);
  assert.equal(result.confirmed_transition.confirmed_state, 'ready-for-agent');
  assert.equal(result.confirmed_transition.triage_comment.startsWith(TRIAGE_AI_DISCLAIMER), true);
  assert.equal(result.confirmed_transition.issue_fix_request.status, 'requested');
  assert.equal(result.confirmed_transition.issue_fix_request.carrier.kind, 'source-issue-comment');
  assert.equal(result.confirmed_transition.issue_fix_request.carrier.issue, 126);
  assert.equal(result.confirmed_transition.issue_fix_request.carrier.independent_issue_allowed, false);
});

test('Issue Triage Transition supports trusted automation for ready-for-agent request carriers', () => {
  const result = runIssueTriageTransitionRunner({
    route: ROUTE,
    confirmationMode: 'trusted-automation',
    confirmationAuthority: 'trusted-workflow',
    command: '',
    confirmationPhrase: '',
  });

  assert.equal(result.decision.status, 'confirmed');
  assert.equal(result.decision.reason, 'triage-transition-auto-confirmed');
  assert.equal(result.confirmed_transition.confirmation.mode, 'trusted-automation');
  assert.equal(result.confirmed_transition.confirmation.human_confirmation_required, false);
  assert.equal(result.confirmed_transition.issue_fix_request.carrier.kind, 'source-issue-comment');
  assert.equal(result.evidence.side_effects.confirmation_mode, 'trusted-automation');
  assert.equal(result.evidence.side_effects.human_confirmation_required, false);
  assert.equal(
    result.evidence.verifier_evidence.some((item) => item.kind === 'trusted-automation-confirmation' && item.status === 'confirmed'),
    true,
  );
});

test('Issue Triage Transition keeps trusted automation narrow', () => {
  const needsInfo = runIssueTriageTransitionRunner({
    route: ROUTE,
    confirmationMode: 'trusted-automation',
    confirmationAuthority: 'trusted-workflow',
    request: {
      recommended_state: 'needs-info',
      brief_draft: { kind: 'triage-notes', body: 'Please provide a minimal reproduction.' },
      side_effects_if_confirmed: {
        set_tracker_state: true,
        write_triage_comment: true,
        create_issue_fix_request: false,
      },
    },
    command: '',
    confirmationPhrase: '',
  });
  const routeWithoutAutomation = {
    ...ROUTE,
    guards: { ...ROUTE.guards, trusted_automation_confirmation_allowed: false },
  };
  const disabled = runIssueTriageTransitionRunner({
    route: routeWithoutAutomation,
    confirmationMode: 'trusted-automation',
    confirmationAuthority: 'trusted-workflow',
    command: '',
    confirmationPhrase: '',
  });

  assert.equal(needsInfo.decision.status, 'escalated');
  assert.equal(needsInfo.decision.reason, 'trusted-automation-state-requires-human-confirmation');
  assert.equal(needsInfo.evidence.completion_form, 'escalation-issue');
  assert.equal(disabled.decision.status, 'rejected');
  assert.equal(disabled.decision.reason, 'trusted-automation-not-allowed-by-route-table');
});

test('Issue Triage Transition preserves GitLab source issue carrier URLs', () => {
  const request = buildRecommendedTriageTransitionFixture({
    source: {
      tracker: 'gitlab',
      repo: 'group/subgroup/project',
      issue: 126,
      scan_window: 'open-issues:last-24h',
    },
    dedupe_key: 'issue-backlog-triage:group/subgroup/project:126:ready-for-agent:gitlab',
  });
  const result = runIssueTriageTransitionRunner({ route: ROUTE, request });

  assert.equal(result.decision.status, 'confirmed');
  assert.equal(result.evidence.source.url, 'https://gitlab.com/group/subgroup/project/-/issues/126');
  assert.equal(result.confirmed_transition.issue_fix_request.source_signal.provider, 'gitlab');
  assert.equal(
    result.confirmed_transition.issue_fix_request.source_signal.url,
    'https://gitlab.com/group/subgroup/project/-/issues/126',
  );
  assert.equal(result.confirmed_transition.issue_fix_request.carrier.provider, 'gitlab');
  assert.equal(
    result.confirmed_transition.issue_fix_request.carrier.url,
    'https://gitlab.com/group/subgroup/project/-/issues/126',
  );
});

test('Issue Triage Transition builds stable GitLab issue recommendation and transition request artifacts', () => {
  const request = buildRecommendedTriageTransitionFixture({
    source: {
      tracker: 'gitlab',
      repo: 'group/subgroup/project',
      issue: 126,
      issue_url: 'https://gitlab.com/group/subgroup/project/-/issues/126',
      scan_window: 'open-issues:last-24h',
    },
    dedupe_key: 'issue-backlog-triage:group/subgroup/project:126:ready-for-agent:gitlab',
  });
  const plan = runIssueTriageTransitionRunner({ route: ROUTE, request });
  const recommendations = buildIssueRecommendationsArtifact({
    provider: 'gitlab',
    projectPath: 'group/subgroup/project',
    pipelineUrl: 'https://gitlab.com/group/subgroup/project/-/pipelines/456',
    recommendations: [
      {
        issue_iid: 126,
        issue_url: 'https://gitlab.com/group/subgroup/project/-/issues/126',
        labels: ['bug'],
        assignees: [],
        recommendation: 'ready-for-agent',
        reason: 'bounded enough for an agent',
        request,
      },
    ],
  });
  const transitions = buildTransitionRequestsArtifact({
    provider: 'gitlab',
    transitions: [{ plan, consumer_plan: { status: 'request-only' }, command_exit_codes: { confirm_plan: 0 } }],
  });

  assert.equal(recommendations.schema, 'zj-loop.issue_recommendations.v1');
  assert.equal(recommendations.provider, 'gitlab');
  assert.equal(recommendations.project_path, 'group/subgroup/project');
  assert.equal(recommendations.issue_count, 1);
  assert.equal(recommendations.recommendations[0].issue_url, 'https://gitlab.com/group/subgroup/project/-/issues/126');
  assert.equal(transitions.schema, 'zj-loop.transition_requests.v1');
  assert.equal(transitions.provider, 'gitlab');
  assert.equal(transitions.candidate_count, 1);
  assert.equal(transitions.transitions[0].issue_url, 'https://gitlab.com/group/subgroup/project/-/issues/126');
  assert.equal(transitions.transitions[0].side_effect_policy, 'request-only');
  assert.equal(transitions.transitions[0].live_issue_mutation, false);
  assert.equal(transitions.transitions[0].issue_fix_request.source_signal.provider, 'gitlab');
});

test('Issue Triage Transition Issue Fix Request body carries a parseable request comment', () => {
  const result = runIssueTriageTransitionRunner({ route: ROUTE });
  const title = buildIssueTriageTransitionIssueFixRequestTitle(result.confirmed_transition.issue_fix_request);
  const body = buildIssueTriageTransitionIssueFixRequestBody({
    issueFixRequest: result.confirmed_transition.issue_fix_request,
    triageComment: result.confirmed_transition.triage_comment,
  });
  const parsed = parseIssueFixRequestComments([{ id: 1, body }]);

  assert.match(title, /^\[Issue Fix Request\] issue-triage-transition:/);
  assert.match(body, /Carrier: `source-issue-comment`/);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].request.request_id, result.confirmed_transition.issue_fix_request.request_id);
  assert.equal(parsed[0].request.requested_consumer.consumer_id, 'roadmap-sliced-development');
  assert.equal(parsed[0].request.carrier.kind, 'source-issue-comment');
});

test('Issue Triage Transition confirms needs-info without Issue Fix Request carrier', () => {
  const request = buildRecommendedTriageTransitionFixture({
    recommended_state: 'needs-info',
    brief_draft: { kind: 'triage-notes', body: 'Please provide a minimal reproduction.' },
    side_effects_if_confirmed: {
      set_tracker_state: true,
      write_triage_comment: true,
      create_issue_fix_request: false,
    },
  });
  const result = runIssueTriageTransitionRunner({ route: ROUTE, request });

  assert.equal(result.decision.status, 'confirmed');
  assert.equal(result.evidence.completion_form, 'triage-transition-confirmed');
  assert.equal(result.confirmed_transition.issue_fix_request, null);
  assert.match(result.confirmed_transition.triage_comment, /Triage Notes/);
});

test('Issue Triage Transition blocks wontfix from default confirmation side effects', () => {
  const request = buildRecommendedTriageTransitionFixture({
    recommended_state: 'wontfix',
    category_role: 'enhancement',
    brief_draft: { kind: 'wontfix-note', body: 'Out of scope candidate.' },
    side_effects_if_confirmed: {
      set_tracker_state: false,
      write_triage_comment: false,
      create_issue_fix_request: false,
    },
  });
  const result = runIssueTriageTransitionRunner({ route: ROUTE, request });

  assert.equal(result.decision.status, 'escalated');
  assert.equal(result.decision.reason, 'wontfix-requires-human-review');
  assert.equal(result.evidence.completion_form, 'escalation-issue');
  assert.deepEqual(result.confirmed_transition.tracker_operations, []);
});

test('Issue Triage Transition rejects non-maintainer and mismatched confirmation phrase', () => {
  const unauthorized = runIssueTriageTransitionRunner({ route: ROUTE, actorPermission: 'read' });
  const wrongPhrase = runIssueTriageTransitionRunner({ route: ROUTE, confirmationPhrase: 'yes' });
  const wrongCommand = runIssueTriageTransitionRunner({ route: ROUTE, command: '/zj-loop confirm-triage-transition wrong' });

  assert.equal(unauthorized.decision.reason, 'actor-not-maintainer-or-collaborator');
  assert.equal(wrongPhrase.decision.reason, 'fixed-confirmation-phrase-required');
  assert.equal(wrongCommand.decision.reason, 'confirm-command-mismatch');
});

test('Issue Triage Transition confirm-plan CLI reads route table and request JSON', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-issue-triage-transition-'));
  const requestPath = path.join(dir, 'request.json');
  const root = path.join(dir, 'project');
  await writeFile(requestPath, JSON.stringify(buildRecommendedTriageTransitionFixture(), null, 2));
  await mkdir(path.join(root, 'zj-loop'), { recursive: true });
  await writeFile(path.join(root, 'zj-loop', 'zj-loop-route-table.yaml'), [
    'kind: zj-loop-route-table',
    'schemaVersion: 1',
    'routes:',
    '  - route_id: issue-triage-transition',
    '    enabled: true',
    '    request_kind: triage-transition-confirmation',
    '    consumer: issue-triage-transition',
    '    consumer_kind: triage-action-consumer',
    '    execution:',
    '      mode: request-only',
    '      side_effect_level: request',
    '      completion_forms: [triage-transition-confirmed, issue-fix-request-created, triage-action-skipped, escalation-issue]',
    '      recent_success_evidence: [test]',
    '    maturity:',
    '      protocol: user-project-ready',
    '      runner: user-project-ready',
    '    capabilities:',
    '      scopes: [issue-backlog, triage-transition, zj-triage-role]',
    '      max_side_effect_level: request',
    '      verifiers: [route-replay, zj-triage-brief, forbidden-side-effect-check]',
  ].join('\n'));

  try {
    const result = spawnSync(process.execPath, [
      ISSUE_TRIAGE_TRANSITION_CLI,
      'confirm-plan',
      '--root',
      root,
      '--request',
      requestPath,
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.kind, 'zj-loop.issue-triage-transition-runner-result');
    assert.equal(parsed.decision.status, 'confirmed');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Issue Triage Transition request-body CLI writes title and body from confirmed plan', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-issue-triage-transition-body-'));
  const planPath = path.join(dir, 'transition-plan.json');
  const bodyPath = path.join(dir, 'issue-body.md');
  const titlePath = path.join(dir, 'issue-title.txt');
  const plan = runIssueTriageTransitionRunner({ route: ROUTE });
  await writeFile(planPath, JSON.stringify(plan, null, 2));

  try {
    const result = spawnSync(process.execPath, [
      ISSUE_TRIAGE_TRANSITION_CLI,
      'request-body',
      '--transition-plan',
      planPath,
      '--out',
      bodyPath,
      '--title-out',
      titlePath,
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.request_id, plan.confirmed_transition.issue_fix_request.request_id);
    assert.equal(parsed.body_written, true);
    assert.equal(parsed.title_written, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
