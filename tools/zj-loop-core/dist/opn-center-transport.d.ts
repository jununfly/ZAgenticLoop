import type { SqliteStateStore } from './sqlite-state-store.js';
import { type TransportAdapter } from './transport-contract.js';
export declare function createLocalOpnTransportAdapter(input: {
    stateStore: SqliteStateStore;
    network_id: string;
    node_id: string;
    now?: () => string;
}): TransportAdapter;
