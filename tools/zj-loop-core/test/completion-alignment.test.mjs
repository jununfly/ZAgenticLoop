import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCompletionAlignmentLedger,
  parseRouteTable,
} from '../dist/index.js';

const ROUTE_TABLE = parseRouteTable(`schemaVersion: 1
kind: zj-loop-route-table
metadata:
  completion_target:
    id: automation-first-product
    schema_version: 1
routes:
  - route_id: manual-smoke-report
    enabled: true
    request_kind: report-only
    consumer: manual-smoke
    consumer_kind: report-consumer
    execution:
      mode: report-only
      side_effect_level: evidence
      completion_forms: [report-evidence]
      recent_success_evidence: [dogfood-run:manual-smoke]
    maturity:
      protocol: dogfooded
      runner: dogfooded
    capabilities:
      scopes: [manual-smoke]
      verifiers: [workflow-summary]
      max_side_effect_level: evidence
    provider_support:
      github: { status: live-supported, evidence: [dogfood-run:manual-smoke] }
      gitlab: { status: live-supported, evidence: [] }
    completion_target:
      adapters:
        github: { applicability: applicable, requirement: required, signal_initiation_mode: explicit-on-demand }
        gitlab: { applicability: applicable, requirement: required, signal_initiation_mode: explicit-on-demand }
        workspace: { applicability: applicable, requirement: required, signal_initiation_mode: explicit-on-demand }
  - route_id: pr-steward-report
    enabled: false
    request_kind: report-only
    consumer: pr-steward
    consumer_kind: report-consumer
    execution:
      mode: report-only
      side_effect_level: evidence
      completion_forms: [report-evidence]
    maturity:
      protocol: replayed
      runner: replayed
    capabilities:
      scopes: [pull-request]
      verifiers: [route-replay]
      max_side_effect_level: evidence
    provider_support:
      github: { status: dry-run-supported, evidence: [workflow:zj-loop-pr-steward.yml] }
      gitlab: { status: dry-run-supported, evidence: [gitlab-ci:zj-loop-pr-steward.yml] }
    completion_target:
      adapters:
        github: { applicability: applicable, requirement: required, signal_initiation_mode: event-driven }
        gitlab: { applicability: applicable, requirement: required, signal_initiation_mode: event-driven }
        workspace: { applicability: not-applicable-with-reason, not_applicable_reason: no-pr-mr-semantic-object }
`);

test('buildCompletionAlignmentLedger derives required adapter cells without treating not-applicable as unsupported', () => {
  const ledger = buildCompletionAlignmentLedger({
    table: ROUTE_TABLE,
    routeTableText: 'completion-target-fixture',
    evidence: [
      {
        route_id: 'manual-smoke-report',
        adapter_id: 'github',
        stop_recovery: 'pass',
        experience_continuity: 'pass',
        automatic_progression: 'pass',
        verification: 'pass',
      },
    ],
  });

  assert.equal(ledger.schema, 'zj-loop.completion-alignment-ledger.v1');
  assert.equal(ledger.target.id, 'automation-first-product');
  assert.match(ledger.target.digest, /^[a-f0-9]{64}$/);
  assert.match(ledger.target.route_table_digest, /^[a-f0-9]{64}$/);

  const githubSmoke = ledger.cells.find((cell) => cell.route_id === 'manual-smoke-report' && cell.adapter_id === 'github');
  assert.equal(githubSmoke?.status, 'complete');
  assert.equal(githubSmoke?.gates.live_capability, 'pass');
  assert.deepEqual(githubSmoke?.next_actions, []);

  const gitlabSmoke = ledger.cells.find((cell) => cell.route_id === 'manual-smoke-report' && cell.adapter_id === 'gitlab');
  assert.equal(gitlabSmoke?.status, 'unsupported');

  const workspaceSteward = ledger.cells.find((cell) => cell.route_id === 'pr-steward-report' && cell.adapter_id === 'workspace');
  assert.equal(workspaceSteward?.status, 'not-applicable-with-reason');
  assert.equal(workspaceSteward?.not_applicable_reason, 'no-pr-mr-semantic-object');
});

test('buildCompletionAlignmentLedger preserves stale and blocked evidence over missing capability', () => {
  const ledger = buildCompletionAlignmentLedger({
    table: ROUTE_TABLE,
    evidence: [
      {
        route_id: 'manual-smoke-report',
        adapter_id: 'workspace',
        live_capability: 'missing',
        stop_recovery: 'pass',
        experience_continuity: 'pass',
        automatic_progression: 'stale',
        verification: 'pass',
      },
      {
        route_id: 'pr-steward-report',
        adapter_id: 'github',
        live_capability: 'missing',
        stop_recovery: 'blocked',
      },
    ],
  });

  assert.equal(
    ledger.cells.find((cell) => cell.route_id === 'manual-smoke-report' && cell.adapter_id === 'workspace')?.status,
    'stale',
  );
  assert.equal(
    ledger.cells.find((cell) => cell.route_id === 'pr-steward-report' && cell.adapter_id === 'github')?.status,
    'blocked',
  );
});
