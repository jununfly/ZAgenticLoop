import type { GitLabIssueNoteBridgeEnvelope } from './gitlab-issue-note-bridge.js';
export declare const GITLAB_ISSUE_NOTE_BRIDGE_RECEIPT_SCHEMA = "zj-loop.gitlab_issue_note_bridge_receipt.v1";
export declare const GITLAB_ISSUE_NOTE_BRIDGE_DEDUPE_SCHEMA = "zj-loop.gitlab_issue_note_bridge_dedupe.v1";
export declare const GITLAB_ISSUE_NOTE_BRIDGE_PENDING_TIMEOUT_MS: number;
export declare const RESUME_GITLAB_ISSUE_NOTE_BRIDGE_TRIGGER = "RESUME_GITLAB_ISSUE_NOTE_BRIDGE_TRIGGER";
export declare const PURGE_GITLAB_ISSUE_NOTE_BRIDGE_RECEIPTS = "PURGE_GITLAB_ISSUE_NOTE_BRIDGE_RECEIPTS";
export type GitLabIssueNoteBridgeReceiptStatus = 'received' | 'deduplicated' | 'trigger-pending' | 'triggered' | 'trigger-failed' | 'trigger-uncertain' | 'recovery-pending' | 'escalation-required';
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
export type GitLabIssueNoteBridgeReceiptStoreResult = {
    status: 'created';
    receipt: GitLabIssueNoteBridgeReceipt;
    dedupe: GitLabIssueNoteBridgeDedupeRecord;
    receipt_path: string;
    dedupe_path: string;
} | {
    status: 'duplicate';
    receipt: GitLabIssueNoteBridgeReceipt;
    dedupe: GitLabIssueNoteBridgeDedupeRecord;
    receipt_path: string;
    dedupe_path: string;
} | {
    status: 'event-id-collision';
    receipt: GitLabIssueNoteBridgeReceipt;
    receipt_path: string;
} | {
    status: 'receipt-persistence-failed';
    receipt: GitLabIssueNoteBridgeReceipt;
    receipt_path: string;
    reason: string;
};
export declare function bridgeReceiptPaths(input: {
    root?: string;
    projectPath: string;
    eventId: string;
    dedupeKey: string;
}): {
    receipt: string;
    dedupe: string;
};
export declare function persistGitLabIssueNoteBridgeReceipt(input: {
    root?: string;
    envelope: GitLabIssueNoteBridgeEnvelope;
    routeId: string;
    now: string;
}): Promise<GitLabIssueNoteBridgeReceiptStoreResult>;
export declare function updateGitLabIssueNoteBridgeReceipt(input: {
    root?: string;
    projectPath: string;
    eventId: string;
    dedupeKey: string;
    status: GitLabIssueNoteBridgeReceiptStatus;
    now: string;
    triggerPipelineId?: number | null;
    recoveryReason?: string;
    confirm?: string;
}): Promise<GitLabIssueNoteBridgeReceipt>;
export declare function classifyGitLabIssueNoteBridgePending(input: {
    status: GitLabIssueNoteBridgeReceiptStatus;
    updatedAt: string;
    now: string;
}): GitLabIssueNoteBridgeReceiptStatus;
export declare function purgeGitLabIssueNoteBridgeReceipts(input: {
    root?: string;
    now: string;
    retentionDays?: number;
    dryRun?: boolean;
    confirm?: string;
}): Promise<{
    status: 'dry-run' | 'purged' | 'blocked';
    reason?: string;
    evidence_path: string;
    candidates: string[];
}>;
export declare function fingerprintEnvelope(envelope: GitLabIssueNoteBridgeEnvelope): string;
