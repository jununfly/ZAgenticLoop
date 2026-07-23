import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCompletionEvidenceCompatibility,
  deriveCompletionEvidenceFreshness,
} from '../dist/index.js';

const BASE = {
  targetId: 'automation-first-product',
  routeId: 'manual-smoke-report',
  adapterId: 'github',
  target_digest: 'target-v1',
  route_table_digest: 'route-table-v1',
  route_digest: 'route-v1',
  adapter_digest: 'adapter-v1',
  runner_digest: 'runner-v1',
  workflow_digest: 'workflow-v1',
  protocol_digest: 'protocol-v1',
  verification_digest: 'verification-v1',
};

test('completion evidence compatibility fingerprint is deterministic', () => {
  const first = buildCompletionEvidenceCompatibility(BASE);
  const second = buildCompletionEvidenceCompatibility({ ...BASE });

  assert.equal(first.schema, 'zj-loop.completion_evidence_compatibility.v1');
  assert.equal(first.fingerprint, second.fingerprint);
  assert.match(first.fingerprint, /^[a-f0-9]{64}$/);
});

test('matching compatibility fingerprints remain compatible', () => {
  const current = buildCompletionEvidenceCompatibility(BASE);

  assert.deepEqual(deriveCompletionEvidenceFreshness(current, current), {
    schema: 'zj-loop.completion_evidence_freshness.v1',
    status: 'compatible',
    reason: 'compatible',
    changed_dimensions: [],
    side_effects_executed: false,
  });
});

test('relevant route and verification changes derive stale evidence', () => {
  const recorded = buildCompletionEvidenceCompatibility(BASE);
  const current = buildCompletionEvidenceCompatibility({
    ...BASE,
    route_digest: 'route-v2',
    verification_digest: 'verification-v2',
  });

  const result = deriveCompletionEvidenceFreshness(recorded, current);

  assert.equal(result.status, 'stale');
  assert.equal(result.reason, 'relevant-change');
  assert.deepEqual(result.changed_dimensions, ['route_digest', 'verification_digest']);
  assert.equal(result.side_effects_executed, false);
});

test('missing or tampered evidence fails closed', () => {
  const current = buildCompletionEvidenceCompatibility(BASE);

  assert.equal(deriveCompletionEvidenceFreshness(undefined, current).status, 'missing');
  const tampered = { ...current, fingerprint: 'tampered' };
  assert.equal(deriveCompletionEvidenceFreshness(tampered, current).status, 'stale');
  assert.equal(deriveCompletionEvidenceFreshness(tampered, current).reason, 'invalid-fingerprint');
});
