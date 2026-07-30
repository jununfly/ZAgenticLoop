export declare const APPROVAL_JSON_INVALID: "approval-json-invalid";
export declare const APPROVAL_JSON_LIMIT_EXCEEDED: "approval-json-limit-exceeded";
export declare class BoundedJsonError extends Error {
    readonly reason: typeof APPROVAL_JSON_INVALID | typeof APPROVAL_JSON_LIMIT_EXCEEDED;
    constructor(reason: typeof APPROVAL_JSON_INVALID | typeof APPROVAL_JSON_LIMIT_EXCEEDED);
}
export declare function parseBoundedJson(input: Uint8Array | string): unknown;
