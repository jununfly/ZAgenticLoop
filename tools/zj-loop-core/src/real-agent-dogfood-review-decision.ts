import canonicalize from 'canonicalize';
import { createHash, randomUUID } from 'node:crypto';
import { verifyHumanSignature, type HumanSigner, type HumanSignerIdentity, type HumanSignature } from './human-signer.js';
import { validateRealAgentDogfoodReviewPackage, type RealAgentDogfoodReviewPackage } from './real-agent-dogfood-review-package.js';
import { appendRealAgentDogfoodEvent, createRealAgentDogfoodTransition, type RealAgentDogfoodLifecycle, type RealAgentDogfoodEvent } from './real-agent-dogfood-lifecycle.js';
import type { SqliteStateStore } from './sqlite-state-store.js';

export const REAL_AGENT_DOGFOOD_REVIEW_DECISION_SCHEMA = 'zj-loop.real_agent_dogfood_review_decision.v1' as const;
export type RealAgentDogfoodReviewDecision = { schema: typeof REAL_AGENT_DOGFOOD_REVIEW_DECISION_SCHEMA; package_digest: string; lifecycle_revision: number; human_id: string; signer_fingerprint: string; decision: 'accept' | 'reject' | 'request-revision'; comment: string; decided_at: string; canonical_payload_digest: string; signature: HumanSignature; side_effects_executed: false };
type DecisionPayload = Omit<RealAgentDogfoodReviewDecision, 'canonical_payload_digest' | 'signature' | 'side_effects_executed'>;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

function payloadDigest(payload: DecisionPayload): string { const json = canonicalize(payload); if (typeof json !== 'string') throw new Error('real-agent-dogfood-review-decision-canonicalization-invalid'); return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`; }
function payloadBytes(payload: DecisionPayload): Uint8Array { const json = canonicalize(payload); if (typeof json !== 'string') throw new Error('real-agent-dogfood-review-decision-canonicalization-invalid'); return new TextEncoder().encode(json); }
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }

function decisionPayload(value: RealAgentDogfoodReviewDecision): DecisionPayload {
  return { schema: value.schema, package_digest: value.package_digest, lifecycle_revision: value.lifecycle_revision, human_id: value.human_id, signer_fingerprint: value.signer_fingerprint, decision: value.decision, comment: value.comment, decided_at: value.decided_at };
}

export async function createRealAgentDogfoodReviewDecision(input: { signer: HumanSigner; review_package: RealAgentDogfoodReviewPackage; decision: RealAgentDogfoodReviewDecision['decision']; comment: string; decided_at: string }): Promise<RealAgentDogfoodReviewDecision> {
  if (validateRealAgentDogfoodReviewPackage(input.review_package).status !== 'valid' || input.review_package.available_decisions.includes(input.decision) === false) throw new Error('real-agent-dogfood-review-package-not-decisionable');
  if (!input.signer || typeof input.signer.sign !== 'function' || typeof input.signer.getPublicIdentity !== 'function') throw new Error('real-agent-dogfood-review-signer-required');
  if (!text(input.comment) || !Number.isFinite(Date.parse(input.decided_at))) throw new Error('real-agent-dogfood-review-decision-input-invalid');
  const identity = await input.signer.getPublicIdentity();
  if (identity.schema !== 'zj-loop.human_signer.v1' || identity.algorithm !== 'ECDSA-P256' || !text(identity.human_id) || !/^[0-9a-f]{64}$/.test(identity.public_key_fingerprint)) throw new Error('real-agent-dogfood-review-identity-invalid');
  const payload: DecisionPayload = { schema: REAL_AGENT_DOGFOOD_REVIEW_DECISION_SCHEMA, package_digest: input.review_package.package_digest, lifecycle_revision: input.review_package.lifecycle_revision, human_id: identity.human_id, signer_fingerprint: identity.public_key_fingerprint, decision: input.decision, comment: input.comment, decided_at: input.decided_at };
  const signature = await input.signer.sign({ payload: payloadBytes(payload) });
  return { ...payload, canonical_payload_digest: payloadDigest(payload), signature, side_effects_executed: false };
}

export function validateRealAgentDogfoodReviewDecision(input: { decision: RealAgentDogfoodReviewDecision; identity: HumanSignerIdentity; review_package: RealAgentDogfoodReviewPackage }): { status: 'valid' | 'blocked'; errors: string[] } {
  const value = input.decision;
  const errors: string[] = [];
  if (value.schema !== REAL_AGENT_DOGFOOD_REVIEW_DECISION_SCHEMA || !['accept', 'reject', 'request-revision'].includes(value.decision)) errors.push('schema-or-decision-invalid');
  if (!DIGEST.test(value.package_digest) || !DIGEST.test(value.canonical_payload_digest)) errors.push('digest-invalid');
  if (!Number.isInteger(value.lifecycle_revision) || value.lifecycle_revision < 1 || !text(value.human_id) || !/^[0-9a-f]{64}$/.test(value.signer_fingerprint) || !text(value.comment) || !Number.isFinite(Date.parse(value.decided_at))) errors.push('binding-invalid');
  if (value.side_effects_executed !== false) errors.push('safety-boundary-invalid');
  if (value.package_digest !== input.review_package.package_digest || value.lifecycle_revision !== input.review_package.lifecycle_revision) errors.push('review-package-binding-mismatch');
  if (input.identity.human_id !== value.human_id || input.identity.public_key_fingerprint !== value.signer_fingerprint) errors.push('human-identity-mismatch');
  if (!value.signature || value.signature.public_key_fingerprint !== value.signer_fingerprint) errors.push('signature-binding-mismatch');
  if (value.canonical_payload_digest !== payloadDigest(decisionPayload(value))) errors.push('canonical-payload-digest-invalid');
  if (errors.length === 0 && !verifyHumanSignature({ identity: input.identity, payload: payloadBytes(decisionPayload(value)), signature: value.signature })) errors.push('human-signature-invalid');
  return { status: errors.length === 0 ? 'valid' : 'blocked', errors };
}

export async function recordRealAgentDogfoodReviewDecision(input: { stateStore: SqliteStateStore; lifecycle: RealAgentDogfoodLifecycle; review_package: RealAgentDogfoodReviewPackage; decision: RealAgentDogfoodReviewDecision; identity: HumanSignerIdentity; expected_revision: number; now?: string }): Promise<{ status: 'accepted' | 'rejected' | 'request-revision'; revision: number; event: RealAgentDogfoodEvent }> {
  const validation = validateRealAgentDogfoodReviewDecision({ decision: input.decision, identity: input.identity, review_package: input.review_package });
  if (validation.status === 'blocked') throw new Error(`real-agent-dogfood-review-decision-invalid:${validation.errors.join(',')}`);
  if (input.lifecycle.status !== 'review-pending' || input.lifecycle.lifecycle_digest !== input.review_package.lifecycle_digest) throw new Error('real-agent-dogfood-review-lifecycle-drift');
  const now = input.now ?? new Date().toISOString();
  const target = input.decision.decision === 'accept' ? 'accepted' as const : input.decision.decision === 'reject' ? 'rejected' as const : 'request-revision' as const;
  const first = createRealAgentDogfoodTransition({ lifecycle: input.lifecycle, to: target, event_id: `${input.lifecycle.dogfood_id}:attempt-${input.lifecycle.attempt}:human-review:${input.decision.decision}`, occurred_at: now, fact_digest: input.decision.canonical_payload_digest, reason_code: input.decision.decision === 'accept' ? undefined : `human-${input.decision.decision}`, next_action: input.decision.decision === 'accept' ? 'closeout' : input.decision.decision === 'reject' ? 'closeout' : 'create-new-attempt' });
  const firstResult = await appendRealAgentDogfoodEvent({ stateStore: input.stateStore, expected_revision: input.expected_revision, event: first.event });
  if (firstResult.status === 'conflict' || firstResult.revision === undefined) throw new Error('real-agent-dogfood-review-revision-conflict');
  if (target !== 'request-revision') return { status: target, revision: firstResult.revision, event: first.event };
  const second = createRealAgentDogfoodTransition({ lifecycle: first.lifecycle, to: 'draft', event_id: `${input.lifecycle.dogfood_id}:attempt-${input.lifecycle.attempt + 1}:draft`, occurred_at: now, fact_digest: input.decision.canonical_payload_digest, next_action: 'prepare-preflight', attempt: input.lifecycle.attempt + 1, execution_id: `execution-${randomUUID()}` });
  const secondResult = await appendRealAgentDogfoodEvent({ stateStore: input.stateStore, expected_revision: firstResult.revision, event: second.event });
  if (secondResult.status === 'conflict' || secondResult.revision === undefined) throw new Error('real-agent-dogfood-review-new-draft-conflict');
  return { status: 'request-revision', revision: secondResult.revision, event: second.event };
}
