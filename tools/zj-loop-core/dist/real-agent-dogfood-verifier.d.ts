import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
import { type RealAgentDogfoodLifecycle } from './real-agent-dogfood-lifecycle.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const REAL_AGENT_DOGFOOD_VERIFICATION_SCHEMA: "zj-loop.real_agent_dogfood_verification.v1";
import { type RealAgentDogfoodPostRunProof } from './real-agent-dogfood-post-run-proof.js';
export type RealAgentDogfoodExecutionFact = {
    execution_id: string;
    attempt: number;
    worker_id: string;
    status: 'completed' | 'failed' | 'cancelled' | 'timed-out';
    success: boolean;
    post_run_proof: RealAgentDogfoodPostRunProof | null;
};
export type RealAgentDogfoodVerificationResult = {
    status: 'review-pending' | 'blocked' | 'outcome-uncertain';
    verification_status: 'passed' | 'blocked';
    reason_code: string;
    next_action: string;
    verification_digest: string;
};
export declare function verifyRealAgentDogfoodExecution(input: {
    stateStore: SqliteStateStore;
    evidenceStore: ContentAddressedEvidenceStore;
    lifecycle: RealAgentDogfoodLifecycle;
    verifier_id: string;
    provider_fact_digest: string;
    stdout_digest: string;
    stderr_digest: string;
    expected_revision: number;
    now?: string;
}): Promise<RealAgentDogfoodVerificationResult>;
