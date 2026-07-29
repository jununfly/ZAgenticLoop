import { type Server, type ServerOptions } from 'node:https';
import type { PairingRecordStore } from './pairing-record-store.js';
export declare const PAIRING_HTTP_SCHEMA: "zj-loop.pairing_http.v1";
export declare function createPairingHttpServer(input: {
    tls: ServerOptions;
    recordStore: PairingRecordStore;
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
