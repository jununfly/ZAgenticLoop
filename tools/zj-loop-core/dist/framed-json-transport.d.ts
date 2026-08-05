export declare const FRAMED_JSON_TRANSPORT_SCHEMA: "zj-loop.framed_json_transport.v1";
export declare const DEFAULT_FRAMED_JSON_MAX_FRAME_BYTES: number;
export type FramedJsonFrame = Record<string, unknown> & {
    correlation_id: string;
    sequence: number;
};
export type FramedJsonValidation = {
    status: 'valid';
} | {
    status: 'blocked';
    reason: string;
};
export type FramedJsonDecodeResult = {
    status: 'accepted';
    frames: FramedJsonFrame[];
} | {
    status: 'blocked';
    reason: string;
};
export declare function createFramedJsonCodec(input?: {
    max_frame_bytes?: number;
}): {
    encode(value: unknown): Uint8Array;
};
export declare class FramedJsonDecoder {
    private buffer;
    private expectedSequence;
    private readonly max;
    private readonly correlationId?;
    private readonly validate?;
    constructor(input?: {
        max_frame_bytes?: number;
        correlation_id?: string;
        validate?: (value: unknown) => FramedJsonValidation;
    });
    push(chunk: Uint8Array): FramedJsonDecodeResult;
    finish(): FramedJsonDecodeResult;
}
