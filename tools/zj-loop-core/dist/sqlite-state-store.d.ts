import Database from 'better-sqlite3';
export declare const SQLITE_STATE_STORE_SCHEMA: "zj-loop.sqlite_state_store.v1";
export declare const STATE_EVENT_SCHEMA: "zj-loop.state_event.v1";
export declare const STATE_EVENT_PAYLOAD_LIMIT: number;
export type StateEventInput = {
    event_id: string;
    aggregate_type: string;
    aggregate_id: string;
    event_type: string;
    occurred_at: string;
    payload: unknown;
};
export type StateEvent = {
    schema: typeof STATE_EVENT_SCHEMA;
    network_id: string;
    event_id: string;
    aggregate_type: string;
    aggregate_id: string;
    event_type: string;
    revision: number;
    occurred_at: string;
    created_at: string;
    payload: unknown;
    payload_sha256: string;
};
export type SqliteStateStoreTransaction = {
    database: Database.Database;
    appendEvent(input: {
        network_id: string;
        expected_revision: number;
        event: StateEventInput;
        now?: string;
    }): {
        status: 'recorded' | 'duplicate' | 'conflict';
        revision?: number;
        current_revision: number;
        reason?: string;
    };
};
export type SqliteStateStore = {
    createNetwork(input: {
        network_id: string;
        owner_id: string;
        now?: string;
    }): Promise<{
        status: 'recorded' | 'duplicate' | 'conflict';
        revision: number;
        reason?: string;
    }>;
    appendEvent(input: {
        network_id: string;
        expected_revision: number;
        event: StateEventInput;
        now?: string;
    }): Promise<{
        status: 'recorded' | 'duplicate' | 'conflict';
        revision?: number;
        current_revision: number;
        reason?: string;
    }>;
    getRevision(network_id: string): Promise<number>;
    readEvents(input: {
        network_id: string;
        after_revision?: number;
        aggregate_type?: string;
        aggregate_id?: string;
    }): Promise<{
        snapshot_revision: number;
        events: StateEvent[];
    }>;
    runAtomic<T>(work: (transaction: SqliteStateStoreTransaction) => T): Promise<T>;
    close(): Promise<void>;
};
export declare function canonicalizeJson(value: unknown): string;
export declare function sha256CanonicalJson(value: unknown): string;
export declare function validateStateEventInput(event: StateEventInput): {
    payload_json: string;
    payload_sha256: string;
};
export declare function createSqliteStateStore(input: {
    filename: string;
}): SqliteStateStore;
