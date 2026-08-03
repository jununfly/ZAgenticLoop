export declare const BOOTSTRAP_CHANNEL_ROLES: readonly ["secret", "identity-binding", "status"];
export type BootstrapChannelRole = (typeof BOOTSTRAP_CHANNEL_ROLES)[number];
export type BootstrapReasonDescriptor = {
    code: string;
    lifecycle_stage: 'secret' | 'auth-ready' | 'identity-binding' | 'runtime-ready' | 'worker-connection' | 'worker-handshake' | 'cleanup';
    default_outcome: 'blocked' | 'outcome-uncertain';
    requires_human_review: boolean;
    allows_new_attempt: boolean;
    detail_policy: 'field-name-length-and-digest-only' | 'bounded-cleanup-summary';
};
export declare const BOOTSTRAP_REASON_DESCRIPTORS: readonly BootstrapReasonDescriptor[];
export declare const BOOTSTRAP_PROTOCOL_PROFILE: Readonly<{
    schema: "zj-loop.bootstrap_protocol_profile.v1";
    profile_id: "bootstrap-protocol-v1-2026-08";
    canonicalization: "jcs-rfc8785";
    frame: Readonly<{
        prefix_bytes: 4;
        length_encoding: "uint32be";
        max_frame_bytes: number;
        one_frame_per_buffer: true;
    }>;
    channel_roles: readonly ["secret", "identity-binding", "status"];
    directions: Readonly<{
        secret: "trusted-runner-to-sidecar";
        'identity-binding': "trusted-runner-to-sidecar";
        status: "sidecar-to-trusted-runner";
    }>;
    reason_descriptors: readonly BootstrapReasonDescriptor[];
    worker_inherited_channels: readonly [];
}>;
export type BootstrapIdentityFacts = {
    schema: 'zj-loop.worker_identity_facts.v1';
    platform: string;
    kind: string;
    executable_digest: string;
    signer_digest?: string;
    [key: string]: unknown;
};
export type BootstrapExecutionContext = {
    network_id: string;
    execution_id: string;
    attempt: number;
    provider_id: string;
    execution_binding_nonce: string;
    [key: string]: unknown;
};
export type BootstrapBinding = {
    schema: 'zj-loop.bootstrap_binding.v1';
    bootstrap_profile_sha256: string;
    identity_digest: string;
    execution_binding_digest: string;
    execution_binding_nonce: string;
    binding_digest: string;
};
export type BootstrapFrame = {
    schema: string;
    channel_role: BootstrapChannelRole;
    payload: unknown;
};
export type BootstrapLifecycleStage = 'created' | 'channels-armed' | 'sidecar-started' | 'auth-ready' | 'binding-verified' | 'runtime-ready' | 'worker-connected' | 'worker-accepted' | 'cleanup';
export type BootstrapLifecycleStatus = 'pending' | 'runtime-ready' | 'blocked' | 'outcome-uncertain';
export type BootstrapLifecycle = {
    schema: 'zj-loop.bootstrap_lifecycle.v1';
    execution_id: string;
    attempt: number;
    stage: BootstrapLifecycleStage;
    status: BootstrapLifecycleStatus;
    last_now_ms: number;
    reason_code?: string;
    history: readonly BootstrapLifecycleStage[];
};
export declare const BOOTSTRAP_INITIAL_LIFECYCLE: BootstrapLifecycle;
export declare function bootstrapProfileSha256(): string;
export declare function getBootstrapReasonDescriptor(code: unknown): BootstrapReasonDescriptor | undefined;
type BootstrapLifecycleEvent = {
    type: 'arm';
    now_ms: number;
} | {
    type: 'sidecar-started';
    now_ms: number;
} | {
    type: 'auth-ready';
    now_ms: number;
} | {
    type: 'binding-verified';
    now_ms: number;
} | {
    type: 'runtime-ready';
    now_ms: number;
} | {
    type: 'worker-connected';
    now_ms: number;
} | {
    type: 'worker-accepted';
    now_ms: number;
} | {
    type: 'fail';
    now_ms: number;
    reason_code: string;
} | {
    type: 'cleanup-uncertain';
    now_ms: number;
};
export declare function advanceBootstrapLifecycle(current: BootstrapLifecycle, event: BootstrapLifecycleEvent): BootstrapLifecycle;
export declare function createBootstrapBinding(input: {
    identity: BootstrapIdentityFacts;
    execution: BootstrapExecutionContext;
}): BootstrapBinding;
export declare function encodeBootstrapFrame(frame: BootstrapFrame): Uint8Array;
export declare function decodeBootstrapFrame(input: Uint8Array): BootstrapFrame;
export declare function createBootstrapTransportFixture(): {
    trustedRunner: {
        send: (role: BootstrapChannelRole, value: unknown) => Promise<void>;
        receive: (role: BootstrapChannelRole) => Promise<unknown>;
        sendEncoded: (role: BootstrapChannelRole, frame: BootstrapFrame, chunks?: readonly number[]) => Promise<void>;
        receiveEncoded: (role: BootstrapChannelRole, input: {
            now_ms: number;
            deadline_ms: number;
        }) => Promise<BootstrapFrame>;
    };
    sidecar: {
        send: (role: BootstrapChannelRole, value: unknown) => Promise<void>;
        receive: (role: BootstrapChannelRole) => Promise<unknown>;
        sendEncoded: (role: BootstrapChannelRole, frame: BootstrapFrame, chunks?: readonly number[]) => Promise<void>;
        receiveEncoded: (role: BootstrapChannelRole, input: {
            now_ms: number;
            deadline_ms: number;
        }) => Promise<BootstrapFrame>;
    };
    worker: {
        receive: (role: BootstrapChannelRole) => Promise<unknown>;
        receiveEncoded: (role: BootstrapChannelRole, input: {
            now_ms: number;
            deadline_ms: number;
        }) => Promise<BootstrapFrame>;
        inherited_channels: () => BootstrapChannelRole[];
    };
};
export {};
