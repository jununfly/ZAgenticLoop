import { validateHumanAcceptance, type HumanAcceptanceRecord } from './human-acceptance.js';
import type { HumanSignerIdentity } from './human-signer.js';
import type { ReviewHandoffRecord } from './review-handoff.js';
import type { SqliteStateStore } from './sqlite-state-store.js';

export const HUMAN_ACCEPTANCE_RECORDED_SCHEMA = 'zj-loop.human_acceptance_recorded.v1' as const;

export type HumanAcceptanceFactResult = {
  schema: typeof HUMAN_ACCEPTANCE_RECORDED_SCHEMA;
  status: 'recorded' | 'duplicate' | 'conflict' | 'blocked';
  event_id: string;
  side_effects_executed: false;
  revision?: number;
  current_revision?: number;
  reason?: string;
};

function eventId(acceptance: HumanAcceptanceRecord): string {
  return `human-acceptance-recorded:${acceptance.event_id}:${acceptance.canonical_payload_digest}`;
}

export async function recordHumanAcceptance(input: {
  stateStore: SqliteStateStore;
  expected_revision: number;
  acceptance: HumanAcceptanceRecord;
  identity: HumanSignerIdentity;
  handoff: ReviewHandoffRecord;
  now: string;
}): Promise<HumanAcceptanceFactResult> {
  const acceptance = input.acceptance;
  const event_id = eventId(acceptance);
  const validation = validateHumanAcceptance({ acceptance, identity: input.identity, handoff: input.handoff, now: input.now });
  if (validation.status === 'blocked') return { schema: HUMAN_ACCEPTANCE_RECORDED_SCHEMA, status: 'blocked', event_id, side_effects_executed: false, reason: validation.errors.join(',') || 'human-acceptance-invalid' };

  const result = await input.stateStore.runAtomic((transaction) => {
    const existing = transaction.database.prepare(
      "SELECT event_id, payload_json FROM state_events WHERE network_id = ? AND aggregate_type = 'human-acceptance' AND aggregate_id = ? AND event_type = 'human-acceptance.accepted' ORDER BY revision LIMIT 1",
    ).get(acceptance.network_id, acceptance.event_id) as { event_id: string; payload_json: string } | undefined;
    if (existing) {
      const payload = JSON.parse(existing.payload_json) as { acceptance?: { canonical_payload_digest?: string } };
      return payload.acceptance?.canonical_payload_digest === acceptance.canonical_payload_digest && existing.event_id === event_id
        ? { status: 'duplicate' as const, event_id: existing.event_id, current_revision: input.expected_revision }
        : { status: 'conflict' as const, event_id, current_revision: input.expected_revision, reason: 'human-acceptance-event-already-accepted' };
    }
    const appended = transaction.appendEvent({
      network_id: acceptance.network_id,
      expected_revision: input.expected_revision,
      now: input.now,
      event: {
        event_id,
        aggregate_type: 'human-acceptance',
        aggregate_id: acceptance.event_id,
        event_type: 'human-acceptance.accepted',
        occurred_at: acceptance.accepted_at,
        payload: { schema: HUMAN_ACCEPTANCE_RECORDED_SCHEMA, acceptance },
      },
    });
    return appended.status === 'recorded'
      ? { status: 'recorded' as const, event_id, revision: appended.revision, current_revision: appended.current_revision }
      : { status: appended.status === 'duplicate' ? 'duplicate' as const : 'conflict' as const, event_id, current_revision: appended.current_revision, reason: appended.reason };
  });
  return { schema: HUMAN_ACCEPTANCE_RECORDED_SCHEMA, ...result, side_effects_executed: false };
}
