import type { TransportAdapter } from './transport-contract.js';
export declare const TLS_TRANSPORT_PROTOCOL: "transport.v1";
type TlsTransportAdapterInput = {
    endpoint: string;
    ca: string | Buffer;
    cert: string | Buffer;
    key: string | Buffer;
    bearer_token: string;
    protocol_version?: string;
    request_timeout_ms?: number;
};
export declare function createTlsTransportAdapter(input: TlsTransportAdapterInput): TransportAdapter;
export {};
