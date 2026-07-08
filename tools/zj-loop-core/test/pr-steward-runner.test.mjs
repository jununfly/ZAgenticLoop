import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildPrStewardExecutionPlan,
  executePrStewardLiveRunner,
  PR_STEWARD_CONFIRMATION_PHRASE,
  validatePrStewardLiveRequest,
} from '../dist/index.js';

const PR_STEWARD_CLI = fileURLToPath(new URL('../dist/pr-steward-cli.js', import.meta.url));

function consumedPrStewardRequest(overrides = {}) {
  const request = {
    schema: 'zj-loop.issue_fix_request.v1',
    request_id: 'ifr-pr-steward-1',
    status: 'consumed',
    created_at: '2026-07-07T00:00:00Z',
    source_signal: {
      source: 'pull_request',
      source_url: 'https://github.com/jununfly/ZAgenticLoop/pull/123',
    },
    route_decision: {
      schema: 'zj-loop.route_decision.v1',
      route_id: 'pr-steward-fix-request',
      request_kind: 'issue-fix-request',
      target_consumer: 'pr-steward',
      dedupe_key: 'pull-request:123:abc123def456',
      risk: 'medium',
    },
    dedupe_key: 'pull-request:123:abc123def456',
    requested_consumer: {
      consumer_id: 'pr-steward',
      capability: 'pr-review-and-readiness-fix',
    },
    fix_scope: {
      files_or_areas: ['scripts/pr-steward-deterministic-repair.mjs'],
      non_goals: ['source PR mutation', 'auto-merge'],
    },
    acceptance_criteria: ['Open an independent repair PR or escalation issue.'],
    verification_gate: {
      commands: ['npm ci', 'npm run test:issue-fix-request', 'git diff --check'],
    },
    failure_policy: {
      retry: 'new_request_only',
    },
    lifecycle: {
      consumed_by: 'pr-steward',
    },
    subject: {
      type: 'pull_request',
      repo: 'jununfly/ZAgenticLoop',
      pr_number: 123,
      head_sha: 'abc123def456',
      base_branch: 'main',
    },
  };
  return {
    ...request,
    ...overrides,
    route_decision: { ...request.route_decision, ...(overrides.route_decision ?? {}) },
    requested_consumer: { ...request.requested_consumer, ...(overrides.requested_consumer ?? {}) },
    verification_gate: { ...request.verification_gate, ...(overrides.verification_gate ?? {}) },
    lifecycle: { ...request.lifecycle, ...(overrides.lifecycle ?? {}) },
    subject: { ...request.subject, ...(overrides.subject ?? {}) },
  };
}

test('PR Steward validates consumed PR fix requests against current head sha', () => {
  const ok = validatePrStewardLiveRequest({
    request: consumedPrStewardRequest(),
    currentPrHeadSha: 'abc123def456',
  });
  const stale = validatePrStewardLiveRequest({
    request: consumedPrStewardRequest(),
    currentPrHeadSha: 'new789head000',
  });

  assert.equal(ok.ok, true);
  assert.equal(stale.ok, false);
  assert.match(stale.errors.join('\n'), /current_pr_head_sha/);
});

test('PR Steward fix plan separates escalation and repair PR completion modes', () => {
  const escalation = buildPrStewardExecutionPlan({
    request: consumedPrStewardRequest(),
    currentPrHeadSha: 'abc123def456',
  });
  const repair = buildPrStewardExecutionPlan({
    request: consumedPrStewardRequest(),
    currentPrHeadSha: 'abc123def456',
    repairCommands: ['node scripts/pr-steward-deterministic-repair.mjs'],
    repairFiles: ['scripts/pr-steward-deterministic-repair.mjs'],
    live: true,
    confirmationPhrase: PR_STEWARD_CONFIRMATION_PHRASE,
  });

  assert.equal(escalation.status, 'dry-run');
  assert.equal(escalation.completion_mode, 'escalation-issue');
  assert.deepEqual(escalation.actions.map((action) => action.name), ['create-escalation-issue']);
  assert.equal(repair.status, 'ready-for-live-execution');
  assert.equal(repair.completion_mode, 'repair-pr');
  assert.ok(repair.actions.some((action) => action.name === 'require-repair-diff'));
});

test('PR Steward live execution records independent repair PR and no source PR side effects', async () => {
  const plan = buildPrStewardExecutionPlan({
    request: consumedPrStewardRequest(),
    currentPrHeadSha: 'abc123def456',
    repairCommands: ['node scripts/pr-steward-deterministic-repair.mjs'],
    repairFiles: ['scripts/pr-steward-deterministic-repair.mjs'],
    live: true,
    confirmationPhrase: PR_STEWARD_CONFIRMATION_PHRASE,
  });
  const result = await executePrStewardLiveRunner(plan, {
    runner: async (command, args) => {
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

  assert.equal(result.outcome, 'repair-pr');
  assert.equal(result.runner_evidence.completion_form, 'repair-pr');
  assert.equal(result.runner_evidence.repair_pull_request.url, 'https://github.com/jununfly/ZAgenticLoop/pull/1000');
  assert.deepEqual(result.runner_evidence.source_pr_side_effects, {
    comment_created: false,
    label_changed: false,
    rebased: false,
    merged: false,
    workflow_dispatched: false,
  });
});

test('PR Steward fix-plan CLI reads request JSON', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-pr-steward-'));
  const requestPath = path.join(dir, 'request.json');
  await writeFile(requestPath, JSON.stringify(consumedPrStewardRequest(), null, 2));
  try {
    const result = spawnSync(process.execPath, [
      PR_STEWARD_CLI,
      'fix-plan',
      '--request',
      requestPath,
      '--current-pr-head-sha',
      'abc123def456',
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.kind, 'zj-loop.pr-steward-live-runner-plan');
    assert.equal(parsed.completion_mode, 'escalation-issue');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
