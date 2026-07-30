import type { HumanGrill, HumanGrillDecision, HumanGrillDecisionInput } from './human-grill.js';
import { createHumanGrill, createHumanGrillCoordinator } from './human-grill.js';
import type { SqliteStateStore } from './sqlite-state-store.js';

export type PersistedHumanGrillDecisionResult = {
  schema: 'zj-loop.human_grill_decision.v1';
  status: 'accepted' | 'duplicate' | 'conflict' | 'stale-decision';
  lifecycle_status: 'decision-recorded';
  decision?: HumanGrillDecision;
  current_decision?: HumanGrillDecision;
  side_effects_executed: false;
  state_revision?: number;
  current_revision: number;
};

function eventId(grill: HumanGrill, decision: HumanGrillDecision): string {
  return `human-grill-decision:${grill.grill_id}:${decision.decision_digest}`;
}

function result(input: Omit<PersistedHumanGrillDecisionResult, 'schema' | 'lifecycle_status' | 'side_effects_executed'>): PersistedHumanGrillDecisionResult {
  return { schema: 'zj-loop.human_grill_decision.v1', lifecycle_status: 'decision-recorded', side_effects_executed: false, ...input };
}

function readDecision(payload: unknown): HumanGrillDecision | null {
  if (!payload || typeof payload !== 'object' || !('decision' in payload)) return null;
  return structuredClone((payload as { decision: HumanGrillDecision }).decision);
}

export async function persistHumanGrillDecision(input: {
  stateStore: SqliteStateStore;
  network_id: string;
  expected_revision: number;
  grill: HumanGrill;
  decision: HumanGrillDecisionInput;
  now: string;
}): Promise<PersistedHumanGrillDecisionResult> {
  const grill = createHumanGrill(input.grill);
  const coordinator = createHumanGrillCoordinator({ grill });
  const normalized = coordinator.submitDecision(input.decision);
  if (normalized.status === 'stale-decision') return result({ status: normalized.status, current_revision: input.expected_revision });
  const decision = normalized.decision ?? normalized.current_decision;
  if (!decision) throw new Error('human-grill-decision-missing');
  const id = eventId(grill, decision);
  const outcome = await input.stateStore.runAtomic((transaction) => {
    const rows = transaction.database.prepare(
      "SELECT payload_json FROM state_events WHERE network_id = ? AND aggregate_type = 'human-grill' AND aggregate_id = ? AND event_type = 'human-grill.decision-recorded' ORDER BY revision LIMIT 1",
    ).get(input.network_id, grill.grill_id) as { payload_json: string } | undefined;
    if (rows) {
      const current = readDecision(JSON.parse(rows.payload_json));
      if (current?.decision_digest === decision.decision_digest) return { status: 'duplicate' as const, current_decision: current, current_revision: input.expected_revision };
      return { status: 'conflict' as const, current_decision: current ?? undefined, current_revision: input.expected_revision };
    }
    const appended = transaction.appendEvent({
      network_id: input.network_id,
      expected_revision: input.expected_revision,
      now: input.now,
      event: {
        event_id: id,
        aggregate_type: 'human-grill',
        aggregate_id: grill.grill_id,
        event_type: 'human-grill.decision-recorded',
        occurred_at: input.now,
        payload: { schema: 'zj-loop.human_grill_decision.v1', grill, decision },
      },
    });
    if (appended.status !== 'recorded') return { status: 'conflict' as const, current_revision: appended.current_revision };
    return { status: 'accepted' as const, decision, state_revision: appended.revision, current_revision: appended.current_revision };
  });
  return result(outcome);
}
