import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
import { appendRealAgentDogfoodEvent, createRealAgentDogfoodTransition, type RealAgentDogfoodLifecycle } from './real-agent-dogfood-lifecycle.js';
import { createRealAgentDogfoodResultEnvelope, type RealAgentDogfoodResultEnvelope } from './real-agent-dogfood-report.js';
import type { SqliteStateStore } from './sqlite-state-store.js';

export const REAL_AGENT_DOGFOOD_SELF_AUDIT_SCHEMA = 'zj-loop.real_agent_dogfood_self_audit.v1' as const;

type SelfAuditProvider = { run(): Promise<RealAgentDogfoodResultEnvelope> };
type IndependentVerifier = { verify(input: { envelope: RealAgentDogfoodResultEnvelope; evidence_digest: string; verifier_id: string }): Promise<{ status: 'passed' | 'blocked'; reason_code?: string }> };
export type RealAgentDogfoodSelfAuditResult = { status: 'review-pending' | 'blocked' | 'outcome-uncertain'; evidence_digest: string | null; reason_code: string; next_action: string; revision: number };

export async function runRealAgentDogfoodSelfAudit(input: {
  stateStore: SqliteStateStore;
  evidenceStore: ContentAddressedEvidenceStore;
  lifecycle: RealAgentDogfoodLifecycle;
  provider_opt_in: boolean;
  provider: SelfAuditProvider;
  verifier_id: string;
  independent_verifier: IndependentVerifier;
  expected_revision: number;
  now?: string;
}): Promise<RealAgentDogfoodSelfAuditResult> {
  if (input.lifecycle.status !== 'verification-pending') throw new Error('real-agent-dogfood-self-audit-lifecycle-invalid');
  if (!input.provider_opt_in) throw new Error('real-agent-dogfood-provider-opt-in-required');
  if (!input.verifier_id.trim()) throw new Error('real-agent-dogfood-verifier-identity-required');
  let envelope: RealAgentDogfoodResultEnvelope;
  let evidenceDigest: string | null = null;
  let to: 'review-pending' | 'blocked' | 'outcome-uncertain' = 'outcome-uncertain';
  let reasonCode = 'provider-envelope-invalid';
  let nextAction = 'human-reconcile-execution';
  try {
    const candidate = await input.provider.run();
    envelope = createRealAgentDogfoodResultEnvelope(candidate);
    if (envelope.execution.execution_id !== input.lifecycle.execution_id || envelope.execution.attempt !== input.lifecycle.attempt) throw new Error('provider-envelope-execution-binding-invalid');
    const evidence = await input.evidenceStore.put({ content: JSON.stringify(envelope), kind: 'real-agent-dogfood-result-envelope' });
    evidenceDigest = evidence.digest;
    const verification = await input.independent_verifier.verify({ envelope, evidence_digest: evidence.digest, verifier_id: input.verifier_id });
    if (verification.status === 'passed') { to = 'review-pending'; reasonCode = 'independent-verification-passed'; nextAction = 'human-review'; }
    else { to = 'blocked'; reasonCode = verification.reason_code ?? 'independent-verification-blocked'; nextAction = 'human-review-provider-failure'; }
  } catch (error) {
    reasonCode = error instanceof Error && error.message === 'provider-envelope-execution-binding-invalid' ? error.message : 'provider-envelope-invalid';
  }
  const transition = createRealAgentDogfoodTransition({ lifecycle: input.lifecycle, to, event_id: `${input.lifecycle.dogfood_id}:attempt-${input.lifecycle.attempt}:self-audit:${to}`, occurred_at: input.now ?? new Date().toISOString(), fact_digest: evidenceDigest ?? undefined, reason_code: to === 'review-pending' ? undefined : reasonCode, next_action: nextAction });
  const appended = await appendRealAgentDogfoodEvent({ stateStore: input.stateStore, expected_revision: input.expected_revision, event: transition.event });
  if (appended.status === 'conflict') throw new Error('real-agent-dogfood-self-audit-revision-conflict');
  return { status: to, evidence_digest: evidenceDigest, reason_code: reasonCode, next_action: nextAction, revision: appended.revision as number };
}
