import { type HumanSignature, type HumanSigner, type HumanSignerIdentity } from './human-signer.js';
import { type ReviewHandoffRecord } from './review-handoff.js';
export declare const HUMAN_ACCEPTANCE_SCHEMA: "zj-loop.human_acceptance.v1";
export type HumanAcceptanceRecord = {
    schema: typeof HUMAN_ACCEPTANCE_SCHEMA;
    network_id: string;
    event_id: string;
    plan_id: string;
    plan_revision: number;
    plan_digest: string;
    review_handoff_digest: string;
    verification_digest: string;
    human_id: string;
    signer_fingerprint: string;
    decision: 'accepted';
    accepted_at: string;
    canonical_payload_digest: string;
    signature: HumanSignature;
    side_effects_executed: false;
};
export declare function createHumanAcceptance(input: {
    signer: HumanSigner;
    handoff: ReviewHandoffRecord;
    plan_digest: string;
    accepted_at: string;
}): Promise<HumanAcceptanceRecord>;
export declare function validateHumanAcceptance(input: {
    acceptance: HumanAcceptanceRecord;
    identity: HumanSignerIdentity;
    handoff?: ReviewHandoffRecord;
    now?: string;
}): {
    status: 'valid' | 'blocked';
    errors: string[];
};
