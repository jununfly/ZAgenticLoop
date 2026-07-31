import { validateProviderOutcome, type ProviderOutcome } from './provider-outcome.js';

export const PROVIDER_OUTCOME_LIFECYCLE_SCHEMA = 'zj-loop.provider_outcome_lifecycle.v1' as const;
export type ProviderOutcomeLifecycleStatus = 'verification-required' | 'recovery-required' | 'needs-human-grill' | 'blocked';
export type ProviderOutcomeLifecycleResult = {
  schema: typeof PROVIDER_OUTCOME_LIFECYCLE_SCHEMA;
  status: ProviderOutcomeLifecycleStatus | 'blocked-input';
  outcome_digest: string;
  task_completed: false;
  resources_frozen: boolean;
  next_action: 'independent-verification' | 'create-recovery-decision' | 'submit-human-grill' | 'bounded-reconciliation-or-human-grill';
  side_effects_executed: false;
  reason?: string;
};

export function mapProviderOutcomeLifecycle(outcome: ProviderOutcome): ProviderOutcomeLifecycleResult {
  const validation = validateProviderOutcome(outcome);
  if (validation.status === 'blocked') return { schema: PROVIDER_OUTCOME_LIFECYCLE_SCHEMA, status: 'blocked-input', outcome_digest: validation.outcome_digest, task_completed: false, resources_frozen: true, next_action: 'bounded-reconciliation-or-human-grill', side_effects_executed: false, reason: 'provider-outcome-invalid' };
  if (outcome.outcome === 'confirmed-success') return { schema: PROVIDER_OUTCOME_LIFECYCLE_SCHEMA, status: 'verification-required', outcome_digest: outcome.outcome_digest, task_completed: false, resources_frozen: false, next_action: 'independent-verification', side_effects_executed: false };
  if (outcome.outcome === 'confirmed-failure-no-side-effect') return { schema: PROVIDER_OUTCOME_LIFECYCLE_SCHEMA, status: 'recovery-required', outcome_digest: outcome.outcome_digest, task_completed: false, resources_frozen: false, next_action: 'create-recovery-decision', side_effects_executed: false };
  if (outcome.outcome === 'partial-success') return { schema: PROVIDER_OUTCOME_LIFECYCLE_SCHEMA, status: 'needs-human-grill', outcome_digest: outcome.outcome_digest, task_completed: false, resources_frozen: true, next_action: 'submit-human-grill', side_effects_executed: false };
  return { schema: PROVIDER_OUTCOME_LIFECYCLE_SCHEMA, status: 'blocked', outcome_digest: outcome.outcome_digest, task_completed: false, resources_frozen: true, next_action: 'bounded-reconciliation-or-human-grill', side_effects_executed: false };
}
