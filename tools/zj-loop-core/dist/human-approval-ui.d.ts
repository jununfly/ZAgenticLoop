import { type Server } from 'node:http';
import type { PairingRequestProjection } from './pairing-projection.js';
import type { HumanSigner } from './human-signer.js';
import { type HumanApprovalContext } from './human-authority.js';
export declare const HUMAN_APPROVAL_UI_SCHEMA: "zj-loop.human_approval_ui.v1";
export type HumanApprovalUiUpstream = {
    list(input: {
        network_id: string;
    }): Promise<{
        requests: PairingRequestProjection[];
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
export type HumanApprovalUiServerInput = {
    signer: HumanSigner;
    network_id: string;
    upstream: HumanApprovalUiUpstream;
    bootstrap_token?: string;
    session_ttl_ms?: number;
    now?: () => string;
};
export type PairingHttpUpstreamInput = {
    endpoint: string;
    authorization?: string;
    ca?: string;
    cert?: string;
    key?: string;
};
export declare function createHumanApprovalUiServer(input: HumanApprovalUiServerInput): Server;
export declare function createPairingHttpUpstream(input: PairingHttpUpstreamInput): HumanApprovalUiUpstream;
