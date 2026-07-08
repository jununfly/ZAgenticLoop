import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  PR_STEWARD_CONFIRMATION_PHRASE,
  buildPrStewardExecutionPlan,
  executePrStewardLiveRunner,
  validatePrStewardLiveRequest,
} from './pr-steward-live-runner.mjs';
import {
  DEFAULT_PR_STEWARD_CLAIM_SCENARIOS,
  replayPrStewardClaim,
} from './pr-steward-claim-e2e-replay.mjs';

const ROUTE_TABLE_PATH = 'zj-loop/zj-loop-route-table.yaml';

async function claimedPrStewardRequest(scenarioName = 'failing-pr-request-consumed') {
  const routeTableText = await readFile(ROUTE_TABLE_PATH, 'utf8');
  const scenario = DEFAULT_PR_STEWARD_CLAIM_SCENARIOS.find((item) => item.name === scenarioName);
  const replay = replayPrStewardClaim({ routeTableText, scenario });
  assert.equal(replay.outcome, 'consumed');
  return replay.claimedRequest;
}

test('PR Steward live runner refuses to execute before claim', async () => {
  const routeTableText = await readFile(ROUTE_TABLE_PATH, 'utf8');
  const scenario = DEFAULT_PR_STEWARD_CLAIM_SCENARIOS.find((item) => item.name === 'failing-pr-request-consumed');
  const replay = replayPrStewardClaim({ routeTableText, scenario });
  const requestBeforeClaim = replay.requestBeforeClaim;

  const validation = validatePrStewardLiveRequest({
    request: requestBeforeClaim,
    currentPrHeadSha: 'abc123def456',
  });
  const plan = buildPrStewardExecutionPlan({
    request: requestBeforeClaim,
    currentPrHeadSha: 'abc123def456',
    live: true,
    confirmationPhrase: PR_STEWARD_CONFIRMATION_PHRASE,
  });

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /status must be consumed/);
  assert.equal(plan.status, 'refused');
  assert.equal(plan.actions.length, 0);
});

test('PR Steward live runner creates repair-pr evidence from an explicit repair plan', async () => {
  const request = await claimedPrStewardRequest();
  const plan = buildPrStewardExecutionPlan({
    request,
    currentPrHeadSha: 'abc123def456',
    repairCommands: ['node scripts/pr-steward-deterministic-repair.mjs'],
    repairFiles: ['scripts/pr-steward-deterministic-repair.mjs'],
    live: true,
    confirmationPhrase: PR_STEWARD_CONFIRMATION_PHRASE,
  });
  const calls = [];
  const result = await executePrStewardLiveRunner(plan, {
    runner: async (command, args) => {
      calls.push([command, args]);
      if (command === 'git' && args[0] === 'diff' && args.includes('--quiet')) {
        return { command, args, exitCode: 1, stdout: '', stderr: '' };
      }
      return {
        command,
        args,
        exitCode: 0,
        stdout: command === 'gh' ? 'https://github.com/jununfly/ZAgenticLoop/pull/1000\n' : '',
        stderr: '',
      };
    },
  });

  assert.equal(plan.status, 'ready-for-live-execution');
  assert.equal(result.outcome, 'repair-pr');
  assert.equal(result.runner_evidence.schema, 'zj-loop.live_runner_evidence.v1');
  assert.equal(result.runner_evidence.completion_form, 'repair-pr');
  assert.equal(result.runner_evidence.status, 'completed');
  assert.equal(result.runner_evidence.repair_pull_request.url, 'https://github.com/jununfly/ZAgenticLoop/pull/1000');
  assert.deepEqual(result.runner_evidence.source_pr_side_effects, {
    comment_created: false,
    label_changed: false,
    rebased: false,
    merged: false,
    workflow_dispatched: false,
  });
  assert.deepEqual(calls.map(([command]) => command), [
    'git',
    'git',
    'git',
    'git',
    'node',
    'npm',
    'npm',
    'npm',
    'git',
    'git',
    'git',
    'git',
    'git',
    'gh',
  ]);
});

test('PR Steward live runner escalates when no deterministic repair plan is provided', async () => {
  const request = await claimedPrStewardRequest();
  const plan = buildPrStewardExecutionPlan({
    request,
    currentPrHeadSha: 'abc123def456',
    live: true,
    confirmationPhrase: PR_STEWARD_CONFIRMATION_PHRASE,
  });
  const result = await executePrStewardLiveRunner(plan, {
    runner: async (command, args) => ({
      command,
      args,
      exitCode: 0,
      stdout: 'https://github.com/jununfly/ZAgenticLoop/issues/1001\n',
      stderr: '',
    }),
  });

  assert.equal(plan.completion_mode, 'escalation-issue');
  assert.equal(result.outcome, 'escalation-issue');
  assert.equal(result.runner_evidence.completion_form, 'escalation-issue');
  assert.equal(result.runner_evidence.status, 'escalated');
  assert.equal(result.runner_evidence.escalation.issue_url, 'https://github.com/jununfly/ZAgenticLoop/issues/1001');
  assert.equal(result.steps[0].name, 'create-escalation-issue');
});

test('PR Steward live runner escalates when verification fails', async () => {
  const request = await claimedPrStewardRequest();
  const plan = buildPrStewardExecutionPlan({
    request,
    currentPrHeadSha: 'abc123def456',
    repairCommands: ['node scripts/pr-steward-deterministic-repair.mjs'],
    repairFiles: ['scripts/pr-steward-deterministic-repair.mjs'],
    live: true,
    confirmationPhrase: PR_STEWARD_CONFIRMATION_PHRASE,
  });
  const result = await executePrStewardLiveRunner(plan, {
    runner: async (command, args) => ({
      command,
      args,
      exitCode: command === 'npm' && args[0] === 'run' && args[1] === 'test:issue-fix-request' ? 1 : 0,
      stdout: '',
      stderr: '',
    }),
  });

  assert.equal(result.outcome, 'escalation-issue');
  assert.equal(result.runner_evidence.escalation.reason, 'verify-2 failed');
  assert.equal(result.runner_evidence.verifier_evidence.at(-1).status, 'failed');
});

test('PR Steward live runner refuses stale source PR head and non-main base', async () => {
  const request = await claimedPrStewardRequest();
  const stalePlan = buildPrStewardExecutionPlan({
    request,
    currentPrHeadSha: 'new789head000',
    live: true,
    confirmationPhrase: PR_STEWARD_CONFIRMATION_PHRASE,
  });
  const nonMainPlan = buildPrStewardExecutionPlan({
    request: {
      ...request,
      subject: {
        ...request.subject,
        base_branch: 'develop',
      },
    },
    currentPrHeadSha: 'abc123def456',
    live: true,
    confirmationPhrase: PR_STEWARD_CONFIRMATION_PHRASE,
  });

  assert.equal(stalePlan.status, 'refused');
  assert.match(stalePlan.refusals.map((item) => item.reason).join('\n'), /current_pr_head_sha/);
  assert.equal(nonMainPlan.status, 'refused');
  assert.match(nonMainPlan.refusals.map((item) => item.reason).join('\n'), /base_branch must be main/);
});

test('PR Steward live runner requires repair files and fixed confirmation phrase', async () => {
  const request = await claimedPrStewardRequest();
  const missingFiles = buildPrStewardExecutionPlan({
    request,
    currentPrHeadSha: 'abc123def456',
    repairCommands: ['node scripts/pr-steward-deterministic-repair.mjs'],
    live: true,
    confirmationPhrase: PR_STEWARD_CONFIRMATION_PHRASE,
  });
  const badConfirm = buildPrStewardExecutionPlan({
    request,
    currentPrHeadSha: 'abc123def456',
    live: true,
    confirmationPhrase: 'yes',
  });

  assert.equal(missingFiles.status, 'refused');
  assert.match(missingFiles.refusals.map((item) => item.reason).join('\n'), /repair_files are required/);
  assert.equal(badConfirm.status, 'refused');
  assert.match(badConfirm.refusals.map((item) => item.reason).join('\n'), /fixed confirmation phrase/);
});
