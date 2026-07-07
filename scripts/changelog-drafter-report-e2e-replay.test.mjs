import assert from 'node:assert/strict';
import test from 'node:test';

import { runChangelogDrafterReportReplaySuite } from './changelog-drafter-report-e2e-replay.mjs';

test('Changelog Drafter report route records merged PR release-window evidence only', async () => {
  const suite = await runChangelogDrafterReportReplaySuite();
  const replay = suite.results.find((result) => result.name === 'merged-pr-release-window').replay;

  assert.equal(suite.passed, true);
  assert.equal(replay.outcome, 'report-evidence');
  assert.equal(replay.routeDecision.route_id, 'changelog-drafter-report');
  assert.equal(replay.routeDecision.request_kind, 'report-only');
  assert.equal(replay.routeDecision.target_consumer, 'changelog-drafter');
  assert.equal(replay.routeDecision.dedupe_key, 'changelog:jununfly/ZAgenticLoop:main:v1.5.0:HEAD');
  assert.equal(replay.reportEvidence.evidence_store, 'zj-loop/changelog-drafter-state.md');
  assert.equal(replay.changelogDrafterReport.release_window.since_ref, 'v1.5.0');
  assert.equal(replay.changelogDrafterReport.next_action, 'run-changelog-drafter-consumer');
  assert.equal(replay.sideEffects.release_notes_draft_created, false);
  assert.equal(replay.sideEffects.changelog_edited, false);
  assert.equal(replay.sideEffects.release_created, false);
});

test('Changelog Drafter report route supports manual release-prep signals', async () => {
  const suite = await runChangelogDrafterReportReplaySuite();
  const replay = suite.results.find((result) => result.name === 'manual-release-prep').replay;

  assert.equal(replay.outcome, 'report-evidence');
  assert.equal(replay.routeDecision.source, 'human');
  assert.equal(replay.changelogDrafterReport.release_window.window_kind, 'state-window');
});

test('Changelog Drafter report route human-gates breaking security and large windows without denying evidence', async () => {
  const suite = await runChangelogDrafterReportReplaySuite();
  const breaking = suite.results.find((result) => result.name === 'breaking-change-human-gate').replay;
  const large = suite.results.find((result) => result.name === 'large-window-human-gate').replay;

  assert.equal(breaking.outcome, 'human-gate-required');
  assert.equal(breaking.routeDecision.allowed, true);
  assert.equal(breaking.changelogDrafterReport.human_gate.required, true);
  assert.equal(breaking.changelogDrafterReport.next_action, 'human-review-before-changelog-drafting');

  assert.equal(large.outcome, 'human-gate-required');
  assert.deepEqual(large.changelogDrafterReport.human_gate.reasons, ['scan_window_too_large']);
});

test('Changelog Drafter report route duplicates by release window and rejects tag events', async () => {
  const suite = await runChangelogDrafterReportReplaySuite();
  const duplicate = suite.results.find((result) => result.name === 'duplicate-release-window').replay;
  const tag = suite.results.find((result) => result.name === 'tag-event-denied').replay;

  assert.equal(duplicate.outcome, 'duplicate');
  assert.equal(duplicate.changelogDrafterReport.status, 'duplicate');
  assert.equal(duplicate.changelogDrafterReport.next_action, 'report-existing-changelog-drafter-status');

  assert.equal(tag.outcome, 'route-denied');
  assert.equal(tag.routeDecision.allowed, false);
  assert.equal(tag.routeDecision.reason, 'signal-does-not-match-route');
});
