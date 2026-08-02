import type { TrustedRunnerPeerIdentityVerifier } from './trusted-runner-peer-identity.js';
export declare function createMacOSProcessAuditPeerIdentityVerifier(input: {
    helper_path: string;
    helper_digest: string;
    timeout_ms?: number;
}): TrustedRunnerPeerIdentityVerifier;
