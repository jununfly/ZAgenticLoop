import { type Server } from 'node:http';
import type { PairingRequestProjection } from './pairing-projection.js';
import type { HumanSigner } from './human-signer.js';
import type { GraphAtomUiReadModel } from './graph-atom-ui-read-model.js';
import type { RealAgentDogfoodGraphReviewReadModel } from './real-agent-dogfood-graph-review-read-model.js';
import type { OpnMessageReadModel } from './opn-message-read-model.js';
import type { TransportEnvelope } from './transport-contract.js';
import type { OpnReadOnlyGraphUiReadModel } from './opn-readonly-graph-ui-read-model.js';
import { type HumanApprovalContext } from './human-authority.js';
import { createHumanActionDecision, type HumanActionRequest } from './human-action.js';
import type { RealAgentDogfoodApprovalUiUpstream } from './real-agent-dogfood-approval-ui-upstream.js';
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
    outbox?(): Promise<{
        messages: OpnMessageReadModel[];
    }>;
    sendMessage?(input: {
        network_id: string;
        envelope: TransportEnvelope;
    }): Promise<Record<string, unknown>>;
    graphAtoms?(): Promise<{
        graphs: OpnReadOnlyGraphUiReadModel[];
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
    humanActions?(): Promise<{
        requests: Array<HumanActionRequest & {
            status?: string;
            decision?: Record<string, unknown>;
        }>;
    }>;
    decideHumanAction?(input: {
        network_id: string;
        request: HumanActionRequest;
        decision: Awaited<ReturnType<typeof createHumanActionDecision>>;
    }): Promise<Record<string, unknown>>;
    outboundTasks?(): Promise<{
        requests: import('./opn-outbound-task-approval.js').OutboundTaskApproval[];
    }>;
    decideOutboundTask?(input: {
        network_id: string;
        approval: import('./opn-outbound-task-approval.js').OutboundTaskApproval;
        decision: 'approved' | 'rejected';
        human_id: string;
        human_note: string;
    }): Promise<Record<string, unknown>>;
    agentTaskChains?(): Promise<Record<string, unknown>>;
};
export type HumanApprovalUiGraphUpstream = {
    list(): Promise<{
        events: Array<GraphAtomUiReadModel | RealAgentDogfoodGraphReviewReadModel>;
    }>;
    get(input: {
        event_id: string;
    }): Promise<{
        event: GraphAtomUiReadModel | RealAgentDogfoodGraphReviewReadModel | null;
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
        review_handoff_digest?: string;
        verification_digest?: string;
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
    session_store_path?: string;
    now?: () => string;
    human_device?: {
        device_key_id: string;
        device_fingerprint: string;
    };
    dogfoodApprovals?: RealAgentDogfoodApprovalUiUpstream;
    graphFeatureStatus?: {
        status: 'ready' | 'not-configured' | 'invalid-config';
        reason?: string;
    };
    control_token?: string;
    on_shutdown?: () => Promise<void> | void;
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
