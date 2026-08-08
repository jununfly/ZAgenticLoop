import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { createHumanAcceptance } from './human-acceptance.js';
import { recordHumanAcceptance } from './human-acceptance-fact.js';
export const STATE_STORE_GRAPH_ATOM_UI_EVENT_SCHEMA = 'zj-loop.graph_atom_ui_state_event.v1';
export const STATE_STORE_GRAPH_ATOM_UI_AGGREGATE = 'graph-atom-ui';
export const STATE_STORE_GRAPH_ATOM_UI_EVENT = 'graph-atom-ui.read-model.recorded';
function digest(value) {
    const json = canonicalize(value);
    if (typeof json !== 'string')
        throw new Error('state-store-graph-ui-canonicalization-invalid');
    return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}
function validDigest(value) { return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value); }
export function validateStateStoreGraphAtomUiReadModel(model, network_id) {
    if (!model || model.schema !== 'zj-loop.graph_atom_ui_read_model.v1' || model.side_effects_executed !== false || (network_id !== undefined && model.network_id !== network_id) || !model.event?.event_id || !model.plan?.plan_id || !validDigest(model.plan.plan_digest) || !validDigest(model.read_model_digest))
        throw new Error('state-store-graph-ui-read-model-invalid');
    const { read_model_digest: _, ...unsigned } = model;
    if (digest(unsigned) !== model.read_model_digest)
        throw new Error('state-store-graph-ui-read-model-digest-invalid');
}
export async function recordGraphAtomUiReadModel(input) {
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
function readEntry(event, network_id) {
    const payload = event.payload;
    if (payload?.schema !== STATE_STORE_GRAPH_ATOM_UI_EVENT_SCHEMA)
        throw new Error('state-store-graph-ui-event-invalid');
    validateStateStoreGraphAtomUiReadModel(payload.model, network_id);
    return { model: payload.model, ...(payload.handoff ? { handoff: payload.handoff } : {}) };
}
export function createStateStoreGraphAtomUiUpstream(input) {
    if (!input.network_id.trim())
        throw new Error('state-store-graph-ui-network-id-required');
    return {
        async list() {
            const events = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: STATE_STORE_GRAPH_ATOM_UI_AGGREGATE })).events;
            return { events: events.filter((event) => event.event_type === STATE_STORE_GRAPH_ATOM_UI_EVENT).map((event) => readEntry(event, input.network_id).model) };
        },
        async get({ event_id }) {
            const events = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: STATE_STORE_GRAPH_ATOM_UI_AGGREGATE, aggregate_id: event_id })).events.filter((event) => event.event_type === STATE_STORE_GRAPH_ATOM_UI_EVENT);
            return { event: events.length === 0 ? null : readEntry(events.at(-1), input.network_id).model };
        },
        async evidence({ event_id }) {
            const model = (await this.get({ event_id })).event;
            if (!model)
                return { evidence: [] };
            return { evidence: model.nodes.flatMap((node) => node.evidence.map((item) => ({ kind: item.kind, artifact_id: item.artifact_id, digest: item.digest }))) };
        },
        async accept(acceptanceInput) {
            const events = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: STATE_STORE_GRAPH_ATOM_UI_AGGREGATE, aggregate_id: acceptanceInput.event_id })).events.filter((event) => event.event_type === STATE_STORE_GRAPH_ATOM_UI_EVENT);
            if (events.length === 0)
                return { status: 'blocked', reason: 'graph-event-not-found', side_effects_executed: false };
            const entry = readEntry(events.at(-1), input.network_id);
            const { model, handoff } = entry;
            if (!handoff)
                return { status: 'blocked', reason: 'graph-human-acceptance-handoff-unavailable', side_effects_executed: false };
            if (model.status !== 'review-ready' || model.event.event_id !== acceptanceInput.event_id || model.plan.plan_id !== acceptanceInput.plan_id || model.plan.plan_revision !== acceptanceInput.plan_revision || model.plan.plan_digest !== acceptanceInput.plan_digest || model.review_handoff.handoff_digest !== acceptanceInput.review_handoff_digest || model.verification.verification_digest !== acceptanceInput.verification_digest)
                return { status: 'conflict', reason: 'graph-acceptance-scope-conflict', side_effects_executed: false };
            const acceptance = await createHumanAcceptance({ signer: acceptanceInput.signer, handoff, plan_digest: acceptanceInput.plan_digest, accepted_at: acceptanceInput.accepted_at });
            const identity = await Promise.resolve(acceptanceInput.signer.getPublicIdentity());
            return recordHumanAcceptance({ stateStore: input.stateStore, expected_revision: await input.stateStore.getRevision(input.network_id), acceptance, identity, handoff, now: acceptanceInput.accepted_at });
        },
    };
}
