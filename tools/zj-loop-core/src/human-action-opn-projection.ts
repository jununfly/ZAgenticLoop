import type { OpnArtifactStore } from './opn-artifact-store.js';
import type { SqliteStateStore, StateEvent } from './sqlite-state-store.js';
import type { TransportEnvelope } from './transport-contract.js';
import { verifyHumanActionDecision, type HumanActionDecision, type HumanActionRequest } from './human-action.js';

export const HUMAN_ACTION_OPN_READ_MODEL_SCHEMA = 'zj-loop.human_action_opn_read_model.v1' as const;
type InboxPayload = { schema: 'zj-loop.opn_inbox_event.v1'; envelope: TransportEnvelope };
export type HumanActionReadModel = {
  schema: typeof HUMAN_ACTION_OPN_READ_MODEL_SCHEMA;
  network_id: string;
  requests: Array<Omit<HumanActionRequest, 'status'> & { status: 'pending' | 'approved' | 'rejected'; decision?: HumanActionDecision }>;
  side_effects_executed: false;
};
type ProjectedRequest = HumanActionReadModel['requests'][number];

function payloadOf(event: StateEvent): InboxPayload | null {
  const payload = event.payload as Partial<InboxPayload>;
  return (payload.schema === 'zj-loop.opn_inbox_event.v1' || payload.schema === 'zj-loop.opn_transport_http.v1') && payload.envelope ? payload as InboxPayload : null;
}

async function artifact(store: OpnArtifactStore, envelope: TransportEnvelope): Promise<Record<string, unknown> | null> {
  const ref = envelope.artifact_refs.find((item) => item.kind === 'artifact');
  if (!ref) return null;
  try {
    const result = await store.read(ref.artifact_id);
    if (result.metadata.content_sha256 !== ref.content_sha256) return null;
    const value = JSON.parse(result.bytes.toString('utf8')) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

export async function projectOpnHumanActions(input: { stateStore: Pick<SqliteStateStore, 'readEvents'>; artifactStore: OpnArtifactStore; network_id: string; node_id?: string; now?: string }): Promise<HumanActionReadModel> {
  const inboxEvents = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: 'opn-inbox' })).events;
  const offeredEvents = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: 'opn-transport-message' })).events;
  const events = [...inboxEvents, ...offeredEvents];
  const requests = new Map<string, ProjectedRequest>();
  for (const event of events) {
    const payload = payloadOf(event);
    if (!payload || payload.envelope.network_id !== input.network_id || (input.node_id && payload.envelope.target_node_id !== input.node_id)) continue;
    if (payload.envelope.notification_kind === 'human.action.request') {
      const value = await artifact(input.artifactStore, payload.envelope);
      if (value?.schema !== 'zj-loop.human_action_request.v1') continue;
      const request = value as unknown as HumanActionRequest;
      if (request.request_digest !== undefined && typeof request.request_id === 'string') requests.set(request.request_id, { ...request, target_node_id: payload.envelope.target_node_id, status: 'pending' } as ProjectedRequest);
    }
    if (payload.envelope.notification_kind === 'human.action.decision') {
      const value = await artifact(input.artifactStore, payload.envelope);
      if (value?.schema !== 'zj-loop.human_action_decision.v1') continue;
      const decision = value as unknown as HumanActionDecision;
      const current = requests.get(decision.request_id);
      if (!current) continue;
      if (verifyHumanActionDecision({ request: { ...current, status: 'pending' }, decision, now: input.now }).status === 'valid') requests.set(decision.request_id, { ...current, status: decision.decision, decision });
    }
  }
  return { schema: HUMAN_ACTION_OPN_READ_MODEL_SCHEMA, network_id: input.network_id, requests: [...requests.values()], side_effects_executed: false };
}
