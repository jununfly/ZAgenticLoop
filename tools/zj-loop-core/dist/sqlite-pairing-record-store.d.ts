import { type PairingRecordStore } from './pairing-record-store.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const SQLITE_PAIRING_RECORD_STORE_SCHEMA: "zj-loop.sqlite_pairing_record_store.v1";
export declare function createSqlitePairingRecordStore(input: {
    stateStore: SqliteStateStore;
}): PairingRecordStore;
