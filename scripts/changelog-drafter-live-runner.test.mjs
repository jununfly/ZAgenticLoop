import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  CHANGELOG_DRAFTER_CONFIRMATION_PHRASE,
  buildChangelogDrafterExecutionPlan,
  executeChangelogDrafterLiveRunner,
  validateChangelogDrafterLiveRequest,
} from './changelog-drafter-live-runner.mjs';
import {
  DEFAULT_CHANGELOG_DRAFTER_DRAFT_REQUEST_SCENARIOS,
  replayChangelogDrafterDraftRequest,
} from './changelog-drafter-draft-request-e2e-replay.mjs';

const ROUTE_TABLE_PATH = 'zj-loop/zj-loop-route-table.yaml';

async function changelogDraftRequest(scenarioName = 'reported-window-becomes-draft-request-candidate') {
  const routeTableText = await readFile(ROUTE_TABLE_PATH, 'utf8');
  const scenario = DEFAULT_CHANGELOG_DRAFTER_DRAFT_REQUEST_SCENARIOS.find((item) => item.name === scenarioName);
  const replay = replayChangelogDrafterDraftRequest({ routeTableText, scenario });
  return replay.changelogDraftRequest;
}

test('Changelog Drafter live runner creates draft-evidence from a valid draft request candidate', async () => {
  const draftRequest = await changelogDraftRequest();
  const plan = buildChangelogDrafterExecutionPlan({
    draftRequest,
    draftMode: 'evidence',
    draftFile: 'docs/release-notes-draft.md',
    live: true,
    confirmationPhrase: CHANGELOG_DRAFTER_CONFIRMATION_PHRASE,
  });
  const calls = [];
  const result = await executeChangelogDrafterLiveRunner(plan, {
    runner: async (command, args) => {
      calls.push([command, args]);
      return { command, args, exitCode: 0, stdout: '', stderr: '' };
    },
  });

  assert.equal(plan.status, 'ready-for-live-execution');
  assert.equal(result.outcome, 'draft-evidence');
  assert.equal(result.runner_evidence.schema, 'zj-loop.live_runner_evidence.v1');
  assert.equal(result.runner_evidence.completion_form, 'draft-evidence');
  assert.equal(result.runner_evidence.status, 'completed');
  assert.equal(result.runner_evidence.draft_evidence.file, 'docs/release-notes-draft.md');
  assert.deepEqual(result.runner_evidence.release_side_effects, {
    tag_created: false,
    release_created: false,
    package_published: false,
    final_changelog_acceptance: false,
  });
  assert.deepEqual(calls.map(([command]) => command), ['node']);
});

test('Changelog Drafter live runner creates draft-pr evidence when requested', async () => {
  const draftRequest = await changelogDraftRequest();
  const plan = buildChangelogDrafterExecutionPlan({
    draftRequest,
    draftMode: 'pr',
    draftFile: 'docs/release-notes-draft.md',
    live: true,
    confirmationPhrase: CHANGELOG_DRAFTER_CONFIRMATION_PHRASE,
  });
  const calls = [];
  const result = await executeChangelogDrafterLiveRunner(plan, {
    runner: async (command, args) => {
      calls.push([command, args]);
      if (command === 'git' && args[0] === 'diff' && args.includes('--quiet')) {
        return { command, args, exitCode: 1, stdout: '', stderr: '' };
      }
      return {
        command,
        args,
        exitCode: 0,
        stdout: command === 'gh' ? 'https://github.com/jununfly/ZAgenticLoop/pull/1002\n' : '',
        stderr: '',
      };
    },
  });

  assert.equal(result.outcome, 'draft-pr');
  assert.equal(result.runner_evidence.completion_form, 'draft-pr');
  assert.equal(result.runner_evidence.draft_pull_request.url, 'https://github.com/jununfly/ZAgenticLoop/pull/1002');
  assert.deepEqual(calls.map(([command]) => command), ['git', 'git', 'git', 'git', 'node', 'git', 'git', 'git', 'git', 'gh']);
});

test('Changelog Drafter live runner escalates when draft PR would be empty', async () => {
  const draftRequest = await changelogDraftRequest();
  const plan = buildChangelogDrafterExecutionPlan({
    draftRequest,
    draftMode: 'pr',
    draftFile: 'docs/release-notes-draft.md',
    live: true,
    confirmationPhrase: CHANGELOG_DRAFTER_CONFIRMATION_PHRASE,
  });
  const result = await executeChangelogDrafterLiveRunner(plan, {
    runner: async (command, args) => ({ command, args, exitCode: 0, stdout: '', stderr: '' }),
  });

  assert.equal(result.outcome, 'escalation-issue');
  assert.equal(result.runner_evidence.escalation.reason, 'require-draft-diff failed');
});

test('Changelog Drafter live runner refuses human-gated or duplicate draft requests', async () => {
  const humanGated = await changelogDraftRequest('human-gated-window-records-human-gate');
  const duplicate = await changelogDraftRequest('duplicate-draft-request-candidate');

  const humanPlan = buildChangelogDrafterExecutionPlan({
    draftRequest: humanGated,
    live: true,
    confirmationPhrase: CHANGELOG_DRAFTER_CONFIRMATION_PHRASE,
  });
  const duplicatePlan = buildChangelogDrafterExecutionPlan({
    draftRequest: duplicate,
    live: true,
    confirmationPhrase: CHANGELOG_DRAFTER_CONFIRMATION_PHRASE,
  });

  assert.equal(humanPlan.status, 'refused');
  assert.match(humanPlan.refusals.map((item) => item.reason).join('\n'), /status must be draft-request-candidate/);
  assert.equal(duplicatePlan.status, 'refused');
  assert.match(duplicatePlan.refusals.map((item) => item.reason).join('\n'), /status must be draft-request-candidate/);
});

test('Changelog Drafter live runner requires safe draft file and fixed confirmation phrase', async () => {
  const draftRequest = await changelogDraftRequest();
  const unsafePath = buildChangelogDrafterExecutionPlan({
    draftRequest,
    draftFile: '../release.md',
    live: true,
    confirmationPhrase: CHANGELOG_DRAFTER_CONFIRMATION_PHRASE,
  });
  const badConfirm = buildChangelogDrafterExecutionPlan({
    draftRequest,
    live: true,
    confirmationPhrase: 'yes',
  });

  assert.equal(unsafePath.status, 'refused');
  assert.match(unsafePath.refusals.map((item) => item.reason).join('\n'), /safe repository-relative markdown path/);
  assert.equal(badConfirm.status, 'refused');
  assert.match(badConfirm.refusals.map((item) => item.reason).join('\n'), /fixed confirmation phrase/);
});

test('Changelog Drafter live request validation rejects missing report evidence', () => {
  const validation = validateChangelogDrafterLiveRequest(null);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /draft request evidence is required/);
});
