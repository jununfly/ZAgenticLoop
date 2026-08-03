import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  redactRealAgentDogfoodEvidence,
  createRealAgentDogfoodScopedEvidenceRef,
  createRealAgentDogfoodDigestOnlyReceipt,
} from '../dist/real-agent-dogfood-evidence-integrity.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;

test('redacts provider secrets deterministically with a versioned Core profile', () => {
  const input = 'Authorization: Bearer abc123\nPRIVATE-TOKEN=secret\nnormal output';
  const first = redactRealAgentDogfoodEvidence({ content: input, profile: 'provider-neutral-v1' });
  const second = redactRealAgentDogfoodEvidence({ content: input, profile: 'provider-neutral-v1' });
  assert.equal(first.profile, 'provider-neutral-v1');
  assert.equal(first.content, '[REDACTED]\n[REDACTED]\nnormal output');
  assert.deepEqual(first, second);
});

test('binds physical evidence to an execution-scoped logical reference', () => {
  const ref = createRealAgentDogfoodScopedEvidenceRef({ digest: digest('a'), kind: 'stdout', execution_id: 'execution-1', attempt: 2, provenance: 'provider:fixture' });
  assert.deepEqual(ref, { schema: 'zj-loop.real_agent_dogfood_scoped_evidence_ref.v1', digest: digest('a'), kind: 'stdout', execution_id: 'execution-1', attempt: 2, provenance: 'provider:fixture' });
  assert.throws(() => createRealAgentDogfoodScopedEvidenceRef({ ...ref, attempt: 0 }), /scoped-evidence-ref-invalid/);
});

test('creates a digest-only receipt without raw output or secrets', () => {
  const receipt = createRealAgentDogfoodDigestOnlyReceipt({
    network_id: 'network-1', dogfood_id: 'dogfood-1', execution_id: 'execution-1', attempt: 1,
    status: 'review-pending', input_commit: 'a'.repeat(40), manifest_digest: digest('b'),
    provider_proof_digest: digest('c'), verifier_fact_digest: digest('d'), review_package_digest: digest('e'),
    evidence_refs: [createRealAgentDogfoodScopedEvidenceRef({ digest: digest('f'), kind: 'stdout', execution_id: 'execution-1', attempt: 1, provenance: 'provider:fixture' })],
  });
  assert.equal(receipt.schema, 'zj-loop.real_agent_dogfood_digest_only_receipt.v1');
  assert.equal('stdout' in receipt, false);
  assert.equal(JSON.stringify(receipt).includes('secret'), false);
  assert.match(receipt.receipt_digest, /^sha256:[0-9a-f]{64}$/);
});
