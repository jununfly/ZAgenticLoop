import type { Socket } from 'node:net';
import type { TrustedRunnerPeerIdentityVerifier } from './trusted-runner-peer-identity.js';
import { createMacOSProcessAuditPeerIdentityVerifier } from './macos-process-audit-peer-identity.js';

const PEER_DIGEST = /^[0-9a-f]{64}$/;

export function createProviderAuthAuthorityPeerGate(input: { verifier: TrustedRunnerPeerIdentityVerifier; expected_identity_digest: string; correlation_id: string }): (socket: Socket) => Promise<boolean> {
  if (typeof input.verifier !== 'function') throw new Error('provider-auth-authority-peer-verifier-required');
  if (!PEER_DIGEST.test(input.expected_identity_digest)) throw new Error('provider-auth-authority-peer-identity-digest-invalid');
  if (!input.correlation_id || input.correlation_id.includes('\0')) throw new Error('provider-auth-authority-peer-correlation-invalid');
  return async (socket) => {
    try {
      const result = await input.verifier({ socket, correlation_id: input.correlation_id, expected_identity_digest: input.expected_identity_digest });
      return result.status === 'verified' && result.identity.identity_digest === input.expected_identity_digest;
    } catch { return false; }
  };
}

export function createMacOSProviderAuthAuthorityPeerGate(input: { helper_path: string; helper_digest: string; expected_identity_digest: string; correlation_id: string; timeout_ms?: number }): (socket: Socket) => Promise<boolean> {
  return createProviderAuthAuthorityPeerGate({
    verifier: createMacOSProcessAuditPeerIdentityVerifier({ helper_path: input.helper_path, helper_digest: input.helper_digest, timeout_ms: input.timeout_ms }),
    expected_identity_digest: input.expected_identity_digest,
    correlation_id: input.correlation_id,
  });
}
