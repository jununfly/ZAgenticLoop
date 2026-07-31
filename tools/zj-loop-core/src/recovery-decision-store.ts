import { createRecoveryDecision, type RecoveryDecision } from './recovery-decision.js';
import type { SqliteStateStore } from './sqlite-state-store.js';

export type PersistedRecoveryDecisionResult = {
  schema: 'zj-loop.recovery_decision.v1';
  status: 'accepted' | 'duplicate' | 'conflict' | 'stale-decision';
  lifecycle_status: 'recovery-decision-recorded';
  decision?: RecoveryDecision;
  current_decision?: RecoveryDecision;
  side_effects_executed: false;
  state_revision?: number;
  current_revision: number;
};

function result(input: Omit<PersistedRecoveryDecisionResult, 'schema' | 'lifecycle_status' | 'side_effects_executed'>): PersistedRecoveryDecisionResult {
  return { schema: 'zj-loop.recovery_decision.v1', lifecycle_status: 'recovery-decision-recorded', side_effects_executed: false, ...input };
}

function eventId(decision: RecoveryDecision): string {
  return `recovery-decision:${decision.parent_execution_id}:${decision.decision_digest}`;
}

function payloadDecision(payload: unknown): RecoveryDecision | null {
  if (!payload || typeof payload !== 'object' || !('decision' in payload)) return null;
  return structuredClone((payload as { decision: RecoveryDecision }).decision);
}

export async function persistRecoveryDecision(input: {
  stateStore: SqliteStateStore;
  network_id: string;
  expected_revision: number;
  decision: RecoveryDecision;
  now: string;
}): Promise<PersistedRecoveryDecisionResult> {
  const decision = createRecoveryDecision(input.decision);
  const outcome = await input.stateStore.runAtomic((transaction) => {
    const row = transaction.database.prepare(
      "SELECT payload_json FROM state_events WHERE network_id = ? AND aggregate_type = 'recovery-decision' AND aggregate_id = ? AND event_type = 'recovery.decision-recorded' ORDER BY revision LIMIT 1",
    ).get(input.network_id, decision.parent_execution_id) as { payload_json: string } | undefined;
    if (row) {
      const current = payloadDecision(JSON.parse(row.payload_json));
      if (current?.decision_digest === decision.decision_digest) return { status: 'duplicate' as const, current_decision: current, current_revision: input.expected_revision };
      return { status: 'conflict' as const, current_decision: current ?? undefined, current_revision: input.expected_revision };
    }
    const appended = transaction.appendEvent({
      network_id: input.network_id,
      expected_revision: input.expected_revision,
      now: input.now,
      event: {
        event_id: eventId(decision),
        aggregate_type: 'recovery-decision',
        aggregate_id: decision.parent_execution_id,
        event_type: 'recovery.decision-recorded',
        occurred_at: input.now,
        payload: { schema: 'zj-loop.recovery_decision.v1', decision },
      },
    });
    if (appended.status !== 'recorded') return { status: 'conflict' as const, current_revision: appended.current_revision };
    return { status: 'accepted' as const, decision, state_revision: appended.revision, current_revision: appended.current_revision };
  });
  return result(outcome);
}
