import { type Socket } from 'node:net';
import { type ProviderAuthIpcFrame } from './provider-auth-ipc-protocol.js';
export type ProviderAuthIpcPeerVerifier = (socket: Socket) => Promise<boolean> | boolean;
export type ProviderAuthIpcConnection = {
    send(frame: ProviderAuthIpcFrame): Promise<void>;
    close(): void;
};
export declare function createUnixProviderAuthIpcServer(input: {
    socket_path: string;
    correlation_id: string;
    verify_peer: ProviderAuthIpcPeerVerifier;
    on_frames: (frames: ProviderAuthIpcFrame[], connection: ProviderAuthIpcConnection) => void | Promise<void>;
}): {
    start(): Promise<void>;
    close(): Promise<void>;
};
export declare function connectUnixProviderAuthIpc(input: {
    socket_path: string;
    correlation_id: string;
    on_frames: (frames: ProviderAuthIpcFrame[]) => void | Promise<void>;
}): Promise<ProviderAuthIpcConnection>;
