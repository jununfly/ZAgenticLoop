import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  DEPENDENCY_SWEEPER_CONFIRMATION_PHRASE,
  buildDependencySweeperExecutionPlan,
  executeDependencySweeperLiveRunner,
  validateDependencySweeperLiveRequest,
} from './dependency-sweeper-live-runner.mjs';
import {
  DEFAULT_DEPENDENCY_SWEEPER_CLAIM_SCENARIOS,
  replayDependencySweeperClaim,
} from './dependency-sweeper-claim-e2e-replay.mjs';

const ROUTE_TABLE_PATH = 'zj-loop/zj-loop-route-table.yaml';

async function claimedDependencyRequest(scenarioName = 'patch-request-consumed') {
  const routeTableText = await readFile(ROUTE_TABLE_PATH, 'utf8');
  const scenario = DEFAULT_DEPENDENCY_SWEEPER_CLAIM_SCENARIOS.find((item) => item.name === scenarioName);
  const replay = replayDependencySweeperClaim({ routeTableText, scenario });
  assert.equal(replay.outcome, 'consumed');
  return replay.claimedRequest;
}

test('dependency request subject carries package details needed by the live runner', async () => {
  const request = await claimedDependencyRequest();

  assert.deepEqual(request.subject, {
    type: 'dependency',
    repo: 'jununfly/ZAgenticLoop',
    ecosystem: 'npm',
    package_name: 'yaml',
    current_version: '2.7.0',
    target_version: '2.7.1',
    update_type: 'patch',
    dependency_section: 'dependencies',
    manifest_files: ['package.json', 'package-lock.json'],
  });
  assert.equal(request.route_decision.risk, 'low');
});

test('live runner refuses to repair before dependency sweeper has claimed the request', async () => {
  const routeTableText = await readFile(ROUTE_TABLE_PATH, 'utf8');
  const scenario = DEFAULT_DEPENDENCY_SWEEPER_CLAIM_SCENARIOS.find((item) => item.name === 'patch-request-consumed');
  const replay = replayDependencySweeperClaim({ routeTableText, scenario });
  const requestBeforeClaim = replay.requestBeforeClaim;

  const validation = validateDependencySweeperLiveRequest(requestBeforeClaim);
  const plan = buildDependencySweeperExecutionPlan({
    request: requestBeforeClaim,
    live: true,
    confirmationPhrase: DEPENDENCY_SWEEPER_CONFIRMATION_PHRASE,
  });

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /status must be consumed/);
  assert.equal(plan.status, 'refused');
  assert.equal(plan.actions.length, 0);
});

test('live runner reaches repair-pr only after claim and verifier-backed repair steps pass', async () => {
  const request = await claimedDependencyRequest();
  const plan = buildDependencySweeperExecutionPlan({
    request,
    live: true,
    confirmationPhrase: DEPENDENCY_SWEEPER_CONFIRMATION_PHRASE,
  });
  const calls = [];
  const result = await executeDependencySweeperLiveRunner(plan, {
    runner: async (command, args) => {
      calls.push([command, args]);
      if (command === 'git' && args[0] === 'diff') {
        return { command, args, exitCode: 1, stdout: '', stderr: '' };
      }
      return {
        command,
        args,
        exitCode: 0,
        stdout: command === 'gh' ? 'https://github.com/jununfly/ZAgenticLoop/pull/999\n' : '',
        stderr: '',
      };
    },
  });

  assert.equal(plan.status, 'ready-for-live-execution');
  assert.equal(result.outcome, 'repair-pr');
  assert.equal(result.runner_evidence.schema, 'zj-loop.live_runner_evidence.v1');
  assert.equal(result.runner_evidence.completion_form, 'repair-pr');
  assert.equal(result.runner_evidence.status, 'completed');
  assert.equal(result.runner_evidence.side_effects.level, 'pr');
  assert.equal(result.runner_evidence.repair_pull_request.url, 'https://github.com/jununfly/ZAgenticLoop/pull/999');
  assert.deepEqual(calls.map(([command]) => command), ['git', 'npm', 'npm', 'npm', 'git', 'git', 'git', 'git', 'gh']);
  assert.equal(calls[1][1][0], 'install');
  assert.equal(calls[1][1][1], 'yaml@2.7.1');
  assert.equal(calls[1][1][3], '--save-prod');
});

test('live runner escalates when a verifier command fails', async () => {
  const request = await claimedDependencyRequest();
  const plan = buildDependencySweeperExecutionPlan({
    request,
    live: true,
    confirmationPhrase: DEPENDENCY_SWEEPER_CONFIRMATION_PHRASE,
  });
  const result = await executeDependencySweeperLiveRunner(plan, {
    runner: async (command, args) => ({
      command,
      args,
      exitCode: command === 'npm' && args[0] === 'test' ? 1 : command === 'git' && args[0] === 'diff' ? 1 : 0,
      stdout: '',
      stderr: command === 'npm' && args[0] === 'test' ? 'test failed' : '',
    }),
  });

  assert.equal(result.outcome, 'escalation-issue');
  assert.equal(result.runner_evidence.completion_form, 'escalation-issue');
  assert.equal(result.runner_evidence.status, 'escalated');
  assert.equal(result.runner_evidence.escalation.reason, 'verify-2 failed');
  assert.equal(result.runner_evidence.verifier_evidence.at(-1).status, 'failed');
});

test('live runner escalates instead of creating an empty dependency repair PR', async () => {
  const request = await claimedDependencyRequest();
  const plan = buildDependencySweeperExecutionPlan({
    request,
    live: true,
    confirmationPhrase: DEPENDENCY_SWEEPER_CONFIRMATION_PHRASE,
  });
  const result = await executeDependencySweeperLiveRunner(plan, {
    runner: async (command, args) => ({
      command,
      args,
      exitCode: 0,
      stdout: '',
      stderr: '',
    }),
  });

  assert.equal(result.outcome, 'escalation-issue');
  assert.equal(result.runner_evidence.escalation.reason, 'require-dependency-diff failed');
  assert.equal(result.steps.at(-1).name, 'require-dependency-diff');
});

test('live runner refuses high-risk consumed requests even if they were manually mutated after claim', async () => {
  const claimedRequest = await claimedDependencyRequest();
  const request = {
    ...claimedRequest,
    route_decision: {
      ...claimedRequest.route_decision,
      risk: 'high',
    },
  };
  const plan = buildDependencySweeperExecutionPlan({
    request,
    live: true,
    confirmationPhrase: DEPENDENCY_SWEEPER_CONFIRMATION_PHRASE,
  });

  assert.equal(plan.status, 'refused');
  assert.match(plan.refusals.map((item) => item.reason).join('\n'), /risk must be low or medium/);
});

test('live runner refuses dependency requests without an explicit dependency section', async () => {
  const claimedRequest = await claimedDependencyRequest();
  const request = {
    ...claimedRequest,
    subject: {
      ...claimedRequest.subject,
      dependency_section: '',
    },
  };
  const plan = buildDependencySweeperExecutionPlan({
    request,
    live: true,
    confirmationPhrase: DEPENDENCY_SWEEPER_CONFIRMATION_PHRASE,
  });

  assert.equal(plan.status, 'refused');
  assert.match(plan.refusals.map((item) => item.reason).join('\n'), /dependency_section must be explicit/);
});

test('live runner requires the fixed confirmation phrase before live side effects', async () => {
  const request = await claimedDependencyRequest();
  const plan = buildDependencySweeperExecutionPlan({
    request,
    live: true,
    confirmationPhrase: 'yes',
  });

  assert.equal(plan.status, 'refused');
  assert.match(plan.refusals.map((item) => item.reason).join('\n'), /fixed confirmation phrase/);
});
