import { type Server } from 'node:http';
import type { PairingRequestProjection } from './pairing-projection.js';
import type { HumanSigner } from './human-signer.js';
import type { GraphAtomUiReadModel } from './graph-atom-ui-read-model.js';
import type { OpnMessageReadModel } from './opn-message-read-model.js';
import { type HumanApprovalContext } from './human-authority.js';
export declare const HUMAN_APPROVAL_UI_SCHEMA: "zj-loop.human_approval_ui.v1";
export type HumanApprovalUiUpstream = {
    list(input: {
        network_id: string;
    }): Promise<{
        requests: PairingRequestProjection[];
    }>;
    connection?(): Promise<Record<string, unknown>>;
    messages?(): Promise<{
        messages: OpnMessageReadModel[];
    }>;
    approve?(input: {
        network_id: string;
        request_id: string;
        request_digest: string;
        approved_capabilities: string[];
        context: HumanApprovalContext;
    }): Promise<Record<string, unknown>>;
    reject?(input: {
        network_id: string;
        request_id: string;
        request_digest: string;
        reason: string;
        context: HumanApprovalContext;
    }): Promise<Record<string, unknown>>;
    evidence?(input: {
        network_id: string;
        evidence_id: string;
    }): Promise<Record<string, unknown>>;
};
export type HumanApprovalUiGraphUpstream = {
    list(): Promise<{
        events: GraphAtomUiReadModel[];
    }>;
    get(input: {
        event_id: string;
    }): Promise<{
        event: GraphAtomUiReadModel | null;
    }>;
    evidence(input: {
        event_id: string;
    }): Promise<{
        evidence: Array<{
            kind: string;
            artifact_id: string;
            digest: string;
        }>;
    }>;
    accept?(input: {
        network_id: string;
        event_id: string;
        plan_id: string;
        plan_revision: number;
        plan_digest: string;
        review_handoff_digest: string;
        verification_digest: string;
        accepted_at: string;
        signer: HumanSigner;
    }): Promise<Record<string, unknown>>;
};
export type HumanApprovalUiServerInput = {
    signer: HumanSigner;
    network_id: string;
    upstream: HumanApprovalUiUpstream;
    graph?: HumanApprovalUiGraphUpstream;
    bootstrap_token?: string;
    session_ttl_ms?: number;
    now?: () => string;
    human_device?: {
        device_key_id: string;
        device_fingerprint: string;
    };
};
export type PairingHttpUpstreamInput = {
    endpoint: string;
    network_id?: string;
    authorization?: string;
    ca?: string;
    cert?: string;
    key?: string;
    device_fingerprint?: string;
};
export declare function createHumanApprovalUiServer(input: HumanApprovalUiServerInput): Server;
export declare function createPairingHttpUpstream(input: PairingHttpUpstreamInput): HumanApprovalUiUpstream;
