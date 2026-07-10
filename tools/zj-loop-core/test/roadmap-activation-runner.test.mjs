import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildRoadmapBoundedSlicePack,
  buildActivationRequestId,
  buildActivationConsumedComment,
  buildActivationRequestComment,
  buildRoadmapActivationBranchName,
  buildRoadmapActivationPrContract,
  buildRoadmapActivationPrTitle,
  buildRoadmapActivationReviewContract,
  buildRoadmapActivationReviewTitle,
  classifyRoadmapActivationLifecycleTransition,
  dispatchRoadmapActivationCommand,
  hasRoadmapActivationLoopMarker,
  buildRoadmapCloseoutContractPlan,
  parsePostMergeContractFromPrBody,
  parseStructuredActivationComments,
  renderRoadmapActivationWorkflowSummary,
  verifyRoadmapBoundedSliceResult,
} from '../dist/index.js';

const ROADMAP_ACTIVATION_CLI = fileURLToPath(new URL('../dist/roadmap-activation-cli.js', import.meta.url));

const ROUTE = {
  route_id: 'roadmap-sliced-development',
  consumer: 'roadmap-sliced-development',
  consumer_kind: 'activation-consumer',
  enabled: true,
  request_kind: 'activation-comment',
  execution_mode: 'request-only',
  side_effect_level: 'request',
  completion_forms: ['roadmap-branch-pr', 'activation-failed', 'activation-resumable'],
  maturity_protocol: 'user-project-ready',
  maturity_runner: 'user-project-ready',
  max_side_effect_level: 'branch',
  capability_scopes: [],
  capability_verifiers: [],
  recent_success_evidence: ['test'],
  readiness: 'user-project-ready',
  readiness_reasons: [],
  user_project_ready: true,
  section: 'routes',
  destructive: false,
  side_effecting: true,
};

function dispatch(overrides = {}) {
  return dispatchRoadmapActivationCommand({
    route: ROUTE,
    commandText: '/zj-loop start roadmap-sliced-development',
    requestedBy: 'maintainer',
    requestedByPermission: 'write',
    sourceIssue: 321,
    commandCommentId: 11,
    now: '2026-07-06T00:00:00Z',
    ...overrides,
  });
}

test('Roadmap Activation creates activation request comments for allowed commands', () => {
  const result = dispatch();
  const parsed = parseStructuredActivationComments([{ id: 99, body: result.commentBody }])[0];

  assert.equal(result.action, 'create-request');
  assert.equal(result.routeDecision.request_kind, 'activation-comment');
  assert.equal(result.routeDecision.allowed, true);
  assert.equal(parsed.fields.kind, 'zj-loop.activation-request');
  assert.equal(parsed.fields.activation_request_id, parsed.fields.request_id);
  assert.equal(parsed.fields.pattern, 'roadmap-sliced-development');
});

test('Roadmap Activation deterministic contract helpers produce stable ids and PR contracts', () => {
  const requestId = buildActivationRequestId({
    sourceIssue: 321,
    commandCommentId: 11,
    commandText: '/zj-loop start roadmap-sliced-development',
  });
  const branchName = buildRoadmapActivationBranchName({
    activationRequestId: requestId,
    title: 'Implement execution ready activation',
  });
  const prTitle = buildRoadmapActivationPrTitle({ title: 'Implement execution ready activation' });
  const contract = buildRoadmapActivationPrContract({
    activationRequestId: requestId,
    sourceIssueUrl: 'https://github.com/example/repo/issues/321',
    sourceCommentUrl: 'https://github.com/example/repo/issues/321#issuecomment-11',
    branchName,
    lifecycleState: 'running',
    closeoutContract: {
      activationCarrierIssue: 321,
      processRoadmapPath: 'docs/plans/example.md',
    },
  });

  assert.equal(requestId, buildActivationRequestId({
    sourceIssue: 321,
    commandCommentId: 11,
    commandText: '/zj-loop start roadmap-sliced-development',
  }));
  assert.match(requestId, /^act-321-11-[a-f0-9]{8}$/);
  assert.equal(branchName, `zjal-${requestId}-implement-execution-ready-activation`);
  assert.equal(prTitle, 'Roadmap Activation: Implement execution ready activation');
  assert.match(contract, /zj-loop\.roadmap_activation_pr_contract\.v1/);
  assert.match(contract, /"activation_request_id": "act-321-11-/);
  assert.match(contract, /branch_name: `zjal-act-321-11-/);
  assert.equal(parsePostMergeContractFromPrBody(contract).ok, true);
});

test('Roadmap Activation branch names avoid Git ref prefix conflicts', async () => {
  const branchName = buildRoadmapActivationBranchName({
    activationRequestId: 'act-321-11-abcdef12',
    title: 'Implement execution ready activation',
  });
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-ref-prefix-'));

  try {
    assert.equal(branchName, 'zjal-act-321-11-abcdef12-implement-execution-ready-activation');
    assert.equal(branchName.includes('/'), false);

    assert.equal(spawnSync('git', ['init'], { cwd: dir, encoding: 'utf8' }).status, 0);
    assert.equal(spawnSync('git', ['-c', 'user.email=zj-loop@example.com', '-c', 'user.name=ZJ Loop', 'commit', '--allow-empty', '-m', 'init'], { cwd: dir, encoding: 'utf8' }).status, 0);
    assert.equal(spawnSync('git', ['branch', 'zjal'], { cwd: dir, encoding: 'utf8' }).status, 0);
    assert.equal(spawnSync('git', ['branch', branchName], { cwd: dir, encoding: 'utf8' }).status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Roadmap Activation builds provider-neutral GitLab MR contracts', () => {
  const requestId = buildActivationRequestId({
    sourceIssue: 87,
    commandCommentId: 4932786315,
    commandText: '/zj-loop start roadmap-sliced-development',
  });
  const branchName = buildRoadmapActivationBranchName({
    activationRequestId: requestId,
    title: 'GitLab full parity',
  });
  const mrTitle = buildRoadmapActivationReviewTitle({
    provider: 'gitlab',
    title: 'GitLab full parity',
  });
  const contract = buildRoadmapActivationReviewContract({
    provider: 'gitlab',
    activationRequestId: requestId,
    sourceIssueUrl: 'https://gitlab.com/group/project/-/issues/87',
    sourceCommentUrl: 'https://gitlab.com/group/project/-/issues/87#note_4932786315',
    branchName,
    lifecycleState: 'requested',
    closeoutContract: {
      activationCarrierIssue: 87,
      processRoadmapPath: 'docs/plans/gitlab-full-parity.md',
    },
  });

  assert.equal(mrTitle, 'Roadmap Activation: GitLab full parity');
  assert.match(contract, /zj-loop\.roadmap_activation_review_contract\.v1/);
  assert.match(contract, /"provider": "gitlab"/);
  assert.match(contract, /"review_kind": "merge-request"/);
  assert.match(contract, /### Roadmap Activation MR Contract/);
  assert.match(contract, /source_comment_url": "https:\/\/gitlab\.com\/group\/project\/-\/issues\/87#note_4932786315/);

  const contractResult = parsePostMergeContractFromPrBody(contract);
  assert.equal(contractResult.ok, true);
  assert.equal(contractResult.contract.kind, 'zj-loop.post-merge-contract');
  assert.equal(contractResult.contract.consumer, 'post-merge-cleanup');
  assert.equal(contractResult.contract.roadmap.branch, branchName);
  assert.equal(contractResult.contract.carrier.issue, 87);
  const closeoutPlan = buildRoadmapCloseoutContractPlan({
    pr: {
      provider: 'gitlab',
      reviewKind: 'merge-request',
      number: 9,
      url: 'https://gitlab.com/group/project/-/merge_requests/9',
      body: contract,
      merged: true,
      headRefName: branchName,
      baseRefName: 'main',
      headRepositoryOwner: 'group',
      baseRepositoryOwner: 'group',
    },
    contractResult,
  });
  assert.equal(closeoutPlan.status, 'dry-run');
  assert.equal(closeoutPlan.validation.ok, true);
});

test('Roadmap Activation lifecycle helper separates red tests from blocked and failed states', () => {
  assert.deepEqual(
    classifyRoadmapActivationLifecycleTransition({
      currentState: 'running',
      nextState: 'running',
      verificationFailureKind: 'red-contract-test',
    }),
    {
      allowed: true,
      state: 'running',
      nextState: 'running',
      reason: 'red-contract-test-is-implementation-signal',
    },
  );
  assert.equal(classifyRoadmapActivationLifecycleTransition({
    currentState: 'running',
    nextState: 'failed',
    verificationFailureKind: 'technical',
  }).allowed, true);
  assert.equal(classifyRoadmapActivationLifecycleTransition({
    currentState: 'running',
    nextState: 'blocked',
    verificationFailureKind: 'decision',
  }).allowed, true);
  assert.equal(classifyRoadmapActivationLifecycleTransition({
    currentState: 'completed',
    nextState: 'running',
  }).allowed, false);
});

test('Roadmap Activation loop marker and workflow summary are deterministic', () => {
  assert.equal(hasRoadmapActivationLoopMarker({ body: '<!-- zj-loop.generated.roadmap-activation -->' }), true);
  assert.equal(hasRoadmapActivationLoopMarker({ body: '<!-- zj-loop\ngenerated_by: roadmap-activation\n-->' }), true);
  assert.equal(hasRoadmapActivationLoopMarker({ body: 'human comment' }), false);

  const summary = renderRoadmapActivationWorkflowSummary({
    action: 'create-request',
    routeDecision: { route: 'roadmap-sliced-development', allowed: true, reason: 'activation route matched' },
    activationRequestId: 'act-321-11-abcdef12',
    branchName: 'zjal-act-321-11-abcdef12-example',
  });
  assert.match(summary, /## ZJ Loop Roadmap Activation/);
  assert.match(summary, /activation_request_id: `act-321-11-abcdef12`/);
  assert.match(summary, /Trigger the Roadmap-Sliced Consumer/);
});

test('Roadmap Activation returns duplicate and resume comments instead of new requests', () => {
  const pendingComment = buildActivationRequestComment({
    requestId: 'rsd-321-001',
    sourceIssue: 321,
    pattern: 'roadmap-sliced-development',
    requestedBy: 'maintainer',
    requestedByPermission: 'write',
    requestedAt: '2026-07-06T00:00:00Z',
    commandCommentId: 10,
    commandText: '/zj-loop start roadmap-sliced-development',
  });
  const duplicate = dispatch({ comments: [{ id: 1, body: pendingComment }] });
  const consumedComment = buildActivationConsumedComment({
    requestId: 'rsd-322-001',
    sourceIssue: 322,
    pattern: 'roadmap-sliced-development',
    consumedAt: '2026-07-06T00:02:00Z',
    roadmapBranch: 'zjal/issue-322',
    roadmapFile: 'docs/designs/tmp-issue-322-roadmap.md',
    roadmapView: 'docs/designs/tmp-issue-322-roadmap.md',
    nextAction: 'resume roadmap slice 1-1',
  });
  const resume = dispatch({
    sourceIssue: 322,
    comments: [{ id: 1, body: buildActivationRequestComment({
      requestId: 'rsd-322-001',
      sourceIssue: 322,
      pattern: 'roadmap-sliced-development',
      requestedBy: 'maintainer',
      requestedByPermission: 'write',
      requestedAt: '2026-07-06T00:00:00Z',
      commandCommentId: 10,
      commandText: '/zj-loop start roadmap-sliced-development',
    }) }, { id: 2, body: consumedComment }],
  });

  assert.equal(duplicate.action, 'duplicate');
  assert.match(duplicate.commentBody, /kind: zj-loop.activation-duplicate/);
  assert.equal(resume.action, 'resume-existing');
  assert.match(resume.commentBody, /resume_policy: resume-without-new-activation/);
});

test('Roadmap Activation denies non-maintainer permissions with audit comment', () => {
  const result = dispatch({ requestedByPermission: 'read' });

  assert.equal(result.action, 'denied');
  assert.equal(result.routeDecision.allowed, false);
  assert.match(result.commentBody, /kind: zj-loop.activation-denied/);
});

test('Roadmap Activation activation-plan CLI reads route table and writes comment', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-roadmap-activation-'));
  const root = path.join(dir, 'project');
  const commentPath = path.join(dir, 'activation-comment.md');
  await mkdir(path.join(root, 'zj-loop'), { recursive: true });
  await writeFile(path.join(root, 'zj-loop', 'zj-loop-route-table.yaml'), [
    'kind: zj-loop-route-table',
    'schemaVersion: 1',
    'routes:',
    '  - route_id: roadmap-sliced-development',
    '    enabled: true',
    '    request_kind: activation-comment',
    '    consumer: roadmap-sliced-development',
    '    consumer_kind: activation-consumer',
    '    execution:',
    '      mode: request-only',
    '      side_effect_level: request',
    '      completion_forms: [roadmap-branch-pr, activation-failed, activation-resumable]',
    '      recent_success_evidence: [test]',
    '    maturity:',
    '      protocol: user-project-ready',
    '      runner: user-project-ready',
    '    capabilities:',
    '      max_side_effect_level: branch',
  ].join('\n'));
  try {
    const result = spawnSync(process.execPath, [
      ROADMAP_ACTIVATION_CLI,
      'activation-plan',
      '--root',
      root,
      '--command-text',
      '/zj-loop start roadmap-sliced-development',
      '--requested-by',
      'maintainer',
      '--permission',
      'write',
      '--source-issue',
      '321',
      '--command-comment-id',
      '11',
      '--comment-out',
      commentPath,
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.action, 'create-request');
    assert.match(parsed.activationRequestId, /^act-321-11-/);
    assert.equal(parsed.commentCreated, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Roadmap Activation contract-plan CLI can target GitLab MR contracts', async () => {
  const result = spawnSync(process.execPath, [
    ROADMAP_ACTIVATION_CLI,
    'contract-plan',
    '--provider',
    'gitlab',
    '--activation-request-id',
    'act-87-4932786315-8c94c5b9',
    '--source-issue',
    '87',
    '--source-issue-url',
    'https://gitlab.com/group/project/-/issues/87',
    '--source-comment-url',
    'https://gitlab.com/group/project/-/issues/87#note_4932786315',
    '--title',
    'GitLab full parity',
    '--process-roadmap-path',
    'docs/plans/gitlab-full-parity.md',
    '--json',
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.provider, 'gitlab');
  assert.equal(parsed.reviewKind, 'merge-request');
  assert.equal(parsed.mrTitle, 'Roadmap Activation: GitLab full parity');
  assert.match(parsed.branchName, /^zjal-act-87-4932786315-8c94c5b9-gitlab-full-parity$/);
  assert.match(parsed.mrContract, /zj-loop\.roadmap_activation_review_contract\.v1/);
  assert.match(parsed.nextSteps.join('\n'), /MR with the contract block/);
});

test('Roadmap Activation contract-plan CLI renders deterministic PR contract evidence', () => {
  const result = spawnSync(process.execPath, [
    ROADMAP_ACTIVATION_CLI,
    'contract-plan',
    '--activation-request-id',
    'act-321-11-abcdef12',
    '--title',
    'Implement execution ready activation',
    '--source-issue',
    '321',
    '--source-issue-url',
    'https://github.com/example/repo/issues/321',
    '--source-comment-url',
    'https://github.com/example/repo/issues/321#issuecomment-11',
    '--process-roadmap-path',
    'docs/plans/example.md',
    '--json',
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.schema, 'zj-loop.roadmap_activation_contract_plan.v1');
  assert.equal(parsed.branchName, 'zjal-act-321-11-abcdef12-implement-execution-ready-activation');
  assert.equal(parsed.prTitle, 'Roadmap Activation: Implement execution ready activation');
  assert.match(parsed.prContract, /zj-loop\.roadmap_activation_pr_contract\.v1/);
  assert.deepEqual(parsed.nextSteps, [
    'Create or update the roadmap branch from the current base branch.',
    'Open or update the Roadmap Activation PR with the contract block.',
    'Start Roadmap-Sliced Consumer execution from the Activation Request scope.',
  ]);
});

test('Roadmap Activation bounded slice pack defaults to 30 and selects eligible leaf slices only', () => {
  const pack = buildRoadmapBoundedSlicePack({
    activationRequestId: 'act-321-11-abcdef12',
    roadmapPath: 'docs/plans/example.md',
    branchName: 'zjal-act-321-11-abcdef12-example',
    leafSlices: [
      { id: '1-1', title: 'Add contract', status: 'pending', verification_commands: ['npm test'] },
      { id: '1-2', title: 'Already done', status: 'completed' },
      { id: '1-3', title: 'Deferred', status: 'deferred' },
      { id: '1-4', title: 'Add docs', status: 'active', allowed_paths: ['README.md'] },
    ],
  });

  assert.equal(pack.schema, 'zj-loop.roadmap_bounded_slice_pack.v1');
  assert.equal(pack.run_mode, 'bounded-slices');
  assert.equal(pack.max_slices, 30);
  assert.equal(pack.status, 'ready');
  assert.deepEqual(pack.selected_slices.map((slice) => slice.slice_id), ['1-1', '1-4']);
  assert.match(pack.stop_conditions.join('\n'), /max_slices reached/);
  assert.match(pack.continuation_conditions.join('\n'), /completed_slices is less than max_slices/);
});

test('Roadmap Activation bounded slice result verification requires gate-backed evidence', () => {
  const pack = buildRoadmapBoundedSlicePack({
    activationRequestId: 'act-321-11-abcdef12',
    roadmapPath: 'docs/plans/example.md',
    branchName: 'zjal-act-321-11-abcdef12-example',
    maxSlices: 1,
    leafSlices: [{ id: '1-1', title: 'Add contract', status: 'pending' }],
  });
  const passing = verifyRoadmapBoundedSliceResult({
    pack,
    result: {
      schema: 'zj-loop.roadmap_bounded_slice_result.v1',
      activation_request_id: 'act-321-11-abcdef12',
      branch_name: 'zjal-act-321-11-abcdef12-example',
      slice_results: [{
        slice_id: '1-1',
        status: 'completed',
        notes: 'Implemented contract.',
        evidence: ['updated roadmap state'],
        verification: [{ command: 'npm test', status: 'passed', exit_code: 0 }],
        commit: { intent: 'Add contract', hash: 'abc1234' },
      }],
      stop_reason: 'max_slices reached',
    },
  });
  const failing = verifyRoadmapBoundedSliceResult({
    pack,
    result: {
      schema: 'zj-loop.roadmap_bounded_slice_result.v1',
      activation_request_id: 'act-321-11-abcdef12',
      branch_name: 'zjal-act-321-11-abcdef12-example',
      slice_results: [{
        slice_id: '1-1',
        status: 'completed',
        notes: '',
        evidence: [],
        verification: [],
        commit: { intent: '' },
      }],
      stop_reason: 'agent guessed it was enough',
    },
  });

  assert.equal(passing.status, 'passed');
  assert.equal(failing.status, 'failed');
  assert.match(failing.errors.join('\n'), /notes are required/);
  assert.match(failing.errors.join('\n'), /stop_reason must be one of the fixed stop conditions/);
});

test('Roadmap Activation bounded-slices CLI packs and verifies deterministic result evidence', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-roadmap-bounded-slices-'));
  const slicesPath = path.join(dir, 'slices.json');
  const packPath = path.join(dir, 'pack.json');
  const resultPath = path.join(dir, 'result.json');
  await writeFile(slicesPath, JSON.stringify([
    { id: '1-1', title: 'Add contract', status: 'pending', verification_commands: ['npm test'] },
  ]));
  try {
    const packResult = spawnSync(process.execPath, [
      ROADMAP_ACTIVATION_CLI,
      'bounded-slices-pack',
      '--activation-request-id',
      'act-321-11-abcdef12',
      '--roadmap-path',
      'docs/plans/example.md',
      '--branch-name',
      'zjal-act-321-11-abcdef12-example',
      '--slices',
      slicesPath,
      '--out',
      packPath,
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(packResult.status, 0);
    const pack = JSON.parse(packResult.stdout);
    await writeFile(resultPath, JSON.stringify({
      schema: 'zj-loop.roadmap_bounded_slice_result.v1',
      activation_request_id: pack.activation_request_id,
      branch_name: pack.branch_name,
      slice_results: [{
        slice_id: '1-1',
        status: 'completed',
        notes: 'Implemented contract.',
        evidence: ['contract test passed'],
        verification: [{ command: 'npm test', status: 'passed', exit_code: 0 }],
        commit: { intent: 'Add contract', evidence: 'commit would be created by runner' },
      }],
      stop_reason: 'max_slices reached',
    }));
    const verifyResult = spawnSync(process.execPath, [
      ROADMAP_ACTIVATION_CLI,
      'bounded-slices-verify',
      '--pack',
      packPath,
      '--result',
      resultPath,
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(verifyResult.status, 0);
    assert.equal(JSON.parse(verifyResult.stdout).status, 'passed');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
