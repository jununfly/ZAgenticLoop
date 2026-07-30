import { getCapabilityRiskDescriptor } from './protocol-registry.js';
import { validateDispatchIntent, type DispatchIntent } from './dispatch-intent.js';

export const DISPATCH_GATE_SCHEMA = 'zj-loop.dispatch_gate.v1' as const;
export type DispatchGateError = { code: string; path: string; message: string; blocking: true };
export type DispatchGateResult = { schema: typeof DISPATCH_GATE_SCHEMA; status: 'dispatch-ready' | 'blocked'; side_effects_executed: false; intent_digest: string; errors: DispatchGateError[] };

function error(code: string, path: string, message: string): DispatchGateError { return { code, path, message, blocking: true }; }

export function evaluateDispatchGate(input: {
  intent: DispatchIntent;
  claim: { status: 'claimed'; plan_digest: string; plan_revision: number; task_id: string; node_id: string };
  revalidation: { status: 'passed'; plan_digest: string; plan_revision: number };
  verification?: { status: 'verified'; plan_digest: string; plan_revision: number; review_handoff_status: 'accepted' };
  human_approval?: { status: 'accepted'; plan_digest: string; plan_revision: number };
}): DispatchGateResult {
  const errors: DispatchGateError[] = [];
  const validation = validateDispatchIntent(input.intent);
  errors.push(...validation.errors.map((item) => ({ ...item, message: item.message })));
  const intent = input.intent;
  if (input.claim.status !== 'claimed' || input.claim.plan_digest !== intent.plan_digest || input.claim.plan_revision !== intent.plan_revision || input.claim.task_id !== intent.task_id || input.claim.node_id !== intent.node_id) errors.push(error('claim-binding-invalid', '$.claim', 'claim does not match DispatchIntent'));
  if (input.revalidation.status !== 'passed' || input.revalidation.plan_digest !== intent.plan_digest || input.revalidation.plan_revision !== intent.plan_revision) errors.push(error('runtime-revalidation-invalid', '$.revalidation', 'Runtime revalidation does not match DispatchIntent'));
  for (const capability of intent.capabilities) {
    const risk = getCapabilityRiskDescriptor(capability);
    if (!risk) { errors.push(error('capability-risk-unknown', '$.intent.capabilities', `capability ${capability} has no Risk Registry descriptor`)); continue; }
    if (risk.risk_level === 'review-required' && (!input.verification || input.verification.status !== 'verified' || input.verification.plan_digest !== intent.plan_digest || input.verification.plan_revision !== intent.plan_revision || input.verification.review_handoff_status !== 'accepted')) errors.push(error('verification-required', '$.verification', `capability ${capability} requires accepted Verification and Review Handoff`));
    if (risk.risk_level === 'human-approval-required' && (!input.human_approval || input.human_approval.status !== 'accepted' || input.human_approval.plan_digest !== intent.plan_digest || input.human_approval.plan_revision !== intent.plan_revision)) errors.push(error('human-approval-required', '$.human_approval', `capability ${capability} requires matching Human Approval`));
  }
  errors.sort((left, right) => `${left.path}:${left.code}`.localeCompare(`${right.path}:${right.code}`));
  return { schema: DISPATCH_GATE_SCHEMA, status: errors.length === 0 ? 'dispatch-ready' : 'blocked', side_effects_executed: false, intent_digest: intent.intent_digest, errors };
}
