import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { dispatchSignalToReportOnlyRoute } from './report-only-route-dispatcher.mjs';

const ROUTE_TABLE_PATH = 'zj-loop/zj-loop-route-table.yaml';

async function routeTableText() {
  return readFile(ROUTE_TABLE_PATH, 'utf8');
}

test('report-only dispatcher routes high risk signals to human without side-effect requests', async () => {
  const result = dispatchSignalToReportOnlyRoute({
    routeTableText: await routeTableText(),
    routeId: 'human',
    signal: {
      signal_id: 'issue:21:security-review',
      source: 'issue',
      subject: '#21',
      priority: 'P0',
      state: 'ready-for-human',
      risk: 'high',
      confidence: 'high',
      evidence: ['https://github.com/jununfly/ZAgenticLoop/issues/21'],
      summary: 'Security-sensitive plan needs maintainer review.',
    },
    createdAt: '2026-07-06T00:00:00Z',
  });

  assert.equal(result.action, 'report');
  assert.equal(result.routeDecision.allowed, true);
  assert.equal(result.routeDecision.request_kind, 'report-only');
  assert.equal(result.routeDecision.requested_action, 'report');
  assert.equal(result.routeDecision.status, 'closed');
  assert.equal(result.reportEvidence.status, 'reported');
  assert.deepEqual(result.reportEvidence.side_effects, {
    issue_fix_request_created: false,
    activation_request_created: false,
    workflow_dispatched: false,
    consumer_work_started: false,
  });
});

test('report-only dispatcher routes ignored noise without creating a request', async () => {
  const result = dispatchSignalToReportOnlyRoute({
    routeTableText: await routeTableText(),
    routeId: 'ignore',
    signal: {
      signal_id: 'daily:noise:dependabot-noop',
      source: 'daily-triage',
      subject: 'dependabot noop',
      priority: 'P3',
      state: 'none',
      route: 'ignore',
      risk: 'low',
      confidence: 'high',
      summary: 'Already covered by separate dependency automation.',
    },
    createdAt: '2026-07-06T00:00:00Z',
  });

  assert.equal(result.action, 'ignore');
  assert.equal(result.routeDecision.allowed, true);
  assert.equal(result.routeDecision.reason, 'report-only route matched');
  assert.equal(result.reportEvidence.status, 'ignored');
  assert.equal(result.reportEvidence.next_action, 'record-noise-reason');
});

test('report-only dispatcher routes daily triage report signals to state evidence', async () => {
  const result = dispatchSignalToReportOnlyRoute({
    routeTableText: await routeTableText(),
    routeId: 'daily-triage-report',
    signal: {
      signal_id: 'daily:report:2026-07-06',
      source: 'daily-triage',
      subject: 'daily triage report',
      priority: 'P2',
      state: 'none',
      route: 'daily-triage',
      risk: 'medium',
      confidence: 'high',
      summary: 'Daily triage report should update STATE.md only.',
    },
    createdAt: '2026-07-06T00:00:00Z',
  });

  assert.equal(result.action, 'report');
  assert.equal(result.routeDecision.allowed, true);
  assert.equal(result.routeDecision.target_consumer, 'daily-triage');
  assert.equal(result.reportEvidence.evidence_store, 'zj-loop/STATE.md');
});

test('report-only dispatcher denies route kind drift before side effects', async () => {
  const routeTableTextWithDrift = (await routeTableText()).replace(
    /route_id: "human"\n    enabled: true\n    request_kind: "report-only"/,
    'route_id: "human"\n    enabled: true\n    request_kind: "issue-fix-request"',
  );
  const result = dispatchSignalToReportOnlyRoute({
    routeTableText: routeTableTextWithDrift,
    routeId: 'human',
    signal: {
      signal_id: 'issue:21:security-review',
      source: 'issue',
      subject: '#21',
      risk: 'high',
    },
    createdAt: '2026-07-06T00:00:00Z',
  });

  assert.equal(result.action, 'denied');
  assert.equal(result.routeDecision.allowed, false);
  assert.equal(result.routeDecision.reason, 'route-kind-not-report-only');
  assert.equal(result.reportEvidence, null);
});

test('report-only dispatcher denies non-matching signals', async () => {
  const result = dispatchSignalToReportOnlyRoute({
    routeTableText: await routeTableText(),
    routeId: 'ignore',
    signal: {
      signal_id: 'daily:watch:item',
      source: 'daily-triage',
      subject: 'watch item',
      route: 'watch',
      risk: 'low',
    },
    createdAt: '2026-07-06T00:00:00Z',
  });

  assert.equal(result.action, 'denied');
  assert.equal(result.routeDecision.reason, 'signal-does-not-match-route');
  assert.equal(result.reportEvidence, null);
});
