import { verifyHumanActionDecision } from './human-action.js';
export const HUMAN_ACTION_OPN_READ_MODEL_SCHEMA = 'zj-loop.human_action_opn_read_model.v1';
function payloadOf(event) {
    const payload = event.payload;
    return (payload.schema === 'zj-loop.opn_inbox_event.v1' || payload.schema === 'zj-loop.opn_transport_http.v1') && payload.envelope ? payload : null;
}
async function artifact(store, envelope) {
    const ref = envelope.artifact_refs.find((item) => item.kind === 'artifact');
    if (!ref)
        return null;
    try {
        const result = await store.read(ref.artifact_id);
        if (result.metadata.content_sha256 !== ref.content_sha256)
            return null;
        const value = JSON.parse(result.bytes.toString('utf8'));
        return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    }
    catch {
        return null;
    }
}
export async function projectOpnHumanActions(input) {
    const inboxEvents = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: 'opn-inbox' })).events;
    const offeredEvents = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: 'opn-transport-message' })).events;
    const events = [...inboxEvents, ...offeredEvents];
    const requests = new Map();
    for (const event of events) {
        const payload = payloadOf(event);
        if (!payload || payload.envelope.network_id !== input.network_id || (input.node_id && payload.envelope.target_node_id !== input.node_id))
            continue;
        if (payload.envelope.notification_kind === 'human.action.request') {
            const value = await artifact(input.artifactStore, payload.envelope);
            if (value?.schema !== 'zj-loop.human_action_request.v1')
                continue;
            const request = value;
            if (request.request_digest !== undefined && typeof request.request_id === 'string')
                requests.set(request.request_id, { ...request, target_node_id: payload.envelope.target_node_id, status: 'pending' });
        }
        if (payload.envelope.notification_kind === 'human.action.decision') {
            const value = await artifact(input.artifactStore, payload.envelope);
            if (value?.schema !== 'zj-loop.human_action_decision.v1')
                continue;
            const decision = value;
            const current = requests.get(decision.request_id);
            if (!current)
                continue;
            if (verifyHumanActionDecision({ request: { ...current, status: 'pending' }, decision, now: input.now }).status === 'valid')
                requests.set(decision.request_id, { ...current, status: decision.decision, decision });
        }
    }
    return { schema: HUMAN_ACTION_OPN_READ_MODEL_SCHEMA, network_id: input.network_id, requests: [...requests.values()], side_effects_executed: false };
}
