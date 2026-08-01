export declare const EVIDENCE_RETENTION_DRY_RUN_SCHEMA: "zj-loop.evidence_retention_dry_run.v1";
type Item = {
    artifact_id: string;
    network_id: string;
    task_id: string;
    execution_id: string;
    attempt: number;
    artifact_digest: string;
    created_at: string;
    review_status: 'accepted' | 'pending' | 'blocked';
    lifecycle_digest: string;
    retained_until: string;
};
type PolicySnapshot = {
    version: string;
    purpose: 'retention-dry-run';
    network_id: string;
    task_ids: string[];
    scope_digest: string;
    state_revision: number;
    policy_digest: string;
    effective_at: string;
    expires_at: string;
};
export type EvidenceRetentionDryRun = {
    schema: typeof EVIDENCE_RETENTION_DRY_RUN_SCHEMA;
    policy: PolicySnapshot;
    now: string;
    status: 'passed' | 'blocked';
    side_effects_executed: false;
    items: Array<Item & {
        decision: 'eligible' | 'blocked' | 'not-due';
        reason?: string;
    }>;
    report_digest: string;
};
export declare function buildEvidenceRetentionDryRun(input: {
    policy: PolicySnapshot;
    now: string;
    items: Item[];
}): EvidenceRetentionDryRun;
export declare function evidenceRetentionDryRunDigest(value: EvidenceRetentionDryRun): string;
export {};
