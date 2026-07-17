import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
export const GITLAB_ISSUE_NOTE_BRIDGE_RECEIPT_SCHEMA = 'zj-loop.gitlab_issue_note_bridge_receipt.v1';
export const GITLAB_ISSUE_NOTE_BRIDGE_DEDUPE_SCHEMA = 'zj-loop.gitlab_issue_note_bridge_dedupe.v1';
export const GITLAB_ISSUE_NOTE_BRIDGE_PENDING_TIMEOUT_MS = 10 * 60 * 1000;
export const RESUME_GITLAB_ISSUE_NOTE_BRIDGE_TRIGGER = 'RESUME_GITLAB_ISSUE_NOTE_BRIDGE_TRIGGER';
export const PURGE_GITLAB_ISSUE_NOTE_BRIDGE_RECEIPTS = 'PURGE_GITLAB_ISSUE_NOTE_BRIDGE_RECEIPTS';
export function bridgeReceiptPaths(input) {
    const projectHash = stableHash(input.projectPath);
    const receipt = `zj-loop/evidence/gitlab-issue-note-bridge/receipts/${projectHash}/${safeSegment(input.eventId)}.json`;
    const dedupe = `zj-loop/evidence/gitlab-issue-note-bridge/dedupe/${projectHash}/${safeSegment(input.dedupeKey)}.json`;
    return {
        receipt: path.resolve(input.root ?? '.', receipt),
        dedupe: path.resolve(input.root ?? '.', dedupe),
    };
}
export async function persistGitLabIssueNoteBridgeReceipt(input) {
    const paths = bridgeReceiptPaths({
        root: input.root,
        projectPath: input.envelope.project_path,
        eventId: input.envelope.event_id,
        dedupeKey: input.envelope.dedupe_key,
    });
    const fingerprint = fingerprintEnvelope(input.envelope);
    const existingReceipt = await readJsonIfPresent(paths.receipt);
    if (existingReceipt) {
        if (existingReceipt.fingerprint !== fingerprint) {
            return { status: 'event-id-collision', receipt: existingReceipt, receipt_path: relativePath(input.root, paths.receipt) };
        }
        const existingDedupe = await readJsonIfPresent(paths.dedupe);
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
    const receipt = existingReceipt ?? {
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
    if (!existingReceipt)
        await writeExclusiveJson(paths.receipt, receipt);
    const dedupe = {
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
    }
    catch (error) {
        const recoveryPending = { ...receipt, status: 'recovery-pending', updated_at: input.now, recovery_reason: 'dedupe-persistence-failed' };
        await writeAtomicJson(paths.receipt, recoveryPending);
        return {
            status: 'receipt-persistence-failed',
            receipt: recoveryPending,
            receipt_path: relativePath(input.root, paths.receipt),
            reason: error instanceof Error ? error.message : String(error),
        };
    }
    const deduplicatedReceipt = { ...receipt, status: 'deduplicated', updated_at: input.now };
    await writeAtomicJson(paths.receipt, deduplicatedReceipt);
    return {
        status: existingReceipt ? 'duplicate' : 'created',
        receipt: deduplicatedReceipt,
        dedupe,
        receipt_path: relativePath(input.root, paths.receipt),
        dedupe_path: relativePath(input.root, paths.dedupe),
    };
}
export async function updateGitLabIssueNoteBridgeReceipt(input) {
    const paths = bridgeReceiptPaths(input);
    const receipt = await readJsonIfPresent(paths.receipt);
    const dedupe = await readJsonIfPresent(paths.dedupe);
    if (!receipt || !dedupe)
        throw new Error('receipt-persistence-required');
    if (receipt.envelope.dedupe_key !== input.dedupeKey || receipt.event_id !== input.eventId)
        throw new Error('receipt-binding-mismatch');
    if (input.status === 'trigger-pending' && receipt.status !== 'deduplicated' && receipt.status !== 'recovery-pending' && receipt.status !== 'trigger-uncertain')
        throw new Error('receipt-transition-invalid');
    if (input.status === 'triggered' && !input.triggerPipelineId)
        throw new Error('trigger-pipeline-id-required');
    if (input.status === 'recovery-pending' && receipt.status !== 'trigger-pending')
        throw new Error('receipt-transition-invalid');
    if (input.status === 'trigger-pending' && (receipt.status === 'recovery-pending' || receipt.status === 'trigger-uncertain') && input.confirm !== RESUME_GITLAB_ISSUE_NOTE_BRIDGE_TRIGGER)
        throw new Error('resume-confirmation-required');
    if (input.status === 'trigger-pending' && receipt.status === 'trigger-uncertain' && receipt.recovery_attempts >= 1)
        throw new Error('recovery-attempt-limit');
    if ((input.status === 'trigger-pending' || input.status === 'triggered') && receipt.recovery_attempts > 1)
        throw new Error('recovery-attempt-limit');
    const next = {
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
export function classifyGitLabIssueNoteBridgePending(input) {
    if (input.status !== 'trigger-pending')
        return input.status;
    return Date.parse(input.now) - Date.parse(input.updatedAt) >= GITLAB_ISSUE_NOTE_BRIDGE_PENDING_TIMEOUT_MS
        ? 'trigger-uncertain'
        : 'trigger-pending';
}
export async function purgeGitLabIssueNoteBridgeReceipts(input) {
    const root = path.resolve(input.root ?? '.');
    const retentionDays = input.retentionDays ?? 90;
    if (!Number.isInteger(retentionDays) || retentionDays <= 0)
        throw new Error('retention-days-invalid');
    if (input.dryRun === false && input.confirm !== PURGE_GITLAB_ISSUE_NOTE_BRIDGE_RECEIPTS) {
        return { status: 'blocked', reason: 'purge-confirmation-required', evidence_path: '', candidates: [] };
    }
    const receiptRoot = path.join(root, 'zj-loop/evidence/gitlab-issue-note-bridge/receipts');
    const candidates = [];
    for (const projectEntry of await readDirectory(receiptRoot)) {
        if (!projectEntry.isDirectory())
            continue;
        for (const receiptEntry of await readDirectory(path.join(receiptRoot, projectEntry.name))) {
            if (!receiptEntry.isFile() || !receiptEntry.name.endsWith('.json'))
                continue;
            const receiptPath = path.join(receiptRoot, projectEntry.name, receiptEntry.name);
            const receipt = await readJsonIfPresent(receiptPath);
            if (!receipt || receipt.status === 'recovery-pending' || receipt.status === 'trigger-pending')
                continue;
            if (Date.parse(input.now) - Date.parse(receipt.updated_at) < retentionDays * 24 * 60 * 60 * 1000)
                continue;
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
    if (input.dryRun !== false)
        return { status: 'dry-run', evidence_path: evidencePath, candidates: candidates.map((item) => relativePath(root, item.receiptPath)) };
    for (const candidate of candidates) {
        await unlink(candidate.receiptPath).catch(() => undefined);
        await unlink(candidate.dedupePath).catch(() => undefined);
    }
    return { status: 'purged', evidence_path: evidencePath, candidates: candidates.map((item) => relativePath(root, item.receiptPath)) };
}
export function fingerprintEnvelope(envelope) {
    return stableHash(JSON.stringify(envelope));
}
async function writeExclusiveJson(target, value) {
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    try {
        await link(temporary, target);
    }
    finally {
        await unlink(temporary).catch(() => undefined);
    }
}
async function writeAtomicJson(target, value) {
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    await rename(temporary, target);
}
async function readJsonIfPresent(target) {
    try {
        return JSON.parse(await readFile(target, 'utf8'));
    }
    catch (error) {
        if (error?.code === 'ENOENT')
            return null;
        throw error;
    }
}
async function readDirectory(target) {
    try {
        return await readdir(target, { withFileTypes: true });
    }
    catch (error) {
        if (error?.code === 'ENOENT')
            return [];
        throw error;
    }
}
function relativePath(root, target) {
    return path.relative(path.resolve(root ?? '.'), target);
}
function safeSegment(value) {
    return stableHash(value);
}
function stableHash(value) {
    return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
