import { type RelayDelivery, type RelaySession } from './relay-contract.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const TRANSPORT_SESSION_AGGREGATE: "transport_session";
export declare const TRANSPORT_DELIVERY_AGGREGATE: "transport_delivery";
export type TransportDeliveryStore = {
    openSession(input: {
        session: RelaySession;
    }): Promise<{
        status: 'recorded' | 'duplicate' | 'conflict';
        session: RelaySession;
        reason?: string;
    }>;
    getSession(input: {
        network_id: string;
        session_id: string;
    }): Promise<RelaySession | null>;
    offerDelivery(input: {
        delivery: RelayDelivery;
    }): Promise<{
        status: 'recorded' | 'duplicate' | 'conflict';
        delivery: RelayDelivery;
        reason?: string;
    }>;
    getDelivery(input: {
        network_id: string;
        delivery_id: string;
    }): Promise<RelayDelivery | null>;
    startLease(input: {
        network_id: string;
        delivery_id: string;
        attempt_id: string;
        now: string;
        lease_ms: number;
    }): Promise<{
        status: 'recorded' | 'conflict';
        delivery?: RelayDelivery;
        reason?: string;
    }>;
    accept(input: {
        network_id: string;
        delivery_id: string;
        attempt_id: string;
    }): Promise<{
        status: 'recorded' | 'conflict';
        delivery?: RelayDelivery;
        reason?: string;
    }>;
    acknowledge(input: {
        network_id: string;
        delivery_id: string;
        attempt_id: string;
        now: string;
    }): Promise<{
        status: 'recorded' | 'conflict';
        delivery?: RelayDelivery;
        reason?: string;
    }>;
    scheduleRetry(input: {
        network_id: string;
        delivery_id: string;
        now: string;
        max_retries: number;
        reason: string;
    }): Promise<{
        status: 'recorded' | 'conflict';
        delivery?: RelayDelivery;
        reason?: string;
    }>;
    reoffer(input: {
        network_id: string;
        delivery_id: string;
    }): Promise<{
        status: 'recorded' | 'conflict';
        delivery?: RelayDelivery;
        reason?: string;
    }>;
};
export declare function createSqliteTransportDeliveryStore(input: {
    stateStore: SqliteStateStore;
}): TransportDeliveryStore;
