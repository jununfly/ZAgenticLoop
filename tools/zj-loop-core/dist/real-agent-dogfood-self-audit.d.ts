import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
import { type RealAgentDogfoodLifecycle } from './real-agent-dogfood-lifecycle.js';
import { type RealAgentDogfoodResultEnvelope } from './real-agent-dogfood-report.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const REAL_AGENT_DOGFOOD_SELF_AUDIT_SCHEMA: "zj-loop.real_agent_dogfood_self_audit.v1";
type SelfAuditProvider = {
    run(): Promise<RealAgentDogfoodResultEnvelope>;
};
type IndependentVerifier = {
    verify(input: {
        envelope: RealAgentDogfoodResultEnvelope;
        evidence_digest: string;
        verifier_id: string;
    }): Promise<{
        status: 'passed' | 'blocked';
        reason_code?: string;
    }>;
};
export type RealAgentDogfoodSelfAuditResult = {
    status: 'review-pending' | 'blocked' | 'outcome-uncertain';
    evidence_digest: string | null;
    reason_code: string;
    next_action: string;
    revision: number;
};
export declare function runRealAgentDogfoodSelfAudit(input: {
    stateStore: SqliteStateStore;
    evidenceStore: ContentAddressedEvidenceStore;
    lifecycle: RealAgentDogfoodLifecycle;
    provider_opt_in: boolean;
    provider: SelfAuditProvider;
    verifier_id: string;
    independent_verifier: IndependentVerifier;
    expected_revision: number;
    now?: string;
}): Promise<RealAgentDogfoodSelfAuditResult>;
export {};
