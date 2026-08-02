import type { Socket } from 'node:net';

export const TRUSTED_RUNNER_PEER_IDENTITY_SCHEMA = 'zj-loop.trusted_runner_peer_identity.v1' as const;

export type TrustedRunnerPeerIdentity = {
  schema: typeof TRUSTED_RUNNER_PEER_IDENTITY_SCHEMA;
  platform: 'darwin' | 'linux' | 'win32';
  kind: 'process-audit' | 'peer-credentials' | 'named-pipe-token';
  identity_digest: string;
  process_id: number | null;
};

export type TrustedRunnerPeerVerification =
  | { status: 'verified'; identity: TrustedRunnerPeerIdentity }
  | { status: 'blocked'; reason: string };

export type TrustedRunnerPeerIdentityVerifier = (input: {
  socket: Socket;
  correlation_id: string;
  expected_identity_digest: string;
}) => Promise<TrustedRunnerPeerVerification> | TrustedRunnerPeerVerification;

export function validateTrustedRunnerPeerIdentity(value: unknown): value is TrustedRunnerPeerIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const identity = value as Record<string, unknown>;
  if (identity.schema !== TRUSTED_RUNNER_PEER_IDENTITY_SCHEMA || typeof identity.identity_digest !== 'string' || !/^[0-9a-f]{64}$/.test(identity.identity_digest)) return false;
  if (identity.process_id !== null && (!Number.isInteger(identity.process_id) || (identity.process_id as number) < 1)) return false;
  if (identity.platform === 'darwin') return identity.kind === 'process-audit';
  if (identity.platform === 'linux') return identity.kind === 'peer-credentials';
  if (identity.platform === 'win32') return identity.kind === 'named-pipe-token';
  return false;
}

export function createInMemoryTrustedRunnerPeerIdentityVerifier(input: {
  identity: TrustedRunnerPeerIdentity;
  allow?: boolean;
  reason?: string;
}): TrustedRunnerPeerIdentityVerifier {
  return ({ expected_identity_digest }) => input.allow === false
    ? { status: 'blocked', reason: input.reason ?? 'trusted-runner-peer-identity-rejected' }
    : input.identity.identity_digest !== expected_identity_digest
      ? { status: 'blocked', reason: 'trusted-runner-peer-identity-mismatch' }
    : { status: 'verified', identity: input.identity };
}
