import { createRelaySession, type RelayDelivery, type RelaySession } from './relay-contract.js';
import type { TransportDeliveryStore } from './sqlite-transport-delivery-store.js';

export const TRANSPORT_REPLAY_CONFORMANCE_SCHEMA = 'zj-loop.transport_replay_conformance.v1' as const;

export type TransportReplayConformance = {
  schema: typeof TRANSPORT_REPLAY_CONFORMANCE_SCHEMA;
  scenario_id: string;
  status: 'passed' | 'blocked';
  assertions: Array<{ name: string; status: 'passed' | 'blocked'; reason?: string }>;
  final_session: RelaySession;
  final_deliveries: RelayDelivery[];
  side_effects_executed: false;
};

function requireText(value: string, error: string): void {
  if (!value.trim()) throw new Error(error);
}

export async function runTransportReplayConformance(input: { store: TransportDeliveryStore; network_id: string; scenario_id: string }): Promise<TransportReplayConformance> {
  requireText(input.network_id, 'transport-replay-network-id-required');
  requireText(input.scenario_id, 'transport-replay-scenario-id-required');
  const assertions: TransportReplayConformance['assertions'] = [];
  const session = createRelaySession({ session_id: `${input.scenario_id}-session`, network_id: input.network_id, node_id: `${input.scenario_id}-node`, credential_id: `${input.scenario_id}-credential`, protocol_version: 'transport.v1', created_at: '2026-08-01T12:00:00.000Z', credential_expires_at: '2026-08-01T13:00:00.000Z', max_ttl_ms: 15 * 60 * 1000 });
  const delivery = (id: string): RelayDelivery => ({ delivery_id: `${input.scenario_id}-${id}`, attempt_id: '', network_id: input.network_id, event_id: `${input.scenario_id}-${id}-event`, task_id: `${input.scenario_id}-${id}-task`, target_node_id: session.node_id, state: 'offered', retry_count: 0 });
  const first = delivery('first');
  const second = delivery('second');
  const record = (name: string, condition: boolean, reason?: string) => assertions.push({ name, status: condition ? 'passed' : 'blocked', ...(condition || !reason ? {} : { reason }) });
  record('session-recorded', (await input.store.openSession({ session })).status === 'recorded');
  record('first-delivery-recorded', (await input.store.offerDelivery({ delivery: first })).status === 'recorded');
  record('second-delivery-recorded', (await input.store.offerDelivery({ delivery: second })).status === 'recorded');
  record('disconnect-retry-scheduled', (await input.store.startLease({ network_id: input.network_id, delivery_id: first.delivery_id, attempt_id: 'attempt-1', now: '2026-08-01T12:01:00.000Z', lease_ms: 1_000 })).status === 'recorded' && (await input.store.scheduleRetry({ network_id: input.network_id, delivery_id: first.delivery_id, now: '2026-08-01T12:02:00.000Z', max_retries: 2, reason: 'connection-lost' })).delivery?.state === 'retry_scheduled');
  record('reconnect-reoffers', (await input.store.reoffer({ network_id: input.network_id, delivery_id: first.delivery_id })).delivery?.state === 'offered');
  record('reconnect-starts-new-attempt', (await input.store.startLease({ network_id: input.network_id, delivery_id: first.delivery_id, attempt_id: 'attempt-2', now: '2026-08-01T12:03:00.000Z', lease_ms: 30_000 })).delivery?.attempt_id === 'attempt-2');
  record('out-of-order-second-accepted', (await input.store.startLease({ network_id: input.network_id, delivery_id: second.delivery_id, attempt_id: 'attempt-1', now: '2026-08-01T12:03:01.000Z', lease_ms: 30_000 })).status === 'recorded' && (await input.store.accept({ network_id: input.network_id, delivery_id: second.delivery_id, attempt_id: 'attempt-1' })).delivery?.state === 'accepted');
  record('out-of-order-first-accepted', (await input.store.accept({ network_id: input.network_id, delivery_id: first.delivery_id, attempt_id: 'attempt-2' })).delivery?.state === 'accepted');
  record('duplicate-delivery-is-idempotent', (await input.store.offerDelivery({ delivery: second })).status === 'duplicate');
  record('second-final-ack', (await input.store.acknowledge({ network_id: input.network_id, delivery_id: second.delivery_id, attempt_id: 'attempt-1', now: '2026-08-01T12:03:02.000Z' })).delivery?.state === 'acknowledged');
  record('first-final-ack', (await input.store.acknowledge({ network_id: input.network_id, delivery_id: first.delivery_id, attempt_id: 'attempt-2', now: '2026-08-01T12:03:03.000Z' })).delivery?.state === 'acknowledged');
  const finalSession = await input.store.getSession({ network_id: input.network_id, session_id: session.session_id });
  const finalFirst = await input.store.getDelivery({ network_id: input.network_id, delivery_id: first.delivery_id });
  const finalSecond = await input.store.getDelivery({ network_id: input.network_id, delivery_id: second.delivery_id });
  const complete = assertions.every((assertion) => assertion.status === 'passed') && finalSession !== null && finalFirst?.state === 'acknowledged' && finalSecond?.state === 'acknowledged';
  return { schema: TRANSPORT_REPLAY_CONFORMANCE_SCHEMA, scenario_id: input.scenario_id, status: complete ? 'passed' : 'blocked', assertions, final_session: finalSession ?? session, final_deliveries: [finalFirst, finalSecond].filter((value): value is RelayDelivery => value !== null), side_effects_executed: false };
}
