import type { TrustedRunnerPeerIdentityVerifier } from './trusted-runner-peer-identity.js';
import { type BootstrapIdentityFacts } from './bootstrap-protocol.js';
import type { ProviderAuthAuthorityProcessIdentityVerifier } from './provider-auth-authority-process-identity.js';
export declare function createMacOSProcessAuditIdentityFacts(input: {
    process_id: number;
    signing_identifier: string;
    team_identifier?: string | null;
    code_directory_hash: string;
}): BootstrapIdentityFacts & {
    process_id: number;
    signing_identifier: string;
    team_identifier?: string;
    code_directory_hash: string;
};
export declare function createMacOSProcessAuditPeerIdentityVerifier(input: {
    helper_path: string;
    helper_digest: string;
    timeout_ms?: number;
}): TrustedRunnerPeerIdentityVerifier;
export declare function createMacOSProcessAuditBootstrapPeerIdentityVerifier(input: {
    helper_path: string;
    helper_digest: string;
    timeout_ms?: number;
}): TrustedRunnerPeerIdentityVerifier;
export declare function createMacOSProviderRuntimeProcessIdentityVerifier(input: {
    helper_path: string;
    helper_digest: string;
    timeout_ms?: number;
}): import('./provider-runtime-process-identity.js').ProviderRuntimeProcessIdentityVerifier;
export declare function createMacOSProviderAuthAuthorityProcessIdentityVerifier(input: {
    helper_path: string;
    helper_digest: string;
    timeout_ms?: number;
}): ProviderAuthAuthorityProcessIdentityVerifier;
