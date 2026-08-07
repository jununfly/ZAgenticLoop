import { createHash, randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import { sha256CanonicalJson } from './sqlite-state-store.js';
import type { SqliteStateStore, StateEventInput } from './sqlite-state-store.js';
import { createCredentialClaimEvent, createCredentialIssueIntentEvent, createCredentialRevokeEvent } from './credential-issuance-events.js';
import { verifyHumanApprovalContextDetailed, type HumanApprovalContext, type HumanPublicIdentity } from './human-authority.js';

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
  expected_revision?: number;
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

export type PairingCredentialIssuanceRequest = {
  request_id: string;
  network_id: string;
  node_id: string;
  request_digest: string;
  human_id: string;
  capabilities: string[];
  issued_at: string;
  expires_at: string;
  expected_revision?: number;
};

export type SqliteCredentialIssuance = {
  issueIntent(input: CredentialIssuanceRequest): Promise<CredentialIssueIntentResult>;
  issuePairingIntent(input: PairingCredentialIssuanceRequest): Promise<CredentialIssueIntentResult>;
  claim(input: { request_id: string; network_id: string; node_id: string; credential_id: string; now?: string }): Promise<CredentialClaimResult>;
  claimForPairingSession(input: { request_id: string; network_id: string; node_id: string; session_id: string; now?: string }): Promise<CredentialClaimResult>;
  revoke(input: { credential_id: string; request_id: string; reason: string; now?: string }): Promise<{ status: 'revoked' | 'duplicate'; credential_id: string; revoked_at?: string }>;
  close(): Promise<void>;
};

export type CredentialIssueIntentServiceInput = {
  network_id: string;
  expected_revision: number;
  human_id: string;
  human_context: string;
  request: Record<string, unknown>;
};

export type HumanApprovalEnvelope = {
  approval: HumanApprovalContext;
  human_identity: HumanPublicIdentity;
};

export function parseHumanApprovalEnvelope(context: string): HumanApprovalEnvelope {
  requireText(context, 'human-context-required');
  let value: unknown;
  try {
    value = JSON.parse(context);
  } catch {
    throw new Error('approval-context-invalid');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('approval' in value) || !('human_identity' in value)) throw new Error('approval-context-invalid');
  const envelope = value as Partial<HumanApprovalEnvelope>;
  if (!envelope.approval || typeof envelope.approval !== 'object' || !envelope.human_identity || typeof envelope.human_identity !== 'object') throw new Error('approval-context-invalid');
  return { approval: envelope.approval as HumanApprovalContext, human_identity: envelope.human_identity as HumanPublicIdentity };
}

export function createCredentialIssueIntentService(input: {
  issuance: SqliteCredentialIssuance;
  resolveApproval?: (context: string) => HumanApprovalEnvelope | Promise<HumanApprovalEnvelope>;
}): { issueIntent(request: CredentialIssueIntentServiceInput): Promise<CredentialIssueIntentResult> } {
  const resolveApproval = input.resolveApproval ?? parseHumanApprovalEnvelope;
  return {
    async issueIntent(request) {
      const envelope = await resolveApproval(request.human_context);
      if (envelope.approval.human_id !== request.human_id || envelope.human_identity.human_id !== request.human_id) throw new Error('approval-context-invalid');
      const value = request.request;
      if (typeof value.request_id !== 'string' || typeof value.node_id !== 'string' || typeof value.event_id !== 'string' || typeof value.task_id !== 'string' || typeof value.issued_at !== 'string' || typeof value.expires_at !== 'string' || !Array.isArray(value.capabilities) || !(value.capabilities as unknown[]).every((capability) => typeof capability === 'string')) throw new Error('credential-issue-intent-invalid');
      return input.issuance.issueIntent({ request_id: value.request_id, network_id: request.network_id, node_id: value.node_id, event_id: value.event_id, task_id: value.task_id, capabilities: value.capabilities as string[], issued_at: value.issued_at, expires_at: value.expires_at, approval: envelope.approval, human_identity: envelope.human_identity, expected_revision: request.expected_revision });
    },
  };
}

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

function bootstrapTables(db: Database.Database): void {
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
  const columns = db.prepare('PRAGMA table_info(credential_issue_intents)').all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'revoked_at')) db.exec('ALTER TABLE credential_issue_intents ADD COLUMN revoked_at TEXT');
}

function bootstrap(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = FULL');
  bootstrapTables(db);
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

function pairingCredentialIssuanceDigest(input: PairingCredentialIssuanceRequest): string {
  return `sha256:${sha256CanonicalJson({ protocol: SQLITE_CREDENTIAL_ISSUANCE_SCHEMA, kind: 'pairing-approval', request_id: input.request_id, network_id: input.network_id, node_id: input.node_id, request_digest: input.request_digest, human_id: input.human_id, capabilities: [...new Set(input.capabilities)].sort(), issued_at: input.issued_at, expires_at: input.expires_at })}`;
}

export function createSqliteCredentialIssuance(input: { filename: string; now?: () => string; stateStore?: SqliteStateStore }): SqliteCredentialIssuance {
  requireText(input.filename, 'credential-issuance-filename-required');
  const db = input.stateStore ? null : new Database(input.filename);
  try {
    if (db) bootstrap(db);
  } catch (error) {
    db?.close();
    throw error;
  }
  const now = input.now ?? (() => new Date().toISOString());
  const atomic = <T>(work: (database: Database.Database, appendEvent?: (event: { network_id: string; expected_revision: number; event: StateEventInput; now?: string }) => { status: 'recorded' | 'duplicate' | 'conflict'; revision?: number; current_revision: number; reason?: string }) => T): Promise<T> => {
    if (input.stateStore) return input.stateStore.runAtomic(({ database, appendEvent }) => { bootstrapTables(database); return work(database, appendEvent); });
    if (!db) throw new Error('credential-issuance-unavailable');
    return Promise.resolve(transaction(db, () => work(db)));
  };
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
      if (verifyHumanApprovalContextDetailed({ identity: request.human_identity, context: request.approval, now: current, require_v2: true }).status !== 'current-v2-accepted') throw new Error('approval-context-invalid');
      if (request.approval.action !== 'credential.issue' || request.approval.request_id !== request.request_id) throw new Error('approval-context-mismatch');
      if (JSON.stringify([...new Set(request.approval.approved_capabilities)].sort()) !== JSON.stringify(capabilities.sort())) throw new Error('approval-capability-mismatch');
      const issuanceDigest = credentialIssuanceDigest(request);
      if (request.approval.request_digest !== issuanceDigest) throw new Error('approval-context-mismatch');
      const intentExpiresAt = new Date(Math.min(Date.parse(request.approval.expires_at), Date.parse(current) + 5 * 60 * 1000)).toISOString();
      const credentialId = `credential_${issuanceDigest.slice('sha256:'.length, 'sha256:'.length + 32)}`;
      if (input.stateStore && (!Number.isInteger(request.expected_revision) || (request.expected_revision as number) < 1)) throw new Error('expected-revision-invalid');
      return atomic((database, appendEvent) => {
        const existing = database.prepare('SELECT request_id, issuance_digest, credential_id, intent_expires_at FROM credential_issue_intents WHERE request_id = ?').get(request.request_id) as { request_id: string; issuance_digest: string; credential_id: string; intent_expires_at: string } | undefined;
        if (existing) {
          if (existing.issuance_digest !== issuanceDigest.slice('sha256:'.length)) throw new Error('request-id-conflict');
          return { status: 'duplicate', credential_id: existing.credential_id, issuance_digest: issuanceDigest, intent_expires_at: existing.intent_expires_at };
        }
        const approvalJson = JSON.stringify(request.approval);
        database.prepare('INSERT INTO credential_issue_intents (request_id, issuance_digest, credential_id, network_id, node_id, intent_expires_at, issued_at, expires_at, claimed_at, token_hash, approval_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)').run(request.request_id, issuanceDigest.slice('sha256:'.length), credentialId, request.network_id, request.node_id, intentExpiresAt, request.issued_at, request.expires_at, approvalJson);
        database.prepare('INSERT INTO credential_issue_events (request_id, event_type, occurred_at, result_json) VALUES (?, ?, ?, ?)').run(request.request_id, 'credential-issued', current, JSON.stringify({ credential_id: credentialId, issuance_digest: issuanceDigest }));
        if (appendEvent) {
          const event = createCredentialIssueIntentEvent({ request_id: request.request_id, network_id: request.network_id, node_id: request.node_id, credential_id: credentialId, issuance_digest: issuanceDigest, capabilities, issued_at: request.issued_at, expires_at: request.expires_at, intent_expires_at: intentExpiresAt });
          const result = appendEvent({ network_id: request.network_id, expected_revision: request.expected_revision as number, event, now: current });
          if (result.status === 'conflict') throw new Error(result.reason ?? 'event-conflict');
        }
        return { status: 'recorded', credential_id: credentialId, issuance_digest: issuanceDigest, intent_expires_at: intentExpiresAt };
      });
    },
    async issuePairingIntent(request) {
      for (const [value, error] of [[request.request_id, 'request-id-required'], [request.network_id, 'network-id-required'], [request.node_id, 'node-id-required'], [request.request_digest, 'request-digest-required'], [request.human_id, 'human-id-required']] as const) requireText(value, error);
      const issuedAt = parseTime(request.issued_at, 'credential-issued-time-invalid');
      const expiresAt = parseTime(request.expires_at, 'credential-expiry-invalid');
      if (issuedAt >= expiresAt) throw new Error('credential-time-range-invalid');
      const capabilities = [...new Set(request.capabilities)];
      if (capabilities.some((capability) => !capability.trim())) throw new Error('credential-capability-invalid');
      const issuanceDigest = pairingCredentialIssuanceDigest(request);
      const current = now();
      const currentTime = parseTime(current, 'credential-clock-invalid');
      const intentExpiresAt = new Date(Math.min(expiresAt, currentTime + 5 * 60 * 1000)).toISOString();
      const credentialId = `credential_${issuanceDigest.slice('sha256:'.length, 'sha256:'.length + 32)}`;
      return atomic((database, appendEvent) => {
        const existing = database.prepare('SELECT request_id, issuance_digest, credential_id, intent_expires_at, claimed_at FROM credential_issue_intents WHERE request_id = ?').get(request.request_id) as { request_id: string; issuance_digest: string; credential_id: string; intent_expires_at: string; claimed_at: string | null } | undefined;
        if (existing) {
          if (existing.issuance_digest !== issuanceDigest.slice('sha256:'.length)) throw new Error('request-id-conflict');
          if (!existing.claimed_at && currentTime >= parseTime(existing.intent_expires_at, 'intent-expiry-invalid')) database.prepare('UPDATE credential_issue_intents SET intent_expires_at = ? WHERE request_id = ? AND claimed_at IS NULL').run(intentExpiresAt, request.request_id);
          return { status: 'duplicate', credential_id: existing.credential_id, issuance_digest: issuanceDigest, intent_expires_at: !existing.claimed_at && currentTime >= parseTime(existing.intent_expires_at, 'intent-expiry-invalid') ? intentExpiresAt : existing.intent_expires_at };
        }
        const occurredAt = current;
        database.prepare('INSERT INTO credential_issue_intents (request_id, issuance_digest, credential_id, network_id, node_id, intent_expires_at, issued_at, expires_at, claimed_at, token_hash, approval_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)').run(request.request_id, issuanceDigest.slice('sha256:'.length), credentialId, request.network_id, request.node_id, intentExpiresAt, request.issued_at, request.expires_at, JSON.stringify({ kind: 'pairing-approval', human_id: request.human_id, request_digest: request.request_digest, capabilities }));
        database.prepare('INSERT INTO credential_issue_events (request_id, event_type, occurred_at, result_json) VALUES (?, ?, ?, ?)').run(request.request_id, 'credential-issued', occurredAt, JSON.stringify({ credential_id: credentialId, issuance_digest: issuanceDigest, source: 'pairing-approval' }));
        if (appendEvent) {
          const event = createCredentialIssueIntentEvent({ request_id: request.request_id, network_id: request.network_id, node_id: request.node_id, credential_id: credentialId, issuance_digest: issuanceDigest, capabilities, issued_at: request.issued_at, expires_at: request.expires_at, intent_expires_at: intentExpiresAt });
          const currentRevision = (database.prepare('SELECT current_revision FROM network_metadata WHERE network_id = ?').get(request.network_id) as { current_revision: number }).current_revision;
          const result = appendEvent({ network_id: request.network_id, expected_revision: request.expected_revision ?? currentRevision, event, now: occurredAt });
          if (result.status === 'conflict') throw new Error(result.reason ?? 'event-conflict');
        }
        return { status: 'recorded', credential_id: credentialId, issuance_digest: issuanceDigest, intent_expires_at: intentExpiresAt };
      });
    },
    async claim(request) {
      for (const [value, error] of [[request.request_id, 'request-id-required'], [request.network_id, 'network-id-required'], [request.node_id, 'node-id-required'], [request.credential_id, 'credential-id-required']] as const) requireText(value, error);
      const current = request.now ?? now();
      const currentTime = parseTime(current, 'credential-clock-invalid');
      return atomic((database, appendEvent) => {
        const row = database.prepare('SELECT request_id, credential_id, network_id, node_id, intent_expires_at, expires_at, claimed_at, token_hash, revoked_at FROM credential_issue_intents WHERE request_id = ?').get(request.request_id) as { request_id: string; credential_id: string; network_id: string; node_id: string; intent_expires_at: string; expires_at: string; claimed_at: string | null; token_hash: string | null; revoked_at: string | null } | undefined;
        if (!row || row.credential_id !== request.credential_id || row.network_id !== request.network_id || row.node_id !== request.node_id) throw new Error('credential-not-available');
        if (row.revoked_at) throw new Error('credential-revoked');
        if (currentTime >= parseTime(row.intent_expires_at, 'intent-expiry-invalid')) throw new Error('intent-expired');
        if (currentTime >= parseTime(row.expires_at, 'credential-expiry-invalid')) throw new Error('credential-expired');
        if (row.claimed_at) return { status: 'duplicate', credential_id: row.credential_id, claimed_at: row.claimed_at };
        const claimedAt = current;
        const token = randomBytes(32).toString('base64url');
        database.prepare('UPDATE credential_issue_intents SET claimed_at = ?, token_hash = ? WHERE request_id = ? AND claimed_at IS NULL').run(claimedAt, hashToken(token), request.request_id);
        database.prepare('INSERT INTO credential_issue_events (request_id, event_type, occurred_at, result_json) VALUES (?, ?, ?, ?)').run(request.request_id, 'credential-claimed', claimedAt, JSON.stringify({ credential_id: row.credential_id, claimed_at: claimedAt }));
        if (appendEvent) {
          const currentRevision = (database.prepare('SELECT current_revision FROM network_metadata WHERE network_id = ?').get(request.network_id) as { current_revision: number }).current_revision;
          const result = appendEvent({ network_id: request.network_id, expected_revision: currentRevision, event: createCredentialClaimEvent({ request_id: request.request_id, credential_id: row.credential_id, claimed_at: claimedAt }), now: claimedAt });
          if (result.status === 'conflict') throw new Error(result.reason ?? 'event-conflict');
        }
        return { status: 'claimed', credential_id: row.credential_id, claimed_at: claimedAt, token };
      });
    },
    async claimForPairingSession(request) {
      for (const [value, error] of [[request.request_id, 'request-id-required'], [request.network_id, 'network-id-required'], [request.node_id, 'node-id-required'], [request.session_id, 'pairing-session-id-required']] as const) requireText(value, error);
      const row = await atomic((database) => database.prepare('SELECT credential_id FROM credential_issue_intents WHERE request_id = ? AND network_id = ? AND node_id = ?').get(request.request_id, request.network_id, request.node_id) as { credential_id: string } | undefined);
      if (!row) throw new Error('credential-not-available');
      return this.claim({ ...request, credential_id: row.credential_id });
    },
    async revoke(request) {
      requireText(request.credential_id, 'credential-id-required');
      requireText(request.request_id, 'request-id-required');
      requireText(request.reason, 'credential-revoke-reason-required');
      const revokedAt = request.now ?? now();
      parseTime(revokedAt, 'credential-revoked-time-invalid');
      return atomic((database, appendEvent) => {
        const row = database.prepare('SELECT revoked_at FROM credential_issue_intents WHERE credential_id = ?').get(request.credential_id) as { revoked_at: string | null } | undefined;
        if (!row) throw new Error('credential-not-found');
        if (row.revoked_at) return { status: 'duplicate', credential_id: request.credential_id, revoked_at: row.revoked_at };
        database.prepare('UPDATE credential_issue_intents SET revoked_at = ? WHERE credential_id = ?').run(revokedAt, request.credential_id);
        database.prepare('INSERT INTO credential_issue_events (request_id, event_type, occurred_at, result_json) SELECT request_id, ?, ?, ? FROM credential_issue_intents WHERE credential_id = ?').run('credential-revoked', revokedAt, JSON.stringify({ credential_id: request.credential_id, reason: request.reason }), request.credential_id);
        if (appendEvent) {
          const credential = database.prepare('SELECT request_id, network_id FROM credential_issue_intents WHERE credential_id = ?').get(request.credential_id) as { request_id: string; network_id: string };
          const currentRevision = (database.prepare('SELECT current_revision FROM network_metadata WHERE network_id = ?').get(credential.network_id) as { current_revision: number }).current_revision;
          const result = appendEvent({ network_id: credential.network_id, expected_revision: currentRevision, event: createCredentialRevokeEvent({ request_id: request.request_id, credential_id: request.credential_id, revoked_at: revokedAt, reason: request.reason }), now: revokedAt });
          if (result.status === 'conflict') throw new Error(result.reason ?? 'event-conflict');
        }
        return { status: 'revoked', credential_id: request.credential_id, revoked_at: revokedAt };
      });
    },
    async close() {
      if (db?.open) db.close();
    },
  };
}
