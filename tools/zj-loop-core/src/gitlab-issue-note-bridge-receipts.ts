import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GitLabIssueNoteBridgeEnvelope } from './gitlab-issue-note-bridge.js';

export const GITLAB_ISSUE_NOTE_BRIDGE_RECEIPT_SCHEMA = 'zj-loop.gitlab_issue_note_bridge_receipt.v1';
export const GITLAB_ISSUE_NOTE_BRIDGE_DEDUPE_SCHEMA = 'zj-loop.gitlab_issue_note_bridge_dedupe.v1';
export const GITLAB_ISSUE_NOTE_BRIDGE_PENDING_TIMEOUT_MS = 10 * 60 * 1000;
export const RESUME_GITLAB_ISSUE_NOTE_BRIDGE_TRIGGER = 'RESUME_GITLAB_ISSUE_NOTE_BRIDGE_TRIGGER';
export const PURGE_GITLAB_ISSUE_NOTE_BRIDGE_RECEIPTS = 'PURGE_GITLAB_ISSUE_NOTE_BRIDGE_RECEIPTS';

export type GitLabIssueNoteBridgeReceiptStatus =
  | 'received'
  | 'deduplicated'
  | 'trigger-pending'
  | 'triggered'
  | 'trigger-failed'
  | 'trigger-uncertain'
  | 'recovery-pending'
  | 'escalation-required';

export type GitLabIssueNoteBridgeReceipt = {
  schema: typeof GITLAB_ISSUE_NOTE_BRIDGE_RECEIPT_SCHEMA;
  event_id: string;
  project_hash: string;
  envelope: GitLabIssueNoteBridgeEnvelope;
  fingerprint: string;
  status: GitLabIssueNoteBridgeReceiptStatus;
  created_at: string;
  updated_at: string;
  trigger_pipeline_id: number | null;
  recovery_attempts: number;
  recovery_reason?: string;
};

export type GitLabIssueNoteBridgeDedupeRecord = {
  schema: typeof GITLAB_ISSUE_NOTE_BRIDGE_DEDUPE_SCHEMA;
  project_hash: string;
  dedupe_key: string;
  envelope_ref: string;
  event_id: string;
  route_id: string;
  target_ref: string;
  status: GitLabIssueNoteBridgeReceiptStatus;
  created_at: string;
  updated_at: string;
  trigger_pipeline_id: number | null;
  fingerprint: string;
  recovery_attempts: number;
};

export type GitLabIssueNoteBridgeReceiptStoreResult =
  | { status: 'created'; receipt: GitLabIssueNoteBridgeReceipt; dedupe: GitLabIssueNoteBridgeDedupeRecord; receipt_path: string; dedupe_path: string }
  | { status: 'duplicate'; receipt: GitLabIssueNoteBridgeReceipt; dedupe: GitLabIssueNoteBridgeDedupeRecord; receipt_path: string; dedupe_path: string }
  | { status: 'event-id-collision'; receipt: GitLabIssueNoteBridgeReceipt; receipt_path: string }
  | { status: 'receipt-persistence-failed'; receipt: GitLabIssueNoteBridgeReceipt; receipt_path: string; reason: string };

export function bridgeReceiptPaths(input: { root?: string; projectPath: string; eventId: string; dedupeKey: string }): { receipt: string; dedupe: string } {
  const projectHash = stableHash(input.projectPath);
  const receipt = `zj-loop/evidence/gitlab-issue-note-bridge/receipts/${projectHash}/${safeSegment(input.eventId)}.json`;
  const dedupe = `zj-loop/evidence/gitlab-issue-note-bridge/dedupe/${projectHash}/${safeSegment(input.dedupeKey)}.json`;
  return {
    receipt: path.resolve(input.root ?? '.', receipt),
    dedupe: path.resolve(input.root ?? '.', dedupe),
  };
}

export async function persistGitLabIssueNoteBridgeReceipt(input: {
  root?: string;
  envelope: GitLabIssueNoteBridgeEnvelope;
  routeId: string;
  now: string;
}): Promise<GitLabIssueNoteBridgeReceiptStoreResult> {
  const paths = bridgeReceiptPaths({
    root: input.root,
    projectPath: input.envelope.project_path,
    eventId: input.envelope.event_id,
    dedupeKey: input.envelope.dedupe_key,
  });
  const fingerprint = fingerprintEnvelope(input.envelope);
  const existingReceipt = await readJsonIfPresent<GitLabIssueNoteBridgeReceipt>(paths.receipt);
  if (existingReceipt) {
    if (existingReceipt.fingerprint !== fingerprint) {
      return { status: 'event-id-collision', receipt: existingReceipt, receipt_path: relativePath(input.root, paths.receipt) };
    }
    const existingDedupe = await readJsonIfPresent<GitLabIssueNoteBridgeDedupeRecord>(paths.dedupe);
    if (existingDedupe) {
      return {
        status: 'duplicate',
        receipt: existingReceipt,
        dedupe: existingDedupe,
        receipt_path: relativePath(input.root, paths.receipt),
        dedupe_path: relativePath(input.root, paths.dedupe),
      };
    }
  }

  const receipt: GitLabIssueNoteBridgeReceipt = existingReceipt ?? {
    schema: GITLAB_ISSUE_NOTE_BRIDGE_RECEIPT_SCHEMA,
    event_id: input.envelope.event_id,
    project_hash: stableHash(input.envelope.project_path),
    envelope: input.envelope,
    fingerprint,
    status: 'received',
    created_at: input.now,
    updated_at: input.now,
    trigger_pipeline_id: null,
    recovery_attempts: 0,
  };
  if (!existingReceipt) await writeExclusiveJson(paths.receipt, receipt);

  const dedupe: GitLabIssueNoteBridgeDedupeRecord = {
    schema: GITLAB_ISSUE_NOTE_BRIDGE_DEDUPE_SCHEMA,
    project_hash: stableHash(input.envelope.project_path),
    dedupe_key: input.envelope.dedupe_key,
    envelope_ref: relativePath(input.root, paths.receipt),
    event_id: input.envelope.event_id,
    route_id: input.routeId,
    target_ref: input.envelope.target_ref,
    status: 'deduplicated',
    created_at: input.now,
    updated_at: input.now,
    trigger_pipeline_id: null,
    fingerprint,
    recovery_attempts: 0,
  };
  try {
    await writeExclusiveJson(paths.dedupe, dedupe);
  } catch (error: unknown) {
    const recoveryPending = { ...receipt, status: 'recovery-pending' as const, updated_at: input.now, recovery_reason: 'dedupe-persistence-failed' };
    await writeAtomicJson(paths.receipt, recoveryPending);
    return {
      status: 'receipt-persistence-failed',
      receipt: recoveryPending,
      receipt_path: relativePath(input.root, paths.receipt),
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  const deduplicatedReceipt = { ...receipt, status: 'deduplicated' as const, updated_at: input.now };
  await writeAtomicJson(paths.receipt, deduplicatedReceipt);
  return {
    status: existingReceipt ? 'duplicate' : 'created',
    receipt: deduplicatedReceipt,
    dedupe,
    receipt_path: relativePath(input.root, paths.receipt),
    dedupe_path: relativePath(input.root, paths.dedupe),
  };
}

export async function updateGitLabIssueNoteBridgeReceipt(input: {
  root?: string;
  projectPath: string;
  eventId: string;
  dedupeKey: string;
  status: GitLabIssueNoteBridgeReceiptStatus;
  now: string;
  triggerPipelineId?: number | null;
  recoveryReason?: string;
  confirm?: string;
}): Promise<GitLabIssueNoteBridgeReceipt> {
  const paths = bridgeReceiptPaths(input);
  const receipt = await readJsonIfPresent<GitLabIssueNoteBridgeReceipt>(paths.receipt);
  const dedupe = await readJsonIfPresent<GitLabIssueNoteBridgeDedupeRecord>(paths.dedupe);
  if (!receipt || !dedupe) throw new Error('receipt-persistence-required');
  if (receipt.envelope.dedupe_key !== input.dedupeKey || receipt.event_id !== input.eventId) throw new Error('receipt-binding-mismatch');
  if (input.status === 'trigger-pending' && receipt.status !== 'deduplicated' && receipt.status !== 'recovery-pending' && receipt.status !== 'trigger-uncertain') throw new Error('receipt-transition-invalid');
  if (input.status === 'triggered' && !input.triggerPipelineId) throw new Error('trigger-pipeline-id-required');
  if (input.status === 'recovery-pending' && receipt.status !== 'trigger-pending') throw new Error('receipt-transition-invalid');
  if (input.status === 'trigger-pending' && (receipt.status === 'recovery-pending' || receipt.status === 'trigger-uncertain') && input.confirm !== RESUME_GITLAB_ISSUE_NOTE_BRIDGE_TRIGGER) throw new Error('resume-confirmation-required');
  if (input.status === 'trigger-pending' && receipt.status === 'trigger-uncertain' && receipt.recovery_attempts >= 1) throw new Error('recovery-attempt-limit');
  if ((input.status === 'trigger-pending' || input.status === 'triggered') && receipt.recovery_attempts > 1) throw new Error('recovery-attempt-limit');
  const next: GitLabIssueNoteBridgeReceipt = {
    ...receipt,
    status: input.status,
    updated_at: input.now,
    trigger_pipeline_id: input.triggerPipelineId === undefined ? receipt.trigger_pipeline_id : input.triggerPipelineId,
    recovery_attempts: input.status === 'trigger-pending' && (receipt.status === 'recovery-pending' || receipt.status === 'trigger-uncertain') ? receipt.recovery_attempts + 1 : receipt.recovery_attempts,
    ...(input.recoveryReason ? { recovery_reason: input.recoveryReason } : {}),
  };
  const nextDedupe = { ...dedupe, status: next.status, updated_at: input.now, trigger_pipeline_id: next.trigger_pipeline_id, recovery_attempts: next.recovery_attempts };
  await writeAtomicJson(paths.receipt, next);
  await writeAtomicJson(paths.dedupe, nextDedupe);
  return next;
}

export function classifyGitLabIssueNoteBridgePending(input: { status: GitLabIssueNoteBridgeReceiptStatus; updatedAt: string; now: string }): GitLabIssueNoteBridgeReceiptStatus {
  if (input.status !== 'trigger-pending') return input.status;
  return Date.parse(input.now) - Date.parse(input.updatedAt) >= GITLAB_ISSUE_NOTE_BRIDGE_PENDING_TIMEOUT_MS
    ? 'trigger-uncertain'
    : 'trigger-pending';
}

export async function purgeGitLabIssueNoteBridgeReceipts(input: {
  root?: string;
  now: string;
  retentionDays?: number;
  dryRun?: boolean;
  confirm?: string;
}): Promise<{ status: 'dry-run' | 'purged' | 'blocked'; reason?: string; evidence_path: string; candidates: string[] }> {
  const root = path.resolve(input.root ?? '.');
  const retentionDays = input.retentionDays ?? 90;
  if (!Number.isInteger(retentionDays) || retentionDays <= 0) throw new Error('retention-days-invalid');
  if (input.dryRun === false && input.confirm !== PURGE_GITLAB_ISSUE_NOTE_BRIDGE_RECEIPTS) {
    return { status: 'blocked', reason: 'purge-confirmation-required', evidence_path: '', candidates: [] };
  }
  const receiptRoot = path.join(root, 'zj-loop/evidence/gitlab-issue-note-bridge/receipts');
  const candidates: Array<{ receiptPath: string; dedupePath: string }> = [];
  for (const projectEntry of await readDirectory(receiptRoot)) {
    if (!projectEntry.isDirectory()) continue;
    for (const receiptEntry of await readDirectory(path.join(receiptRoot, projectEntry.name))) {
      if (!receiptEntry.isFile() || !receiptEntry.name.endsWith('.json')) continue;
      const receiptPath = path.join(receiptRoot, projectEntry.name, receiptEntry.name);
      const receipt = await readJsonIfPresent<GitLabIssueNoteBridgeReceipt>(receiptPath);
      if (!receipt || receipt.status === 'recovery-pending' || receipt.status === 'trigger-pending') continue;
      if (Date.parse(input.now) - Date.parse(receipt.updated_at) < retentionDays * 24 * 60 * 60 * 1000) continue;
      candidates.push({
        receiptPath,
        dedupePath: path.join(root, 'zj-loop/evidence/gitlab-issue-note-bridge/dedupe', projectEntry.name, `${safeSegment(receipt.envelope.dedupe_key)}.json`),
      });
    }
  }
  const evidencePath = `zj-loop/evidence/gitlab-issue-note-bridge/cleanup/${safeSegment(input.now)}.json`;
  await writeAtomicJson(path.join(root, evidencePath), {
    schema: 'zj-loop.gitlab_issue_note_bridge_receipt_cleanup.v1',
    created_at: input.now,
    retention_days: retentionDays,
    dry_run: input.dryRun !== false,
    candidate_count: candidates.length,
    candidates: candidates.map((item) => relativePath(root, item.receiptPath)),
    side_effects_executed: input.dryRun === false,
  });
  if (input.dryRun !== false) return { status: 'dry-run', evidence_path: evidencePath, candidates: candidates.map((item) => relativePath(root, item.receiptPath)) };
  for (const candidate of candidates) {
    await unlink(candidate.receiptPath).catch(() => undefined);
    await unlink(candidate.dedupePath).catch(() => undefined);
  }
  return { status: 'purged', evidence_path: evidencePath, candidates: candidates.map((item) => relativePath(root, item.receiptPath)) };
}

export function fingerprintEnvelope(envelope: GitLabIssueNoteBridgeEnvelope): string {
  return stableHash(JSON.stringify(envelope));
}

async function writeExclusiveJson(target: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const handle = await open(target, 'wx');
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
  } catch (error) {
    await unlink(target).catch(() => undefined);
    throw error;
  } finally {
    await handle.close();
  }
}

async function writeAtomicJson(target: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, target);
}

async function readJsonIfPresent<T>(target: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(target, 'utf8')) as T;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function readDirectory(target: string) {
  try {
    return await readdir(target, { withFileTypes: true });
  } catch (error: any) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function relativePath(root: string | undefined, target: string): string {
  return path.relative(path.resolve(root ?? '.'), target);
}

function safeSegment(value: string): string {
  return stableHash(value);
}

function stableHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
