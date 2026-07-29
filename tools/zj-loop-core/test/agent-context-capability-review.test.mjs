import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAgentContextCapabilityReview,
  parseAgentContextCapabilityReview,
  validateAgentContextCapabilityReview,
} from '../dist/agent-context-capability-review.js';

const validReview = {
  schema: 'zj-loop.agent_context_capability_review.v1',
  report_metadata: {
    generated_at: '2026-07-29T00:00:00.000Z',
    generator: 'agent-local-review',
    workspace_commit: 'a'.repeat(40),
  },
  target: {
    path: 'tools/zj-loop-core/src/agent-context.ts',
    scope: 'context reconstruction and activation reference validation',
    commit: 'a'.repeat(40),
  },
  goal: 'Review the bounded context reconstruction capability.',
  capability_status: 'implemented',
  observed_flow: ['Read pinned state records.', 'Reconstruct a stable context snapshot.'],
  contracts_and_invariants: ['State head must remain stable.', 'Missing activation refs fail closed.'],
  facts: ['The module exposes reconstructAgentContext.'],
  inferences: ['The implementation is suitable for a bounded read-only review.'],
  unverified: ['Live provider parity outside the existing GitLab path.'],
  evidence_refs: {
    context_tests: {
      path: 'tools/zj-loop-core/test/agent-context.test.mjs',
      hash: 'd'.repeat(64),
      command: 'npm run test:agent-local',
      description: 'Deterministic context reconstruction tests.',
      classification: 'fact',
    },
  },
  failure_or_blocked_cases: [{
    code: 'activation-ref-missing',
    status: 'blocked',
    condition: 'Activation snapshot ref is absent.',
    observed_behavior: 'Context reconstruction returns blocked.',
    evidence_refs: ['context_tests'],
  }],
  risks_and_unknowns: ['This report does not prove a provider-neutral StateStore.'],
  verification_results: [{
    command: 'npm run test:agent-local',
    status: 'passed',
    summary: 'Agent-local and context tests passed.',
    evidence_refs: ['context_tests'],
  }],
  verification_manifest: [{
    command: 'npm run test:agent-local',
    status: 'passed',
    exit_code: 0,
    output_sha256: 'c'.repeat(64),
    output_path: 'docs/testing/artifacts/agent-local-gate.txt',
    captured_at: '2026-07-29T00:00:00.000Z',
  }],
  recommended_next_action: ['Human review of the bounded capability report.'],
  review_handoff: {
    status: 'needs-human-review',
    summary: 'Review the bounded context reconstruction capability.',
    risks: ['Provider-neutral StateStore remains unimplemented.'],
    decisions_needed: ['Accept or request revision of the report.'],
  },
  human_decision: {
    status: 'pending',
    decided_by: null,
    decided_at: null,
    rationale: null,
  },
};

test('parses a complete capability review', () => {
  const result = parseAgentContextCapabilityReview(validReview);
  assert.equal(result.schema, 'zj-loop.agent_context_capability_review.v1');
  assert.equal(result.human_decision.status, 'pending');
});

test('builds a publishable capability review through the public builder', () => {
  const { schema: _schema, ...input } = validReview;
  const result = buildAgentContextCapabilityReview(input);
  assert.equal(result.schema, 'zj-loop.agent_context_capability_review.v1');
  assert.equal(result.target.path, validReview.target.path);
});

test('rejects a review with an invalid target commit', () => {
  const result = validateAgentContextCapabilityReview({
    ...validReview,
    target: { ...validReview.target, commit: 'not-a-commit' },
  });
  assert.equal(result.success, false);
});

test('rejects evidence that does not classify facts and uncertainty', () => {
  const result = validateAgentContextCapabilityReview({
    ...validReview,
    evidence_refs: {
      context_tests: { ...validReview.evidence_refs.context_tests, classification: 'unknown' },
    },
  });
  assert.equal(result.success, false);
});

test('requires report metadata and a verification manifest', () => {
  const result = validateAgentContextCapabilityReview({
    ...validReview,
    report_metadata: {
      generated_at: '2026-07-29T00:00:00.000Z',
      generator: 'agent-local-review',
      workspace_commit: 'a'.repeat(40),
    },
    verification_manifest: [{
      command: 'npm run test:agent-local',
      status: 'passed',
      exit_code: 0,
      output_sha256: 'c'.repeat(64),
      output_path: 'docs/testing/artifacts/agent-local-gate.txt',
      captured_at: '2026-07-29T00:00:00.000Z',
    }],
  });
  assert.equal(result.success, true);

  const { verification_manifest: _verificationManifest, ...withoutManifest } = validReview;
  const missingManifest = withoutManifest;
  assert.equal(validateAgentContextCapabilityReview(missingManifest).success, false);
});

test('rejects semantically inconsistent reports', () => {
  const inconsistent = {
    ...validReview,
    report_metadata: { ...validReview.report_metadata, workspace_commit: 'e'.repeat(40) },
  };
  assert.equal(validateAgentContextCapabilityReview(inconsistent).success, false);

  const badManifest = {
    ...validReview,
    verification_manifest: [{
      ...validReview.verification_manifest[0],
      status: 'passed',
      exit_code: 1,
    }],
  };
  assert.equal(validateAgentContextCapabilityReview(badManifest).success, false);

  const danglingEvidence = {
    ...validReview,
    verification_results: [{ ...validReview.verification_results[0], evidence_refs: ['missing'] }],
  };
  assert.equal(validateAgentContextCapabilityReview(danglingEvidence).success, false);

  const duplicateCommands = {
    ...validReview,
    verification_manifest: [validReview.verification_manifest[0], { ...validReview.verification_manifest[0] }],
  };
  assert.equal(validateAgentContextCapabilityReview(duplicateCommands).success, false);
});
