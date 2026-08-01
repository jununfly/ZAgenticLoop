export declare const EVIDENCE_ACCESS_AUDIT_SCHEMA: "zj-loop.evidence_access_audit.v1";
type Input = {
    network_id: string;
    task_id: string;
    execution_id: string;
    attempt: number;
    actor: string;
    role: string;
    purpose: string;
    authorization_scope_digest: string;
    decision: 'allowed' | 'blocked';
    returned_content_digest: string | null;
    occurred_at: string;
    state_revision: number;
};
export type EvidenceAccessAudit = Input & {
    schema: typeof EVIDENCE_ACCESS_AUDIT_SCHEMA;
    side_effects_executed: false;
    audit_digest: string;
};
export declare function buildEvidenceAccessAudit(input: Input): EvidenceAccessAudit;
export declare function evidenceAccessAuditDigest(value: EvidenceAccessAudit): string;
export {};
