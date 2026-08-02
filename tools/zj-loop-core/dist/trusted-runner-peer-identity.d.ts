import type { Socket } from 'node:net';
export declare const TRUSTED_RUNNER_PEER_IDENTITY_SCHEMA: "zj-loop.trusted_runner_peer_identity.v1";
export type TrustedRunnerPeerIdentity = {
    schema: typeof TRUSTED_RUNNER_PEER_IDENTITY_SCHEMA;
    platform: 'darwin' | 'linux' | 'win32';
    kind: 'process-audit' | 'peer-credentials' | 'named-pipe-token';
    identity_digest: string;
    process_id: number | null;
};
export type TrustedRunnerPeerVerification = {
    status: 'verified';
    identity: TrustedRunnerPeerIdentity;
} | {
    status: 'blocked';
    reason: string;
};
export type TrustedRunnerPeerIdentityVerifier = (input: {
    socket: Socket;
    correlation_id: string;
}) => Promise<TrustedRunnerPeerVerification> | TrustedRunnerPeerVerification;
export declare function validateTrustedRunnerPeerIdentity(value: unknown): value is TrustedRunnerPeerIdentity;
export declare function createInMemoryTrustedRunnerPeerIdentityVerifier(input: {
    identity: TrustedRunnerPeerIdentity;
    allow?: boolean;
    reason?: string;
}): TrustedRunnerPeerIdentityVerifier;
