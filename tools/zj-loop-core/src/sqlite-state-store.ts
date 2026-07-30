import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';

export const SQLITE_STATE_STORE_SCHEMA = 'zj-loop.sqlite_state_store.v1' as const;
export const STATE_EVENT_SCHEMA = 'zj-loop.state_event.v1' as const;
export const STATE_EVENT_PAYLOAD_LIMIT = 256 * 1024;

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
  appendEvent(input: { network_id: string; expected_revision: number; event: StateEventInput; now?: string }): { status: 'recorded' | 'duplicate' | 'conflict'; revision?: number; current_revision: number; reason?: string };
};

export type SqliteStateStore = {
  createNetwork(input: { network_id: string; owner_id: string; now?: string }): Promise<{ status: 'recorded' | 'duplicate' | 'conflict'; revision: number; reason?: string }>;
  appendEvent(input: { network_id: string; expected_revision: number; event: StateEventInput; now?: string }): Promise<{ status: 'recorded' | 'duplicate' | 'conflict'; revision?: number; current_revision: number; reason?: string }>;
  getRevision(network_id: string): Promise<number>;
  readEvents(input: { network_id: string; after_revision?: number; aggregate_type?: string; aggregate_id?: string }): Promise<{ snapshot_revision: number; events: StateEvent[] }>;
  runAtomic<T>(work: (transaction: SqliteStateStoreTransaction) => T): Promise<T>;
  close(): Promise<void>;
};

function requireId(value: string, error: string): string {
  if (!value.trim()) throw new Error(error);
  return value;
}

function canonicalize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('payload-json-invalid');
    return value;
  }
  if (typeof value !== 'object') throw new Error('payload-json-invalid');
  if (seen.has(value)) throw new Error('payload-json-circular');
  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.map((item) => canonicalize(item, seen));
    seen.delete(value);
    return result;
  }
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) result[key] = canonicalize((value as Record<string, unknown>)[key], seen);
  seen.delete(value);
  return result;
}

export function canonicalizeJson(value: unknown): string {
  const encoded = JSON.stringify(canonicalize(value));
  if (encoded === undefined) throw new Error('payload-json-invalid');
  return encoded;
}

export function sha256CanonicalJson(value: unknown): string {
  return createHash('sha256').update(canonicalizeJson(value), 'utf8').digest('hex');
}

export function validateStateEventInput(event: StateEventInput): { payload_json: string; payload_sha256: string } {
  requireId(event.event_id, 'event-id-required');
  requireId(event.aggregate_type, 'aggregate-type-required');
  requireId(event.aggregate_id, 'aggregate-id-required');
  requireId(event.event_type, 'event-type-required');
  requireId(event.occurred_at, 'event-occurred-at-required');
  const payload_json = canonicalizeJson(event.payload);
  if (Buffer.byteLength(payload_json, 'utf8') > STATE_EVENT_PAYLOAD_LIMIT) throw new Error('payload-too-large');
  return { payload_json, payload_sha256: sha256CanonicalJson(event.payload) };
}

function withImmediateTransaction<T>(db: Database.Database, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function appendEventInTransaction(db: Database.Database, input: { network_id: string; expected_revision: number; event: StateEventInput; now?: string }): { status: 'recorded' | 'duplicate' | 'conflict'; revision?: number; current_revision: number; reason?: string } {
  requireId(input.network_id, 'network-id-required');
  if (!Number.isInteger(input.expected_revision) || input.expected_revision < 1) throw new Error('expected-revision-invalid');
  const { payload_json, payload_sha256 } = validateStateEventInput(input.event);
  const now = input.now ?? new Date().toISOString();
  const current = db.prepare('SELECT current_revision FROM network_metadata WHERE network_id = ?').get(input.network_id) as { current_revision: number } | undefined;
  if (!current) throw new Error('network-not-found');
  const existing = db.prepare('SELECT revision, aggregate_type, aggregate_id, event_type, occurred_at, payload_json, payload_sha256 FROM state_events WHERE network_id = ? AND event_id = ?').get(input.network_id, input.event.event_id) as { revision: number; aggregate_type: string; aggregate_id: string; event_type: string; occurred_at: string; payload_json: string; payload_sha256: string } | undefined;
  if (existing) {
    const same = existing.aggregate_type === input.event.aggregate_type && existing.aggregate_id === input.event.aggregate_id && existing.event_type === input.event.event_type && existing.occurred_at === input.event.occurred_at && existing.payload_json === payload_json && existing.payload_sha256 === payload_sha256;
    return same ? { status: 'duplicate', revision: existing.revision, current_revision: current.current_revision } : { status: 'conflict', current_revision: current.current_revision, reason: 'event-id-reused' };
  }
  if (input.expected_revision !== current.current_revision) return { status: 'conflict', current_revision: current.current_revision, reason: 'revision-mismatch' };
  const revision = current.current_revision + 1;
  db.prepare('INSERT INTO state_events (network_id, revision, event_id, aggregate_type, aggregate_id, event_type, occurred_at, created_at, payload_json, payload_sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(input.network_id, revision, input.event.event_id, input.event.aggregate_type, input.event.aggregate_id, input.event.event_type, input.event.occurred_at, now, payload_json, payload_sha256);
  db.prepare('UPDATE network_metadata SET current_revision = ?, updated_at = ? WHERE network_id = ?').run(revision, now, input.network_id);
  return { status: 'recorded', revision, current_revision: revision };
}

function bootstrap(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = FULL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS state_metadata (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      schema_version INTEGER NOT NULL
    );
    INSERT INTO state_metadata (id, schema_version)
      VALUES (1, 1)
      ON CONFLICT(id) DO NOTHING;
    CREATE TABLE IF NOT EXISTS network_metadata (
      network_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      current_revision INTEGER NOT NULL CHECK (current_revision >= 1),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS state_events (
      network_id TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision > 0),
      event_id TEXT NOT NULL,
      aggregate_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256) = 64),
      PRIMARY KEY (network_id, revision),
      UNIQUE (network_id, event_id),
      FOREIGN KEY (network_id) REFERENCES network_metadata(network_id)
    );
    CREATE INDEX IF NOT EXISTS state_events_aggregate_idx
      ON state_events (network_id, aggregate_type, aggregate_id, revision);
    CREATE INDEX IF NOT EXISTS state_events_created_at_idx
      ON state_events (network_id, created_at);
    CREATE TRIGGER IF NOT EXISTS state_events_no_update
      BEFORE UPDATE ON state_events BEGIN SELECT RAISE(ABORT, 'state-events-append-only'); END;
    CREATE TRIGGER IF NOT EXISTS state_events_no_delete
      BEFORE DELETE ON state_events BEGIN SELECT RAISE(ABORT, 'state-events-append-only'); END;
  `);
  const version = db.prepare('SELECT schema_version FROM state_metadata WHERE id = 1').get() as { schema_version: number } | undefined;
  if (!version || version.schema_version !== 1) throw new Error('state-schema-version-unsupported');
}

export function createSqliteStateStore(input: { filename: string }): SqliteStateStore {
  requireId(input.filename, 'state-store-filename-required');
  const db = new Database(input.filename);
  try {
    bootstrap(db);
  } catch (error) {
    db.close();
    throw error;
  }
  return {
    async createNetwork(network) {
      requireId(network.network_id, 'network-id-required');
      requireId(network.owner_id, 'network-owner-required');
      const now = network.now ?? new Date().toISOString();
      return withImmediateTransaction(db, () => {
        const existing = db.prepare('SELECT owner_id, current_revision FROM network_metadata WHERE network_id = ?').get(network.network_id) as { owner_id: string; current_revision: number } | undefined;
        if (existing) {
          return existing.owner_id === network.owner_id
            ? { status: 'duplicate', revision: existing.current_revision }
            : { status: 'conflict', revision: existing.current_revision, reason: 'network-owner-mismatch' };
        }
        db.prepare('INSERT INTO network_metadata (network_id, owner_id, current_revision, created_at, updated_at) VALUES (?, ?, 1, ?, ?)').run(network.network_id, network.owner_id, now, now);
        const payload = { network_id: network.network_id, owner_id: network.owner_id };
        db.prepare('INSERT INTO state_events (network_id, revision, event_id, aggregate_type, aggregate_id, event_type, occurred_at, created_at, payload_json, payload_sha256) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?)').run(network.network_id, `network-created:${network.network_id}`, 'network', network.network_id, 'network.created', now, now, canonicalizeJson(payload), sha256CanonicalJson(payload));
        return { status: 'recorded', revision: 1 };
      });
    },
    async appendEvent(input) {
      return withImmediateTransaction(db, () => appendEventInTransaction(db, input));
    },
    async getRevision(network_id) {
      requireId(network_id, 'network-id-required');
      const row = db.prepare('SELECT current_revision FROM network_metadata WHERE network_id = ?').get(network_id) as { current_revision: number } | undefined;
      if (!row) throw new Error('network-not-found');
      return row.current_revision;
    },
    async readEvents(input) {
      requireId(input.network_id, 'network-id-required');
      if (input.after_revision !== undefined && (!Number.isInteger(input.after_revision) || input.after_revision < 0)) throw new Error('after-revision-invalid');
      db.exec('BEGIN');
      try {
        const metadata = db.prepare('SELECT current_revision FROM network_metadata WHERE network_id = ?').get(input.network_id) as { current_revision: number } | undefined;
        if (!metadata) throw new Error('network-not-found');
        const rows = db.prepare(`SELECT network_id, revision, event_id, aggregate_type, aggregate_id, event_type, occurred_at, created_at, payload_json, payload_sha256 FROM state_events WHERE network_id = ? AND revision > ? AND revision <= ? ${input.aggregate_type ? 'AND aggregate_type = ?' : ''} ${input.aggregate_id ? 'AND aggregate_id = ?' : ''} ORDER BY revision`).all(...([input.network_id, input.after_revision ?? 0, metadata.current_revision, ...(input.aggregate_type ? [input.aggregate_type] : []), ...(input.aggregate_id ? [input.aggregate_id] : [])])) as Array<Record<string, unknown>>;
        const events = rows.map((row): StateEvent => {
          const payload = JSON.parse(row.payload_json as string);
          if (sha256CanonicalJson(payload) !== row.payload_sha256) throw new Error('state-event-payload-integrity-failed');
          return { schema: STATE_EVENT_SCHEMA, network_id: row.network_id as string, revision: row.revision as number, event_id: row.event_id as string, aggregate_type: row.aggregate_type as string, aggregate_id: row.aggregate_id as string, event_type: row.event_type as string, occurred_at: row.occurred_at as string, created_at: row.created_at as string, payload, payload_sha256: row.payload_sha256 as string };
        });
        db.exec('COMMIT');
        return { snapshot_revision: metadata.current_revision, events };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    async runAtomic(work) {
      if (typeof work !== 'function') throw new Error('state-transaction-work-required');
      return withImmediateTransaction(db, () => work({ database: db, appendEvent: (event) => appendEventInTransaction(db, event) }));
    },
    async close() {
      if (db.open) db.close();
    },
  };
}
