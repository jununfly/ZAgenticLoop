import type { Socket } from 'node:net';
import type { TrustedRunnerPeerIdentityVerifier } from './trusted-runner-peer-identity.js';
export declare function createProviderAuthAuthorityPeerGate(input: {
    verifier: TrustedRunnerPeerIdentityVerifier;
    expected_identity_digest: string;
    correlation_id: string;
}): (socket: Socket) => Promise<boolean>;
export declare function createMacOSProviderAuthAuthorityPeerGate(input: {
    helper_path: string;
    helper_digest: string;
    expected_identity_digest: string;
    correlation_id: string;
    timeout_ms?: number;
}): (socket: Socket) => Promise<boolean>;
