import { providerOutcomeDigest, validateProviderOutcome, type ProviderOutcome } from './provider-outcome.js';
import type { SqliteStateStore } from './sqlite-state-store.js';

export const PROVIDER_OUTCOME_RECORDED_SCHEMA = 'zj-loop.provider_outcome_recorded.v1' as const;
export type ProviderOutcomeFactResult = { schema: typeof PROVIDER_OUTCOME_RECORDED_SCHEMA; status: 'recorded' | 'duplicate' | 'conflict' | 'blocked'; event_id: string; side_effects_executed: false; revision?: number; current_revision?: number; reason?: string };

function aggregateId(outcome: ProviderOutcome): string { return [outcome.network_id, outcome.event_id, outcome.plan_id, outcome.plan_revision, outcome.execution_id, outcome.task_id, outcome.provider_request_id].join(':'); }
function eventId(outcome: ProviderOutcome): string { return `provider-outcome-recorded:${aggregateId(outcome)}:${providerOutcomeDigest(outcome)}`; }

export async function recordProviderOutcome(input: { stateStore: SqliteStateStore; expected_revision: number; outcome: ProviderOutcome; now: string }): Promise<ProviderOutcomeFactResult> {
  const outcome = input.outcome;
  const event_id = eventId(outcome);
  const validation = validateProviderOutcome(outcome);
  if (validation.status === 'blocked') return { schema: PROVIDER_OUTCOME_RECORDED_SCHEMA, status: 'blocked', event_id, side_effects_executed: false, reason: 'provider-outcome-invalid' };
  const aggregate_id = aggregateId(outcome);
  const result = await input.stateStore.runAtomic((transaction) => {
    const rows = transaction.database.prepare("SELECT event_id, payload_json FROM state_events WHERE network_id = ? AND aggregate_type = 'provider-execution' AND aggregate_id = ? AND event_type = 'provider.outcome.recorded'").all(outcome.network_id, aggregate_id) as Array<{ event_id: string; payload_json: string }>;
    if (rows.length > 0) {
      const existing = JSON.parse(rows[0].payload_json) as { outcome?: { outcome_digest?: string } };
      return existing.outcome?.outcome_digest === outcome.outcome_digest && rows[0].event_id === event_id
        ? { status: 'duplicate' as const, event_id: rows[0].event_id, current_revision: input.expected_revision }
        : { status: 'conflict' as const, event_id, current_revision: input.expected_revision, reason: 'provider-request-outcome-conflict' };
    }
    const appended = transaction.appendEvent({ network_id: outcome.network_id, expected_revision: input.expected_revision, now: input.now, event: { event_id, aggregate_type: 'provider-execution', aggregate_id, event_type: 'provider.outcome.recorded', occurred_at: outcome.observed_at, payload: { schema: PROVIDER_OUTCOME_RECORDED_SCHEMA, outcome } } });
    return appended.status === 'recorded' ? { status: 'recorded' as const, event_id, revision: appended.revision, current_revision: appended.current_revision } : { status: appended.status === 'duplicate' ? 'duplicate' as const : 'conflict' as const, event_id, current_revision: appended.current_revision, reason: appended.reason };
  });
  return { schema: PROVIDER_OUTCOME_RECORDED_SCHEMA, ...result, side_effects_executed: false };
}
