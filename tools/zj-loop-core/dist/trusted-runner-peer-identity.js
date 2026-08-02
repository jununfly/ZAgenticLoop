export const TRUSTED_RUNNER_PEER_IDENTITY_SCHEMA = 'zj-loop.trusted_runner_peer_identity.v1';
export function validateTrustedRunnerPeerIdentity(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const identity = value;
    if (identity.schema !== TRUSTED_RUNNER_PEER_IDENTITY_SCHEMA || typeof identity.identity_digest !== 'string' || !/^[0-9a-f]{64}$/.test(identity.identity_digest))
        return false;
    if (identity.process_id !== null && (!Number.isInteger(identity.process_id) || identity.process_id < 1))
        return false;
    if (identity.platform === 'darwin')
        return identity.kind === 'process-audit';
    if (identity.platform === 'linux')
        return identity.kind === 'peer-credentials';
    if (identity.platform === 'win32')
        return identity.kind === 'named-pipe-token';
    return false;
}
export function createInMemoryTrustedRunnerPeerIdentityVerifier(input) {
    return ({ expected_identity_digest }) => input.allow === false
        ? { status: 'blocked', reason: input.reason ?? 'trusted-runner-peer-identity-rejected' }
        : input.identity.identity_digest !== expected_identity_digest
            ? { status: 'blocked', reason: 'trusted-runner-peer-identity-mismatch' }
            : { status: 'verified', identity: input.identity };
}
