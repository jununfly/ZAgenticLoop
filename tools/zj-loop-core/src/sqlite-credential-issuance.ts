import { createHash, randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import { sha256CanonicalJson } from './sqlite-state-store.js';
import { verifyHumanApprovalContext, type HumanApprovalContext, type HumanPublicIdentity } from './human-authority.js';

export const SQLITE_CREDENTIAL_ISSUANCE_SCHEMA = 'zj-loop.sqlite_credential_issuance.v1' as const;

export type CredentialIssuanceRequest = {
  request_id: string;
  network_id: string;
  node_id: string;
  event_id: string;
  task_id: string;
  capabilities: string[];
  issued_at: string;
  expires_at: string;
  approval: HumanApprovalContext;
  human_identity: HumanPublicIdentity;
};

export type CredentialIssueIntentResult = {
  status: 'recorded' | 'duplicate';
  credential_id: string;
  issuance_digest: string;
  intent_expires_at: string;
};

export type CredentialClaimResult = {
  status: 'claimed' | 'duplicate';
  credential_id: string;
  claimed_at: string;
  token?: string;
};

export type SqliteCredentialIssuance = {
  issueIntent(input: CredentialIssuanceRequest): Promise<CredentialIssueIntentResult>;
  claim(input: { request_id: string; network_id: string; node_id: string; credential_id: string; now?: string }): Promise<CredentialClaimResult>;
  close(): Promise<void>;
};

function requireText(value: string, error: string): string {
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

function issuanceValue(input: CredentialIssuanceRequest): Record<string, unknown> {
  return {
    protocol: SQLITE_CREDENTIAL_ISSUANCE_SCHEMA,
    request_id: input.request_id,
    network_id: input.network_id,
    node_id: input.node_id,
    event_id: input.event_id,
    task_id: input.task_id,
    capabilities: [...new Set(input.capabilities)].sort(),
    issued_at: input.issued_at,
    expires_at: input.expires_at,
    human_id: input.approval.human_id,
  };
}

function bootstrap(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = FULL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS credential_issue_intents (
      request_id TEXT PRIMARY KEY,
      issuance_digest TEXT NOT NULL UNIQUE CHECK (length(issuance_digest) = 64),
      credential_id TEXT NOT NULL UNIQUE,
      network_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      intent_expires_at TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      claimed_at TEXT,
      token_hash TEXT UNIQUE,
      approval_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS credential_issue_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      result_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS credential_issue_events_request_idx
      ON credential_issue_events (request_id, sequence);
  `);
}

function transaction<T>(db: Database.Database, work: () => T): T {
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

export function credentialIssuanceDigest(input: CredentialIssuanceRequest): string {
  return `sha256:${sha256CanonicalJson(issuanceValue(input))}`;
}

export function createSqliteCredentialIssuance(input: { filename: string; now?: () => string }): SqliteCredentialIssuance {
  requireText(input.filename, 'credential-issuance-filename-required');
  const db = new Database(input.filename);
  try {
    bootstrap(db);
  } catch (error) {
    db.close();
    throw error;
  }
  const now = input.now ?? (() => new Date().toISOString());
  return {
    async issueIntent(request) {
      for (const [value, error] of [[request.request_id, 'request-id-required'], [request.network_id, 'network-id-required'], [request.node_id, 'node-id-required'], [request.event_id, 'event-id-required'], [request.task_id, 'task-id-required']] as const) requireText(value, error);
      const issuedAt = parseTime(request.issued_at, 'credential-issued-time-invalid');
      const expiresAt = parseTime(request.expires_at, 'credential-expiry-invalid');
      if (issuedAt >= expiresAt) throw new Error('credential-time-range-invalid');
      const capabilities = [...new Set(request.capabilities)];
      if (capabilities.some((capability) => !capability.trim())) throw new Error('credential-capability-invalid');
      const current = now();
      parseTime(current, 'credential-clock-invalid');
      if (!verifyHumanApprovalContext({ identity: request.human_identity, context: request.approval, now: current })) throw new Error('approval-context-invalid');
      if (request.approval.action !== 'credential.issue' || request.approval.request_id !== request.request_id) throw new Error('approval-context-mismatch');
      if (JSON.stringify([...new Set(request.approval.approved_capabilities)].sort()) !== JSON.stringify(capabilities.sort())) throw new Error('approval-capability-mismatch');
      const issuanceDigest = credentialIssuanceDigest(request);
      if (request.approval.request_digest !== issuanceDigest) throw new Error('approval-context-mismatch');
      const intentExpiresAt = new Date(Math.min(Date.parse(request.approval.expires_at), Date.parse(current) + 5 * 60 * 1000)).toISOString();
      const credentialId = `credential_${issuanceDigest.slice('sha256:'.length, 'sha256:'.length + 32)}`;
      return transaction(db, () => {
        const existing = db.prepare('SELECT request_id, issuance_digest, credential_id, intent_expires_at FROM credential_issue_intents WHERE request_id = ?').get(request.request_id) as { request_id: string; issuance_digest: string; credential_id: string; intent_expires_at: string } | undefined;
        if (existing) {
          if (existing.issuance_digest !== issuanceDigest.slice('sha256:'.length)) throw new Error('request-id-conflict');
          return { status: 'duplicate', credential_id: existing.credential_id, issuance_digest: issuanceDigest, intent_expires_at: existing.intent_expires_at };
        }
        const approvalJson = JSON.stringify(request.approval);
        db.prepare('INSERT INTO credential_issue_intents (request_id, issuance_digest, credential_id, network_id, node_id, intent_expires_at, issued_at, expires_at, claimed_at, token_hash, approval_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)').run(request.request_id, issuanceDigest.slice('sha256:'.length), credentialId, request.network_id, request.node_id, intentExpiresAt, request.issued_at, request.expires_at, approvalJson);
        db.prepare('INSERT INTO credential_issue_events (request_id, event_type, occurred_at, result_json) VALUES (?, ?, ?, ?)').run(request.request_id, 'credential-issued', current, JSON.stringify({ credential_id: credentialId, issuance_digest: issuanceDigest }));
        return { status: 'recorded', credential_id: credentialId, issuance_digest: issuanceDigest, intent_expires_at: intentExpiresAt };
      });
    },
    async claim(request) {
      for (const [value, error] of [[request.request_id, 'request-id-required'], [request.network_id, 'network-id-required'], [request.node_id, 'node-id-required'], [request.credential_id, 'credential-id-required']] as const) requireText(value, error);
      const current = request.now ?? now();
      const currentTime = parseTime(current, 'credential-clock-invalid');
      return transaction(db, () => {
        const row = db.prepare('SELECT request_id, credential_id, network_id, node_id, intent_expires_at, claimed_at, token_hash FROM credential_issue_intents WHERE request_id = ?').get(request.request_id) as { request_id: string; credential_id: string; network_id: string; node_id: string; intent_expires_at: string; claimed_at: string | null; token_hash: string | null } | undefined;
        if (!row || row.credential_id !== request.credential_id || row.network_id !== request.network_id || row.node_id !== request.node_id) throw new Error('credential-not-available');
        if (currentTime >= parseTime(row.intent_expires_at, 'intent-expiry-invalid')) throw new Error('intent-expired');
        if (row.claimed_at) return { status: 'duplicate', credential_id: row.credential_id, claimed_at: row.claimed_at };
        const claimedAt = current;
        const token = randomBytes(32).toString('base64url');
        db.prepare('UPDATE credential_issue_intents SET claimed_at = ?, token_hash = ? WHERE request_id = ? AND claimed_at IS NULL').run(claimedAt, hashToken(token), request.request_id);
        db.prepare('INSERT INTO credential_issue_events (request_id, event_type, occurred_at, result_json) VALUES (?, ?, ?, ?)').run(request.request_id, 'credential-claimed', claimedAt, JSON.stringify({ credential_id: row.credential_id, claimed_at: claimedAt }));
        return { status: 'claimed', credential_id: row.credential_id, claimed_at: claimedAt, token };
      });
    },
    async close() {
      if (db.open) db.close();
    },
  };
}
