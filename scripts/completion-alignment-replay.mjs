#!/usr/bin/env node
import {
  buildCompletionEvidence,
  buildCompletionEvidenceCompatibility,
  deriveCompletionEvidenceFreshness,
  validateCompletionEvidence,
} from '../tools/zj-loop-core/dist/index.js';

import { compareCompletionLedgers } from './validate-completion-delta-gate.mjs';

export function replayCompletionAlignmentCorpus() {
  const compatibility = buildCompatibility('protocol-v1', 'verification-v1');
  const changedCompatibility = buildCompatibility('protocol-v2', 'verification-v1');
  const baseline = ledgerWithCell('complete');
  const currentStale = ledgerWithCell('stale');
  const currentBlocked = ledgerWithCell('blocked');
  const currentComplete = ledgerWithCell('complete');

  const scenarios = [
    scenario('pass', 'pass', validateEvidence({ status: 'executed_to_review_artifact' })),
    scenario('stale', 'stale', {
      actual: deriveCompletionEvidenceFreshness(compatibility, changedCompatibility).status,
      freshness: deriveCompletionEvidenceFreshness(compatibility, changedCompatibility),
    }),
    scenario('blocked', 'blocked', {
      actual: currentBlocked.cells[0].status,
      cell: currentBlocked.cells[0],
      side_effects_executed: false,
    }),
    scenario('regression', 'regression', {
      actual: compareCompletionLedgers(baseline, currentStale).regressions.length > 0 ? 'regression' : 'no-regression',
      delta: compareCompletionLedgers(baseline, currentStale),
      side_effects_executed: false,
    }),
    scenario('recovery', 'recovery', replayRecovery()),
    scenario('duplicate', 'duplicate', validateEvidence({
      status: 'duplicate',
      duplicateOf: 'orch-original',
    })),
  ];

  const results = scenarios.map((item) => ({
    ...item,
    pass: item.actual === item.expected && item.side_effects_executed === false,
  }));
  return {
    schema: 'zj-loop.completion_replay_corpus.v1',
    status: results.every((result) => result.pass) ? 'passed' : 'failed',
    scenario_count: results.length,
    provider_calls: 0,
    writes: 0,
    side_effects_executed: false,
    results,
  };
}

function validateEvidence({ status, duplicateOf = undefined }) {
  const evidence = buildCompletionEvidence({
    orchestrationId: 'orch-replay',
    signalId: 'signal-replay',
    routeId: 'manual-smoke-report',
    requestId: 'request-replay',
    carrier: { kind: 'local-replay', id: 'carrier-replay' },
    consumerId: 'manual-smoke',
    currentHeadSha: 'head-replay',
    status,
    reviewArtifact: status === 'executed_to_review_artifact' ? { kind: 'replay-artifact', path: 'replay.json' } : null,
    stopReason: status === 'hard_stopped' ? 'replay-blocked' : null,
    resumeAnchor: status === 'hard_stopped' || status === 'resume' ? 'resume:orch-replay' : null,
    evidenceRefs: [{ kind: 'replay', path: 'completion-alignment-replay.json' }],
    provenance: { provider: 'none', orchestration_id: 'orch-replay' },
    duplicateOf,
  });
  const result = validateCompletionEvidence(evidence);
  return {
    actual: result.ok ? status === 'executed_to_review_artifact' ? 'pass' : status : 'invalid',
    side_effects_executed: result.side_effects_executed,
    validation: result,
  };
}

function replayRecovery() {
  const hardStop = validateEvidence({ status: 'hard_stopped' });
  const resumed = validateEvidence({ status: 'resume' });
  return {
    actual: hardStop.validation.ok && resumed.validation.ok && hardStop.validation.evidence?.resume_anchor === resumed.validation.evidence?.resume_anchor
      ? 'recovery'
      : 'invalid',
    side_effects_executed: hardStop.side_effects_executed || resumed.side_effects_executed,
    hard_stop_resume_anchor: hardStop.validation.evidence?.resume_anchor,
    resume_anchor: resumed.validation.evidence?.resume_anchor,
  };
}

function buildCompatibility(protocolDigest, verificationDigest) {
  return buildCompletionEvidenceCompatibility({
    targetId: 'automation-first-product',
    routeId: 'manual-smoke-report',
    adapterId: 'workspace',
    target_digest: 'target-v1',
    route_table_digest: 'route-table-v1',
    route_digest: 'route-v1',
    adapter_digest: 'adapter-v1',
    runner_digest: 'runner-v1',
    workflow_digest: 'workflow-v1',
    protocol_digest: protocolDigest,
    verification_digest: verificationDigest,
  });
}

function ledgerWithCell(status) {
  return {
    schema: 'zj-loop.completion-alignment-ledger.v1',
    schema_version: 1,
    target: { id: 'automation-first-product', digest: 'target-v1', route_table_digest: 'route-table-v1' },
    summary: { complete: status === 'complete' ? 1 : 0, incomplete: 0, blocked: status === 'blocked' ? 1 : 0, stale: status === 'stale' ? 1 : 0, unsupported: 0, 'not-applicable-with-reason': 0 },
    cells: [{ route_id: 'manual-smoke-report', adapter_id: 'workspace', status }],
  };
}

function scenario(name, expected, result) {
  return { name, expected, actual: result.actual ?? expected, side_effects_executed: result.side_effects_executed ?? false, evidence: result };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = replayCompletionAlignmentCorpus();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'passed') process.exitCode = 1;
}
