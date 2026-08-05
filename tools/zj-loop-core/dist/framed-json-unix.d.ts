import { type Socket } from 'node:net';
import { type FramedJsonFrame, type FramedJsonValidation } from './framed-json-transport.js';
export type FramedJsonConnection = {
    send(frame: FramedJsonFrame): Promise<void>;
    close(): void;
};
export type FramedJsonPeerVerifier = (socket: Socket) => Promise<boolean> | boolean;
export declare function createUnixFramedJsonServer(input: {
    socket_path: string;
    correlation_id: string;
    verify_peer: FramedJsonPeerVerifier;
    validate?: (value: unknown) => FramedJsonValidation;
    on_connection?: (socket: Socket, connection: FramedJsonConnection) => void | Promise<void>;
    on_frames: (frames: FramedJsonFrame[], connection: FramedJsonConnection) => void | Promise<void>;
    max_frame_bytes?: number;
}): {
    start(): Promise<void>;
    close(): Promise<void>;
};
export declare function connectUnixFramedJson(input: {
    socket_path: string;
    correlation_id: string;
    on_frames: (frames: FramedJsonFrame[]) => void | Promise<void>;
    validate?: (value: unknown) => FramedJsonValidation;
    timeout_ms?: number;
    max_frame_bytes?: number;
}): Promise<FramedJsonConnection>;
