import { type Server, type ServerOptions } from 'node:https';
import type { PairingRecordStore } from './pairing-record-store.js';
import type { HumanApprovalContext } from './human-authority.js';
export declare const PAIRING_HTTP_SCHEMA: "zj-loop.pairing_http.v1";
export type PairingOwnerAuthenticator = {
    authenticate(input: {
        action: 'pairing.list' | 'pairing.approve' | 'pairing.reject';
        authorization: string | null;
        request_id?: string;
        request_digest?: string;
        context?: HumanApprovalContext;
    }): Promise<{
        status: 'allowed' | 'blocked';
        human_id?: string;
        reason?: string;
    }> | {
        status: 'allowed' | 'blocked';
        human_id?: string;
        reason?: string;
    };
};
export declare function createPairingHttpServer(input: {
    tls: ServerOptions;
    recordStore: PairingRecordStore;
    ownerAuthenticator?: PairingOwnerAuthenticator | null;
    readinessCheck?: {
        check(): Promise<{
            status: 'ready' | 'not-ready';
            reason?: string;
        }> | {
            status: 'ready' | 'not-ready';
            reason?: string;
        };
    } | null;
    now?: () => string;
    session_ttl_ms?: number;
}): Server;
