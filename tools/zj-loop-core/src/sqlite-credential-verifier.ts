import { createHash, randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import type { CredentialVerifier, CredentialVerificationRequest } from './sqlite-state-store-server.js';
import type { ScopedCredential } from './node-enrollment.js';

export const SQLITE_CREDENTIAL_STORE_SCHEMA = 'zj-loop.sqlite_credential_store.v1' as const;

export type SqliteCredentialVerifier = CredentialVerifier & {
  issueCredential(input: { credential: ScopedCredential; now?: string }): Promise<{ status: 'recorded' | 'duplicate'; credential_id: string; token?: string }>;
  revokeCredential(input: { credential_id: string; now?: string }): Promise<{ status: 'revoked' | 'duplicate' }>;
  close(): Promise<void>;
};

function requireId(value: string, error: string): string {
  if (!value.trim()) throw new Error(error);
  return value;
}

function parseTime(value: string, error: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(error);
  return parsed;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function bootstrap(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = FULL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS credential_metadata (
      credential_id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
      network_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      capabilities_json TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE TABLE IF NOT EXISTS credential_store_metadata (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      schema_version INTEGER NOT NULL
    );
    INSERT INTO credential_store_metadata (id, schema_version)
      VALUES (1, 1)
      ON CONFLICT(id) DO NOTHING;
  `);
  const version = db.prepare('SELECT schema_version FROM credential_store_metadata WHERE id = 1').get() as { schema_version: number } | undefined;
  if (!version || version.schema_version !== 1) throw new Error('credential-schema-version-unsupported');
}

export function createSqliteCredentialVerifier(input: { filename: string; now?: () => string }): SqliteCredentialVerifier {
  requireId(input.filename, 'credential-store-filename-required');
  const db = new Database(input.filename);
  try {
    bootstrap(db);
  } catch (error) {
    db.close();
    throw error;
  }
  const now = input.now ?? (() => new Date().toISOString());
  return {
    async issueCredential(request) {
      const credential = request.credential;
      requireId(credential.credential_id, 'credential-id-required');
      requireId(credential.network_id, 'network-id-required');
      requireId(credential.node_id, 'credential-node-id-required');
      requireId(credential.event_id, 'event-id-required');
      requireId(credential.task_id, 'task-id-required');
      const issuedAt = parseTime(credential.issued_at, 'credential-issued-time-invalid');
      const expiresAt = parseTime(credential.expires_at, 'credential-expiry-invalid');
      if (issuedAt > expiresAt) throw new Error('credential-time-range-invalid');
      const capabilities = [...new Set(credential.capabilities)];
      if (capabilities.some((capability) => !capability.trim())) throw new Error('credential-capability-invalid');
      const existing = db.prepare('SELECT credential_id FROM credential_metadata WHERE credential_id = ?').get(credential.credential_id) as { credential_id: string } | undefined;
      if (existing) return { status: 'duplicate', credential_id: credential.credential_id };
      const token = randomBytes(32).toString('base64url');
      db.prepare('INSERT INTO credential_metadata (credential_id, token_hash, network_id, node_id, event_id, task_id, capabilities_json, issued_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)').run(credential.credential_id, hashToken(token), credential.network_id, credential.node_id, credential.event_id, credential.task_id, JSON.stringify(capabilities), credential.issued_at, credential.expires_at);
      return { status: 'recorded', credential_id: credential.credential_id, token };
    },
    async revokeCredential(request) {
      requireId(request.credential_id, 'credential-id-required');
      const existing = db.prepare('SELECT revoked_at FROM credential_metadata WHERE credential_id = ?').get(request.credential_id) as { revoked_at: string | null } | undefined;
      if (!existing) throw new Error('credential-not-found');
      if (existing.revoked_at) return { status: 'duplicate' };
      db.prepare('UPDATE credential_metadata SET revoked_at = ? WHERE credential_id = ?').run(request.now ?? now(), request.credential_id);
      return { status: 'revoked' };
    },
    async verify(request: CredentialVerificationRequest) {
      const row = db.prepare('SELECT network_id, node_id, event_id, task_id, capabilities_json, issued_at, expires_at, revoked_at FROM credential_metadata WHERE token_hash = ?').get(hashToken(request.token)) as { network_id: string; node_id: string; event_id: string; task_id: string; capabilities_json: string; issued_at: string; expires_at: string; revoked_at: string | null } | undefined;
      if (!row) return { status: 'blocked', reason: 'credential-invalid' as const };
      if (row.revoked_at) return { status: 'blocked', reason: 'credential-revoked' as const };
      const current = parseTime(now(), 'credential-clock-invalid');
      if (current < parseTime(row.issued_at, 'credential-issued-time-invalid')) return { status: 'blocked', reason: 'credential-not-yet-valid' as const };
      if (current > parseTime(row.expires_at, 'credential-expiry-invalid')) return { status: 'blocked', reason: 'credential-expired' as const };
      if (row.node_id !== request.node_id) return { status: 'blocked', reason: 'credential-node-mismatch' as const };
      if (request.network_id !== row.network_id) return { status: 'blocked', reason: 'credential-network-mismatch' as const };
      if (request.event_id !== undefined && request.event_id !== row.event_id) return { status: 'blocked', reason: 'credential-event-mismatch' as const };
      if (request.task_id !== undefined && request.task_id !== row.task_id) return { status: 'blocked', reason: 'credential-task-mismatch' as const };
      const capabilities = new Set(JSON.parse(row.capabilities_json) as string[]);
      if ((request.required_capabilities ?? []).some((capability) => !capabilities.has(capability))) return { status: 'blocked', reason: 'credential-capability-mismatch' as const };
      return { status: 'allowed' as const };
    },
    async close() {
      if (db.open) db.close();
    },
  };
}
