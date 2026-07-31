import { createHash } from 'node:crypto';
import { acknowledgeDelivery, scheduleDeliveryRetry, startDeliveryLease, transitionDelivery } from './relay-contract.js';
export const TRANSPORT_SESSION_AGGREGATE = 'transport_session';
export const TRANSPORT_DELIVERY_AGGREGATE = 'transport_delivery';
function digest(value) {
    return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex').slice(0, 32);
}
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
function cleanDelivery(value) {
    return { delivery_id: value.delivery_id, attempt_id: value.attempt_id, network_id: value.network_id, event_id: value.event_id, task_id: value.task_id, target_node_id: value.target_node_id, state: value.state, retry_count: value.retry_count, ...(value.lease_expires_at === undefined ? {} : { lease_expires_at: value.lease_expires_at }), ...(value.reason === undefined ? {} : { reason: value.reason }) };
}
function sameDeliveryIdentity(left, right) {
    return left.delivery_id === right.delivery_id && left.network_id === right.network_id && left.event_id === right.event_id && left.task_id === right.task_id && left.target_node_id === right.target_node_id;
}
function eventId(operation, value) {
    return `transport-${operation}:${digest(value)}`;
}
export function createSqliteTransportDeliveryStore(input) {
    if (!input.stateStore)
        throw new Error('transport-state-store-required');
    async function events(network_id, aggregate_type, aggregate_id) {
        return (await input.stateStore.readEvents({ network_id, aggregate_type, aggregate_id })).events;
    }
    async function append(network_id, aggregate_type, aggregate_id, event_type, payload) {
        const current = await input.stateStore.getRevision(network_id);
        const result = await input.stateStore.appendEvent({ network_id, expected_revision: current, event: { event_id: eventId(event_type, payload), aggregate_type, aggregate_id, event_type, occurred_at: new Date().toISOString(), payload } });
        return result.status === 'conflict' ? { status: 'conflict', reason: result.reason } : { status: result.status };
    }
    async function sessionProjection(network_id, session_id) {
        const records = await events(network_id, TRANSPORT_SESSION_AGGREGATE, session_id);
        let session = null;
        for (const record of records) {
            const payload = record.payload;
            if (record.event_type === 'session-opened' && payload.session)
                session = clone(payload.session);
            if (record.event_type === 'session-closed' && session)
                session = { ...session, status: 'closed' };
        }
        return session;
    }
    async function deliveryProjection(network_id, delivery_id) {
        const records = await events(network_id, TRANSPORT_DELIVERY_AGGREGATE, delivery_id);
        let delivery = null;
        for (const record of records) {
            const payload = record.payload;
            if (record.event_type === 'delivery-offered' && payload.delivery)
                delivery = clone(payload.delivery);
            if (record.event_type === 'delivery-updated' && payload.delivery)
                delivery = clone(payload.delivery);
        }
        return delivery;
    }
    async function updateDelivery(network_id, delivery_id, next) {
        const clean = cleanDelivery(next);
        const appended = await append(network_id, TRANSPORT_DELIVERY_AGGREGATE, delivery_id, 'delivery-updated', { delivery: clean });
        return appended.status === 'conflict' ? { status: 'conflict', reason: appended.reason } : { status: 'recorded', delivery: clone(clean) };
    }
    return {
        async openSession({ session }) {
            const existing = await sessionProjection(session.network_id, session.session_id);
            if (existing)
                return JSON.stringify(existing) === JSON.stringify(session) ? { status: 'duplicate', session: existing } : { status: 'conflict', session: existing, reason: 'transport-session-conflict' };
            const appended = await append(session.network_id, TRANSPORT_SESSION_AGGREGATE, session.session_id, 'session-opened', { session });
            return appended.status === 'conflict' ? { status: 'conflict', session, reason: appended.reason } : { status: appended.status, session: clone(session), ...(appended.reason ? { reason: appended.reason } : {}) };
        },
        async getSession({ network_id, session_id }) { return sessionProjection(network_id, session_id); },
        async offerDelivery({ delivery }) {
            const existing = await deliveryProjection(delivery.network_id, delivery.delivery_id);
            if (existing)
                return sameDeliveryIdentity(existing, delivery) ? { status: 'duplicate', delivery: existing } : { status: 'conflict', delivery: existing, reason: 'transport-delivery-conflict' };
            const clean = cleanDelivery(delivery);
            const appended = await append(delivery.network_id, TRANSPORT_DELIVERY_AGGREGATE, delivery.delivery_id, 'delivery-offered', { delivery: clean });
            return appended.status === 'conflict' ? { status: 'conflict', delivery: clean, reason: appended.reason } : { status: appended.status, delivery: clone(clean) };
        },
        async getDelivery({ network_id, delivery_id }) { return deliveryProjection(network_id, delivery_id); },
        async startLease(inputValue) {
            const current = await deliveryProjection(inputValue.network_id, inputValue.delivery_id);
            if (!current)
                return { status: 'conflict', reason: 'delivery-not-found' };
            try {
                return updateDelivery(inputValue.network_id, inputValue.delivery_id, startDeliveryLease({ delivery: current, attempt_id: inputValue.attempt_id, now: inputValue.now, lease_ms: inputValue.lease_ms }));
            }
            catch (error) {
                return { status: 'conflict', reason: error instanceof Error ? error.message : 'delivery-lease-invalid' };
            }
        },
        async accept(inputValue) {
            const current = await deliveryProjection(inputValue.network_id, inputValue.delivery_id);
            if (!current || current.attempt_id !== inputValue.attempt_id || current.state !== 'offered' || !current.lease_expires_at)
                return { status: 'conflict', reason: 'delivery-accept-invalid' };
            try {
                return updateDelivery(inputValue.network_id, inputValue.delivery_id, transitionDelivery(current, { state: 'accepted' }));
            }
            catch (error) {
                return { status: 'conflict', reason: error instanceof Error ? error.message : 'delivery-accept-invalid' };
            }
        },
        async acknowledge(inputValue) {
            const current = await deliveryProjection(inputValue.network_id, inputValue.delivery_id);
            if (!current)
                return { status: 'conflict', reason: 'delivery-not-found' };
            try {
                return updateDelivery(inputValue.network_id, inputValue.delivery_id, acknowledgeDelivery({ delivery: current, attempt_id: inputValue.attempt_id, now: inputValue.now }));
            }
            catch (error) {
                return { status: 'conflict', reason: error instanceof Error ? error.message : 'delivery-ack-invalid' };
            }
        },
        async scheduleRetry(inputValue) {
            const current = await deliveryProjection(inputValue.network_id, inputValue.delivery_id);
            if (!current)
                return { status: 'conflict', reason: 'delivery-not-found' };
            try {
                return updateDelivery(inputValue.network_id, inputValue.delivery_id, scheduleDeliveryRetry({ delivery: current, ...inputValue }));
            }
            catch (error) {
                return { status: 'conflict', reason: error instanceof Error ? error.message : 'delivery-retry-invalid' };
            }
        },
        async reoffer(inputValue) {
            const current = await deliveryProjection(inputValue.network_id, inputValue.delivery_id);
            if (!current)
                return { status: 'conflict', reason: 'delivery-not-found' };
            try {
                return updateDelivery(inputValue.network_id, inputValue.delivery_id, transitionDelivery(current, { state: 'offered' }));
            }
            catch (error) {
                return { status: 'conflict', reason: error instanceof Error ? error.message : 'delivery-reoffer-invalid' };
            }
        },
    };
}
