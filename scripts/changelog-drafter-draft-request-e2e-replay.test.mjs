import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runChangelogDrafterDraftRequestReplaySuite,
  validateChangelogDraftRequestInput,
} from './changelog-drafter-draft-request-e2e-replay.mjs';

test('Changelog Drafter draft request records candidate evidence from an existing report', async () => {
  const suite = await runChangelogDrafterDraftRequestReplaySuite();
  const replay = suite.results.find((result) => result.name === 'reported-window-becomes-draft-request-candidate').replay;

  assert.equal(suite.passed, true);
  assert.equal(replay.outcome, 'draft-request-candidate');
  assert.equal(replay.routeDecision.route_id, 'changelog-drafter-draft-request');
  assert.equal(replay.routeDecision.request_kind, 'report-only');
  assert.equal(replay.routeDecision.target_consumer, 'changelog-drafter');
  assert.equal(
    replay.changelogDraftRequest.dedupe_key,
    'draft-request:changelog:jununfly/ZAgenticLoop:main:v1.5.0:HEAD',
  );
  assert.equal(replay.changelogDraftRequest.source_report.route_id, 'changelog-drafter-report');
  assert.equal(replay.changelogDraftRequest.status, 'draft-request-candidate');
  assert.equal(replay.changelogDraftRequest.next_action, 'run-changelog-drafter-consumer');
  assert.deepEqual(replay.changelogDraftRequest.side_effects, {
    release_notes_draft_created: false,
    changelog_edited: false,
    changelog_pr_created: false,
    draft_consumer_started: false,
    workflow_dispatched: false,
    tag_created: false,
    release_created: false,
    package_published: false,
  });
});

test('Changelog Drafter draft request keeps human-gated windows out of the consumer', async () => {
  const suite = await runChangelogDrafterDraftRequestReplaySuite();
  const replay = suite.results.find((result) => result.name === 'human-gated-window-records-human-gate').replay;

  assert.equal(replay.outcome, 'human-gate-required');
  assert.equal(replay.routeDecision.allowed, true);
  assert.equal(replay.changelogDraftRequest.human_gate.required, true);
  assert.equal(replay.changelogDraftRequest.next_action, 'human-review-before-changelog-draft-request');
  assert.equal(replay.changelogDraftRequest.side_effects.draft_consumer_started, false);
});

test('Changelog Drafter draft request dedupes by draft-request prefixed release window key', async () => {
  const suite = await runChangelogDrafterDraftRequestReplaySuite();
  const replay = suite.results.find((result) => result.name === 'duplicate-draft-request-candidate').replay;

  assert.equal(replay.outcome, 'duplicate');
  assert.equal(replay.changelogDraftRequest.status, 'duplicate');
  assert.equal(replay.changelogDraftRequest.duplicate.evidence_url, 'zj-loop/changelog-drafter-state.md#draft-request-candidates');
});

test('Changelog Drafter draft request rejects missing report evidence and publish-adjacent signals', async () => {
  const suite = await runChangelogDrafterDraftRequestReplaySuite();
  const missing = suite.results.find((result) => result.name === 'missing-report-rejected').replay;
  const publish = suite.results.find((result) => result.name === 'publish-adjacent-signal-denied').replay;

  assert.equal(missing.outcome, 'rejected');
  assert.match(missing.validation.errors.join('\n'), /changelog-drafter-report evidence is required/);
  assert.equal(missing.changelogDraftRequest.status, 'rejected');

  assert.equal(publish.outcome, 'route-denied');
  assert.equal(publish.routeDecision.allowed, false);
  assert.equal(publish.routeDecision.reason, 'signal-does-not-match-route');
});

test('Changelog Drafter draft request validation requires report status and release window fields', () => {
  const validation = validateChangelogDraftRequestInput({
    route_id: 'changelog-drafter-report',
    status: 'reported',
    release_window: {
      repo: 'jununfly/ZAgenticLoop',
      base_branch: 'main',
      since_ref: 'v1.5.0',
    },
    dedupe_key: 'changelog:jununfly/ZAgenticLoop:main:v1.5.0:HEAD',
    human_gate: { required: false, reasons: [] },
  });

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /release_window.until_ref is required/);
});
