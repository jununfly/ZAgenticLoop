export declare const PROVIDER_AUTH_IPC_FRAME_SCHEMA: "zj-loop.provider_auth_ipc_frame.v1";
export declare const PROVIDER_AUTH_IPC_MAX_FRAME_BYTES: number;
declare const KINDS: readonly ["challenge", "launch-accepted", "stdout", "stderr", "result", "error", "exit", "cleanup"];
export type ProviderAuthIpcFrameKind = typeof KINDS[number];
export type ProviderAuthIpcFrame = {
    schema: typeof PROVIDER_AUTH_IPC_FRAME_SCHEMA;
    version: 1;
    kind: ProviderAuthIpcFrameKind;
    correlation_id: string;
    sequence: number;
    network_id: string;
    node_id: string;
    provider_runtime_id: string;
    provider_id: string;
    execution_id: string;
    attempt: number;
    nonce?: string;
    launch_handle_digest?: string;
    payload?: string | Record<string, unknown>;
};
export type ProviderAuthIpcDecodeResult = {
    status: 'accepted';
    frames: ProviderAuthIpcFrame[];
} | {
    status: 'blocked';
    reason: string;
};
export declare function createProviderAuthIpcFrame(input: Omit<ProviderAuthIpcFrame, 'schema' | 'version'>): ProviderAuthIpcFrame;
export declare function validateProviderAuthIpcFrame(value: unknown): {
    status: 'valid';
} | {
    status: 'blocked';
    reason: string;
};
export declare function encodeProviderAuthIpcFrame(frame: ProviderAuthIpcFrame): Uint8Array;
export declare class ProviderAuthIpcDecoder {
    private buffer;
    private expectedSequence;
    private readonly correlationId;
    constructor(input?: {
        correlation_id?: string;
    });
    push(chunk: Uint8Array): ProviderAuthIpcDecodeResult;
    finish(): ProviderAuthIpcDecodeResult;
}
export {};
