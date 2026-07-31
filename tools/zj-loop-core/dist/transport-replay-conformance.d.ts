import { type RelayDelivery, type RelaySession } from './relay-contract.js';
import type { TransportDeliveryStore } from './sqlite-transport-delivery-store.js';
export declare const TRANSPORT_REPLAY_CONFORMANCE_SCHEMA: "zj-loop.transport_replay_conformance.v1";
export type TransportReplayConformance = {
    schema: typeof TRANSPORT_REPLAY_CONFORMANCE_SCHEMA;
    scenario_id: string;
    status: 'passed' | 'blocked';
    assertions: Array<{
        name: string;
        status: 'passed' | 'blocked';
        reason?: string;
    }>;
    final_session: RelaySession;
    final_deliveries: RelayDelivery[];
    side_effects_executed: false;
};
export declare function runTransportReplayConformance(input: {
    store: TransportDeliveryStore;
    network_id: string;
    scenario_id: string;
}): Promise<TransportReplayConformance>;
