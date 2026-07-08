import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDuplicateEvidence,
  buildReportEvidenceBase,
  buildRouteDecisionId,
  buildRouteMatchDiagnostics,
  buildSideEffects,
  normalizeEvidence,
  routeMatchesSignal,
  stableHash,
} from './route-decision-contract.mjs';

test('stableHash returns deterministic 12 character hashes', () => {
  assert.equal(stableHash('route:signal'), stableHash('route:signal'));
  assert.match(stableHash('route:signal'), /^[0-9a-f]{12}$/);
  assert.notEqual(stableHash('route:signal'), stableHash('route:other-signal'));
});

test('normalizeEvidence keeps arrays and wraps single evidence values', () => {
  const evidence = ['issue:48'];

  assert.equal(normalizeEvidence(evidence), evidence);
  assert.deepEqual(normalizeEvidence(undefined), []);
  assert.deepEqual(normalizeEvidence(null), []);
  assert.deepEqual(normalizeEvidence('issue:48'), ['issue:48']);
  assert.deepEqual(normalizeEvidence({ url: 'https://example.test' }), [{ url: 'https://example.test' }]);
});

test('routeMatchesSignal treats empty match as match and respects allowed values', () => {
  assert.equal(routeMatchesSignal(null, { source: 'ci' }), false);
  assert.equal(routeMatchesSignal({}, { source: 'ci' }), true);
  assert.equal(routeMatchesSignal({ match: { source: ['ci'] } }, { source: 'ci' }), true);
  assert.equal(routeMatchesSignal({ match: { source: ['issue'] } }, { source: 'ci' }), false);
  assert.equal(routeMatchesSignal({ match: { source: [] } }, { source: 'ci' }), true);
});

test('buildRouteDecisionId combines prefix and stable hash parts', () => {
  assert.equal(
    buildRouteDecisionId({ prefix: 'rd_report', parts: ['route', 'signal', 'repo'] }),
    'rd_report_7c7d94bf05de',
  );
});

test('buildRouteMatchDiagnostics reports route enablement, request kind, and match state', () => {
  const diagnostics = buildRouteMatchDiagnostics({
    route: {
      enabled: true,
      request_kind: 'report-only',
      match: { source: ['issue'] },
    },
    signal: { source: 'issue' },
    expectedRequestKind: 'report-only',
  });

  assert.deepEqual(diagnostics, {
    route_enabled: true,
    request_kind_allowed: true,
    route_matched: true,
  });
});

test('buildSideEffects defaults known flags to false and preserves explicit true values', () => {
  assert.deepEqual(
    buildSideEffects(['issue_fix_request_created', 'consumer_work_started']),
    {
      issue_fix_request_created: false,
      consumer_work_started: false,
    },
  );
  assert.deepEqual(
    buildSideEffects(['issue_fix_request_created', 'consumer_work_started'], {
      consumer_work_started: true,
    }),
    {
      issue_fix_request_created: false,
      consumer_work_started: true,
    },
  );
});

test('buildDuplicateEvidence returns stable duplicate metadata without lifecycle decisions', () => {
  assert.deepEqual(
    buildDuplicateEvidence({
      status: 'duplicate',
      existingId: 'ifr_existing',
      existingUrl: 'https://github.com/example/repo/issues/1',
    }),
    {
      status: 'duplicate',
      existing_request_id: 'ifr_existing',
      existing_request_url: 'https://github.com/example/repo/issues/1',
    },
  );
});

test('buildReportEvidenceBase assembles report evidence without deciding status or next action', () => {
  const routeDecision = { route_id: 'daily-triage-report' };

  assert.deepEqual(
    buildReportEvidenceBase({
      schema: 'zj-loop.report_evidence.v1',
      status: 'reported',
      createdAt: '2026-07-07T00:00:00Z',
      routeDecision,
      evidenceStore: 'zj-loop/STATE.md',
      summary: 'Report summary',
      nextAction: 'record-report-evidence',
      sideEffects: { consumer_work_started: false },
    }),
    {
      schema: 'zj-loop.report_evidence.v1',
      status: 'reported',
      created_at: '2026-07-07T00:00:00Z',
      route_decision: routeDecision,
      evidence_store: 'zj-loop/STATE.md',
      summary: 'Report summary',
      next_action: 'record-report-evidence',
      side_effects: {
        consumer_work_started: false,
      },
    },
  );
});
