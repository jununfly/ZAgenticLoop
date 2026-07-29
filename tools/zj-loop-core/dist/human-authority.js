import { createHash, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';
export const HUMAN_AUTHORITY_SCHEMA = 'zj-loop.human_authority.v1';
function requireText(value, error) {
    if (!value.trim())
        throw new Error(error);
    return value;
}
function canonicalJson(value) {
    return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))));
}
function digest(value) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}
function now() {
    return new Date().toISOString();
}
export function createInMemoryHumanAuthorityProvider(input) {
    const humanId = requireText(input.human_id, 'human-id-required');
    const keys = generateKeyPairSync('ed25519');
    const publicKeyPem = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const publicKeyFingerprint = createHash('sha256').update(keys.publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
    let recoveryHash = null;
    const identity = () => ({ schema: HUMAN_AUTHORITY_SCHEMA, human_id: humanId, algorithm: 'Ed25519', public_key_pem: publicKeyPem, public_key_fingerprint: publicKeyFingerprint });
    const createRecovery = () => {
        const secret = randomBytes(32).toString('base64url');
        recoveryHash = digest(secret);
        return { public_identifier: recoveryHash, secret };
    };
    return {
        getPublicIdentity: identity,
        async signApprovalContext(input) {
            const action = requireText(input.action, 'human-action-required');
            const requestId = requireText(input.request_id, 'request-id-required');
            const requestDigest = requireText(input.request_digest, 'request-digest-required');
            const issuedAt = input.issued_at ?? now();
            const expiresAt = input.expires_at ?? new Date(Date.parse(issuedAt) + 5 * 60 * 1000).toISOString();
            const approvedCapabilities = [...new Set(input.approved_capabilities ?? [])].sort();
            const payloadDigest = digest(canonicalJson({ action, request_id: requestId, request_digest: requestDigest, approved_capabilities: approvedCapabilities, human_id: humanId, issued_at: issuedAt, expires_at: expiresAt }));
            const signature = sign(null, Buffer.from(payloadDigest, 'utf8'), keys.privateKey);
            return { schema: HUMAN_AUTHORITY_SCHEMA, human_id: humanId, public_key_fingerprint: publicKeyFingerprint, action, request_id: requestId, request_digest: requestDigest, approved_capabilities: approvedCapabilities, issued_at: issuedAt, expires_at: expiresAt, payload_digest: payloadDigest, signature_base64: signature.toString('base64') };
        },
        async createRecoveryMaterial() {
            return createRecovery();
        },
        async rotateRecoveryMaterial() {
            return createRecovery();
        },
        async verifyRecoveryMaterial(secret) {
            return typeof secret === 'string' && recoveryHash !== null && digest(secret) === recoveryHash;
        },
    };
}
export function verifyHumanApprovalContext(input) {
    const { identity, context } = input;
    if (context.schema !== HUMAN_AUTHORITY_SCHEMA || identity.human_id !== context.human_id || identity.public_key_fingerprint !== context.public_key_fingerprint)
        return false;
    const expiresAt = Date.parse(context.expires_at);
    const issuedAt = Date.parse(context.issued_at);
    const now = Date.parse(input.now ?? new Date().toISOString());
    if (![issuedAt, expiresAt, now].every(Number.isFinite) || issuedAt > expiresAt || now >= expiresAt)
        return false;
    const approvedCapabilities = [...new Set(context.approved_capabilities)].sort();
    const payloadDigest = digest(canonicalJson({ action: context.action, request_id: context.request_id, request_digest: context.request_digest, approved_capabilities: approvedCapabilities, human_id: context.human_id, issued_at: context.issued_at, expires_at: context.expires_at }));
    if (payloadDigest !== context.payload_digest)
        return false;
    try {
        return verify(null, Buffer.from(payloadDigest, 'utf8'), createPublicKey(identity.public_key_pem), Buffer.from(context.signature_base64, 'base64'));
    }
    catch {
        return false;
    }
}
