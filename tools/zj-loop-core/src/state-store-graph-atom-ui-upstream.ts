import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import type { GraphAtomUiReadModel } from './graph-atom-ui-read-model.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
import { createHumanAcceptance } from './human-acceptance.js';
import { recordHumanAcceptance } from './human-acceptance-fact.js';
import type { HumanSigner } from './human-signer.js';
import type { ReviewHandoffRecord } from './review-handoff.js';

export const STATE_STORE_GRAPH_ATOM_UI_EVENT_SCHEMA = 'zj-loop.graph_atom_ui_state_event.v1' as const;
export const STATE_STORE_GRAPH_ATOM_UI_AGGREGATE = 'graph-atom-ui' as const;
export const STATE_STORE_GRAPH_ATOM_UI_EVENT = 'graph-atom-ui.read-model.recorded' as const;

type Digest = `sha256:${string}`;

export type StateStoreGraphAtomUiUpstream = {
  list(): Promise<{ events: GraphAtomUiReadModel[] }>;
  get(input: { event_id: string }): Promise<{ event: GraphAtomUiReadModel | null }>;
  evidence(input: { event_id: string }): Promise<{ evidence: Array<{ kind: string; artifact_id: string; digest: Digest }> }>;
  accept(input: { network_id: string; event_id: string; plan_id: string; plan_revision: number; plan_digest: string; review_handoff_digest: string; verification_digest: string; accepted_at: string; signer: HumanSigner }): Promise<Record<string, unknown>>;
};

function digest(value: Omit<GraphAtomUiReadModel, 'read_model_digest'>): Digest {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('state-store-graph-ui-canonicalization-invalid');
  return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}

function validDigest(value: unknown): value is Digest { return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value); }

export function validateStateStoreGraphAtomUiReadModel(model: GraphAtomUiReadModel, network_id?: string): void {
  if (!model || model.schema !== 'zj-loop.graph_atom_ui_read_model.v1' || model.side_effects_executed !== false || (network_id !== undefined && model.network_id !== network_id) || !model.event?.event_id || !model.plan?.plan_id || !validDigest(model.plan.plan_digest) || !validDigest(model.read_model_digest)) throw new Error('state-store-graph-ui-read-model-invalid');
  const { read_model_digest: _, ...unsigned } = model;
  if (digest(unsigned) !== model.read_model_digest) throw new Error('state-store-graph-ui-read-model-digest-invalid');
}

export async function recordGraphAtomUiReadModel(input: { stateStore: SqliteStateStore; model: GraphAtomUiReadModel; handoff?: ReviewHandoffRecord; now?: string }): Promise<{ status: 'recorded' | 'duplicate' | 'conflict'; revision?: number; current_revision: number; reason?: string }> {
  validateStateStoreGraphAtomUiReadModel(input.model);
  const event = {
    event_id: `graph-atom-ui:${input.model.event.event_id}`,
    aggregate_type: STATE_STORE_GRAPH_ATOM_UI_AGGREGATE,
    aggregate_id: input.model.event.event_id,
    event_type: STATE_STORE_GRAPH_ATOM_UI_EVENT,
    occurred_at: input.now ?? new Date().toISOString(),
    payload: { schema: STATE_STORE_GRAPH_ATOM_UI_EVENT_SCHEMA, model: input.model, ...(input.handoff ? { handoff: input.handoff } : {}) },
  };
  return input.stateStore.appendEvent({ network_id: input.model.network_id, expected_revision: await input.stateStore.getRevision(input.model.network_id), now: input.now, event });
}

function readEntry(event: { payload: unknown }, network_id: string): { model: GraphAtomUiReadModel; handoff?: ReviewHandoffRecord } {
  const payload = event.payload as { schema?: unknown; model?: unknown; handoff?: unknown };
  if (payload?.schema !== STATE_STORE_GRAPH_ATOM_UI_EVENT_SCHEMA) throw new Error('state-store-graph-ui-event-invalid');
  validateStateStoreGraphAtomUiReadModel(payload.model as GraphAtomUiReadModel, network_id);
  return { model: payload.model as GraphAtomUiReadModel, ...(payload.handoff ? { handoff: payload.handoff as ReviewHandoffRecord } : {}) };
}

export function createStateStoreGraphAtomUiUpstream(input: { stateStore: SqliteStateStore; network_id: string }): StateStoreGraphAtomUiUpstream {
  if (!input.network_id.trim()) throw new Error('state-store-graph-ui-network-id-required');
  return {
    async list() {
      const events = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: STATE_STORE_GRAPH_ATOM_UI_AGGREGATE })).events;
      return { events: events.filter((event) => event.event_type === STATE_STORE_GRAPH_ATOM_UI_EVENT).map((event) => readEntry(event, input.network_id).model) };
    },
    async get({ event_id }) {
      const events = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: STATE_STORE_GRAPH_ATOM_UI_AGGREGATE, aggregate_id: event_id })).events.filter((event) => event.event_type === STATE_STORE_GRAPH_ATOM_UI_EVENT);
      return { event: events.length === 0 ? null : readEntry(events.at(-1)!, input.network_id).model };
    },
    async evidence({ event_id }) {
      const model = (await this.get({ event_id })).event;
      if (!model) return { evidence: [] };
      return { evidence: model.nodes.flatMap((node) => node.evidence.map((item) => ({ kind: item.kind, artifact_id: item.artifact_id, digest: item.digest as Digest }))) };
    },
    async accept(acceptanceInput) {
      const events = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: STATE_STORE_GRAPH_ATOM_UI_AGGREGATE, aggregate_id: acceptanceInput.event_id })).events.filter((event) => event.event_type === STATE_STORE_GRAPH_ATOM_UI_EVENT);
      if (events.length === 0) return { status: 'blocked', reason: 'graph-event-not-found', side_effects_executed: false };
      const entry = readEntry(events.at(-1)!, input.network_id);
      const { model, handoff } = entry;
      if (!handoff) return { status: 'blocked', reason: 'graph-human-acceptance-handoff-unavailable', side_effects_executed: false };
      if (model.status !== 'review-ready' || model.event.event_id !== acceptanceInput.event_id || model.plan.plan_id !== acceptanceInput.plan_id || model.plan.plan_revision !== acceptanceInput.plan_revision || model.plan.plan_digest !== acceptanceInput.plan_digest || model.review_handoff.handoff_digest !== acceptanceInput.review_handoff_digest || model.verification.verification_digest !== acceptanceInput.verification_digest) return { status: 'conflict', reason: 'graph-acceptance-scope-conflict', side_effects_executed: false };
      const acceptance = await createHumanAcceptance({ signer: acceptanceInput.signer, handoff, plan_digest: acceptanceInput.plan_digest, accepted_at: acceptanceInput.accepted_at });
      const identity = await Promise.resolve(acceptanceInput.signer.getPublicIdentity());
      return recordHumanAcceptance({ stateStore: input.stateStore, expected_revision: await input.stateStore.getRevision(input.network_id), acceptance, identity, handoff, now: acceptanceInput.accepted_at });
    },
  };
}
