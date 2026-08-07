import type { HumanSignature, HumanSigner, HumanSignerIdentity } from './human-signer.js';
export declare const HUMAN_ACTION_REQUEST_SCHEMA: "zj-loop.human_action_request.v1";
export declare const HUMAN_ACTION_DECISION_SCHEMA: "zj-loop.human_action_decision.v1";
export type HumanActionEvidenceRef = {
    artifact_id: string;
    kind: 'artifact' | 'evidence';
};
export type HumanActionRequest = {
    schema: typeof HUMAN_ACTION_REQUEST_SCHEMA;
    network_id: string;
    request_id: string;
    action_type: string;
    reason: string;
    context: Record<string, unknown>;
    evidence_refs: HumanActionEvidenceRef[];
    requester_node_id: string;
    target_node_id?: string;
    created_at: string;
    expires_at: string;
    status: 'pending';
    request_digest: string;
    side_effects_executed: false;
};
export type HumanActionDecision = {
    schema: typeof HUMAN_ACTION_DECISION_SCHEMA;
    network_id: string;
    request_id: string;
    request_digest: string;
    decision: 'approved' | 'rejected';
    reason: string;
    human_id: string;
    human_identity: HumanSignerIdentity;
    decided_at: string;
    signature: HumanSignature;
    decision_digest: string;
    side_effects_executed: false;
};
type RequestInput = Omit<HumanActionRequest, 'schema' | 'status' | 'request_digest' | 'side_effects_executed'>;
export declare function createHumanActionRequest(input: RequestInput): HumanActionRequest;
export declare function createHumanActionDecision(input: {
    signer: HumanSigner;
    request: HumanActionRequest;
    decision: HumanActionDecision['decision'];
    reason: string;
    decided_at: string;
}): Promise<HumanActionDecision>;
export declare function verifyHumanActionDecision(input: {
    request: HumanActionRequest;
    decision: HumanActionDecision;
    now?: string;
}): {
    status: 'valid';
} | {
    status: 'blocked';
    reason: string;
};
export {};
