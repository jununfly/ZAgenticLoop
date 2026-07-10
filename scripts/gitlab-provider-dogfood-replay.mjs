import {
  buildCiSweeperIssueFixRequestBody,
  buildPostMergeRoadmapCloseoutExecutionPlan,
  buildPrStewardExecutionPlan,
  buildRoadmapActivationBranchName,
  buildRoadmapActivationReviewContract,
  parseIssueFixRequestComments,
  parsePostMergeContractFromPrBody,
} from '../tools/zj-loop-core/dist/index.js';

export function replayGitLabProviderDogfood() {
  const ciBody = buildCiSweeperIssueFixRequestBody({
    repo: 'group/project',
    provider: 'gitlab',
    workflowName: 'zj_loop_ci_sweeper',
    runId: '789',
    sourceUrl: 'https://gitlab.com/group/project/-/pipelines/789',
    routeDecision: {
      schema: 'zj-loop.route_decision.v1',
      decision_id: 'rd_gitlab_pipeline_789',
      signal_id: 'gitlab-pipeline:789',
      source: 'gitlab-pipeline',
      route: 'ci-sweeper',
      request_kind: 'issue-fix-request',
      target_consumer: 'ci-sweeper',
      allowed: true,
      status: 'pending',
      dedupe_key: 'group/project:ci-sweeper:gitlab-pipeline:789:generated-workflow',
      created_at: '2026-07-10T00:00:00Z',
    },
  });
  const ciRequest = parseIssueFixRequestComments([{ id: 1, body: ciBody }])[0].request;

  const activationRequestId = 'act-89-4934172412-8c94c5b9';
  const branchName = buildRoadmapActivationBranchName({
    activationRequestId,
    title: 'GitLab provider dogfood',
  });
  const mrContract = buildRoadmapActivationReviewContract({
    provider: 'gitlab',
    activationRequestId,
    sourceIssueUrl: 'https://gitlab.com/group/project/-/issues/89',
    sourceCommentUrl: 'https://gitlab.com/group/project/-/issues/89#note_4934172412',
    branchName,
    lifecycleState: 'requested',
    closeoutContract: {
      activationCarrierIssue: 89,
      processRoadmapPath: 'docs/plans/gitlab-provider-dogfood.md',
    },
  });
  const closeoutContract = parsePostMergeContractFromPrBody(mrContract);
  const closeoutPlan = buildPostMergeRoadmapCloseoutExecutionPlan({
    pr: {
      provider: 'gitlab',
      reviewKind: 'merge-request',
      number: 12,
      url: 'https://gitlab.com/group/project/-/merge_requests/12',
      body: mrContract,
      merged: true,
      headRefName: branchName,
      baseRefName: 'main',
      headRepositoryOwner: 'group',
      baseRepositoryOwner: 'group',
    },
    prBody: mrContract,
    expectedRepo: 'group/project',
    currentRepo: 'group/project',
    gitStatus: '',
    expectedCarrierIssue: 89,
  });

  const prStewardRequest = {
    schema: 'zj-loop.issue_fix_request.v1',
    request_id: 'ifr-pr-steward-gitlab-1',
    status: 'consumed',
    created_at: '2026-07-10T00:00:00Z',
    source_signal: {
      source: 'merge_request',
      provider: 'gitlab',
      source_url: 'https://gitlab.com/group/project/-/merge_requests/123',
    },
    route_decision: {
      schema: 'zj-loop.route_decision.v1',
      route_id: 'pr-steward-fix-request',
      request_kind: 'issue-fix-request',
      target_consumer: 'pr-steward',
      dedupe_key: 'merge-request:123:abc123def456',
    },
    dedupe_key: 'merge-request:123:abc123def456',
    requested_consumer: {
      consumer_id: 'pr-steward',
      capability: 'pr-review-and-readiness-fix',
    },
    fix_scope: {
      files_or_areas: ['scripts/pr-steward-deterministic-repair.mjs'],
      non_goals: ['source MR mutation', 'auto-merge'],
    },
    acceptance_criteria: ['Open an independent repair PR or escalation issue.'],
    verification_gate: {
      commands: ['npm run test:issue-fix-request', 'git diff --check'],
    },
    failure_policy: {
      retry: 'new_request_only',
    },
    lifecycle: {
      consumed_by: 'pr-steward',
    },
    subject: {
      type: 'merge_request',
      provider: 'gitlab',
      repo: 'group/project',
      mr_iid: 123,
      head_sha: 'abc123def456',
      base_branch: 'main',
    },
  };
  const prStewardDryRun = buildPrStewardExecutionPlan({
    request: prStewardRequest,
    currentPrHeadSha: 'abc123def456',
  });
  const prStewardLive = buildPrStewardExecutionPlan({
    request: prStewardRequest,
    currentPrHeadSha: 'abc123def456',
    repairCommands: ['node scripts/pr-steward-deterministic-repair.mjs'],
    repairFiles: ['scripts/pr-steward-deterministic-repair.mjs'],
    live: true,
    confirmationPhrase: 'CREATE_PR_STEWARD_FIX_PR_OR_ESCALATION',
  });

  return {
    schema: 'zj-loop.gitlab_provider_dogfood_replay.v1',
    ciSweeper: {
      provider: ciRequest.subject.provider,
      filesOrAreas: ciRequest.fix_scope.files_or_areas,
    },
    roadmapActivation: {
      branchName,
      closeoutContractParsed: closeoutContract.ok,
      closeoutStatus: closeoutPlan.status,
      closeoutProvider: closeoutPlan.review.provider,
      closeoutReviewKind: closeoutPlan.review.kind,
    },
    prSteward: {
      dryRunStatus: prStewardDryRun.status,
      dryRunTitle: prStewardDryRun.actions[0]?.args?.[3] ?? '',
      liveStatus: prStewardLive.status,
      liveRefusals: prStewardLive.refusals.map((refusal) => refusal.reason),
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(replayGitLabProviderDogfood(), null, 2));
}
