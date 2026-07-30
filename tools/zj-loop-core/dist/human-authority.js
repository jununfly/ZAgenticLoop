import { createHash, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';
import { approvalDigest, approvalProfileSha256, APPROVAL_CANONICALIZATION, APPROVAL_CANONICALIZATION_PROFILE, canonicalizeApproval } from './approval-canonicalization.js';
export const HUMAN_AUTHORITY_SCHEMA = 'zj-loop.human_authority.v1';
export const HUMAN_AUTHORITY_V2_SCHEMA = 'zj-loop.human_authority.v2';
export const HUMAN_AUTHORITY_V2_DOMAIN = 'ZJ-LOOP/HUMAN-AUTHORITY/V2\0';
export function validateHumanAuthorityV2Binding(input) {
    try {
        const value = typeof input.context === 'string' ? JSON.parse(input.context) : input.context;
        const approval = typeof value === 'object' && value !== null && 'approval' in value ? value.approval : value;
        if (!approval || approval.schema !== HUMAN_AUTHORITY_V2_SCHEMA)
            return { status: 'blocked', reason: 'human-authority-v2-required' };
        if (input.require_current_v2 && (approval.canonicalization !== APPROVAL_CANONICALIZATION || approval.canonicalization_profile !== APPROVAL_CANONICALIZATION_PROFILE || approval.profile_sha256 !== approvalProfileSha256()))
            return { status: 'blocked', reason: 'human-authority-v2-current-required' };
        if (approval.network_id !== input.network_id || approval.device_fingerprint !== input.peer_fingerprint)
            return { status: 'blocked', reason: 'human-device-binding-mismatch' };
        return { status: 'allowed' };
    }
    catch {
        return { status: 'blocked', reason: 'human-authority-v2-required' };
    }
}
function requireText(value, error) {
    if (!value.trim())
        throw new Error(error);
    return value;
}
export function canonicalizeHumanAuthorityV1(value) {
    return new TextEncoder().encode(JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))));
}
function canonicalJson(value) {
    return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))));
}
function digest(value) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}
export function humanAuthorityV2SigningPayload(input) {
    const profileSha256 = approvalProfileSha256();
    const value = {
        action: input.action,
        approved_capabilities: [...new Set(input.approved_capabilities)].sort(),
        canonicalization: APPROVAL_CANONICALIZATION,
        canonicalization_profile: APPROVAL_CANONICALIZATION_PROFILE,
        device_fingerprint: input.device_fingerprint,
        device_key_id: input.device_key_id,
        expires_at: input.expires_at,
        human_id: input.human_id,
        issued_at: input.issued_at,
        network_id: input.network_id,
        profile_sha256: profileSha256,
        request_digest: input.request_digest,
        request_id: input.request_id,
    };
    const canonical = canonicalizeApproval(value);
    const domain = new TextEncoder().encode(HUMAN_AUTHORITY_V2_DOMAIN);
    const signingPayload = new Uint8Array(domain.byteLength + canonical.byteLength);
    signingPayload.set(domain);
    signingPayload.set(canonical, domain.byteLength);
    return { canonical, signing_payload: signingPayload, payload_digest: approvalDigest(value), profile_sha256: profileSha256 };
}
function now() {
    return new Date().toISOString();
}
export function createInMemoryHumanAuthorityProvider(input) {
    const humanId = requireText(input.human_id, 'human-id-required');
    const protocolVersion = input.protocol_version ?? 'v1';
    const schema = protocolVersion === 'v2' ? HUMAN_AUTHORITY_V2_SCHEMA : HUMAN_AUTHORITY_SCHEMA;
    const configuredNetworkId = input.network_id;
    const configuredDeviceKeyId = input.device_key_id;
    const configuredDeviceFingerprint = input.device_fingerprint;
    const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const publicKeyPem = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const publicKeyFingerprint = createHash('sha256').update(keys.publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
    let recoveryHash = null;
    const identity = () => ({ schema, human_id: humanId, algorithm: 'ECDSA-P256', public_key_pem: publicKeyPem, public_key_fingerprint: publicKeyFingerprint });
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
            const networkId = input.network_id ?? configuredNetworkId;
            const deviceKeyId = input.device_key_id ?? configuredDeviceKeyId;
            const deviceFingerprint = input.device_fingerprint ?? configuredDeviceFingerprint;
            if (protocolVersion === 'v2' && (!networkId?.trim() || !deviceKeyId?.trim() || !/^[0-9a-f]{64}$/.test(deviceFingerprint ?? '')))
                throw new Error('human-device-binding-required');
            if (protocolVersion === 'v1' && (networkId || deviceKeyId || deviceFingerprint))
                throw new Error('human-authority-v1-device-binding-unsupported');
            const issuedAt = input.issued_at ?? now();
            const expiresAt = input.expires_at ?? new Date(Date.parse(issuedAt) + 5 * 60 * 1000).toISOString();
            const approvedCapabilities = [...new Set(input.approved_capabilities ?? [])].sort();
            if (protocolVersion === 'v2') {
                const payload = humanAuthorityV2SigningPayload({ action, request_id: requestId, request_digest: requestDigest, approved_capabilities: approvedCapabilities, human_id: humanId, issued_at: issuedAt, expires_at: expiresAt, network_id: networkId, device_key_id: deviceKeyId, device_fingerprint: deviceFingerprint });
                const signature = sign('sha256', payload.signing_payload, keys.privateKey);
                return { schema, human_id: humanId, public_key_fingerprint: publicKeyFingerprint, action, request_id: requestId, request_digest: requestDigest, approved_capabilities: approvedCapabilities, issued_at: issuedAt, expires_at: expiresAt, payload_digest: payload.payload_digest, signature_base64: signature.toString('base64'), network_id: networkId, device_key_id: deviceKeyId, device_fingerprint: deviceFingerprint, canonicalization: APPROVAL_CANONICALIZATION, canonicalization_profile: APPROVAL_CANONICALIZATION_PROFILE, profile_sha256: payload.profile_sha256 };
            }
            const canonical = protocolVersion === 'v1'
                ? canonicalizeHumanAuthorityV1({ action, request_id: requestId, request_digest: requestDigest, approved_capabilities: approvedCapabilities, human_id: humanId, issued_at: issuedAt, expires_at: expiresAt, network_id: networkId, device_key_id: deviceKeyId, device_fingerprint: deviceFingerprint })
                : new TextEncoder().encode(canonicalJson({ action, request_id: requestId, request_digest: requestDigest, approved_capabilities: approvedCapabilities, human_id: humanId, issued_at: issuedAt, expires_at: expiresAt, network_id: networkId, device_key_id: deviceKeyId, device_fingerprint: deviceFingerprint }));
            const payloadDigest = createHash('sha256').update(canonical).digest('hex');
            const signature = sign('sha256', Buffer.from(payloadDigest, 'utf8'), keys.privateKey);
            return { schema, human_id: humanId, public_key_fingerprint: publicKeyFingerprint, action, request_id: requestId, request_digest: requestDigest, approved_capabilities: approvedCapabilities, issued_at: issuedAt, expires_at: expiresAt, payload_digest: payloadDigest, signature_base64: signature.toString('base64') };
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
    if (input.require_v2 && context.schema !== HUMAN_AUTHORITY_V2_SCHEMA)
        return false;
    if (context.schema !== identity.schema || ![HUMAN_AUTHORITY_SCHEMA, HUMAN_AUTHORITY_V2_SCHEMA].includes(context.schema) || identity.human_id !== context.human_id || identity.public_key_fingerprint !== context.public_key_fingerprint)
        return false;
    if (context.schema === HUMAN_AUTHORITY_V2_SCHEMA && (!context.network_id?.trim() || !context.device_key_id?.trim() || !/^[0-9a-f]{64}$/.test(context.device_fingerprint ?? '')))
        return false;
    if (context.schema === HUMAN_AUTHORITY_SCHEMA && (context.network_id || context.device_key_id || context.device_fingerprint))
        return false;
    const expiresAt = Date.parse(context.expires_at);
    const issuedAt = Date.parse(context.issued_at);
    const now = Date.parse(input.now ?? new Date().toISOString());
    if (![issuedAt, expiresAt, now].every(Number.isFinite) || issuedAt > expiresAt || now >= expiresAt)
        return false;
    const approvedCapabilities = [...new Set(context.approved_capabilities)].sort();
    if (context.schema === HUMAN_AUTHORITY_V2_SCHEMA && context.canonicalization === APPROVAL_CANONICALIZATION && context.canonicalization_profile === APPROVAL_CANONICALIZATION_PROFILE && typeof context.profile_sha256 === 'string') {
        if (context.network_id === undefined || context.device_key_id === undefined || context.device_fingerprint === undefined)
            return false;
        const payload = humanAuthorityV2SigningPayload({ action: context.action, request_id: context.request_id, request_digest: context.request_digest, approved_capabilities: approvedCapabilities, human_id: context.human_id, issued_at: context.issued_at, expires_at: context.expires_at, network_id: context.network_id, device_key_id: context.device_key_id, device_fingerprint: context.device_fingerprint });
        if (context.payload_digest !== payload.payload_digest || context.profile_sha256 !== payload.profile_sha256)
            return false;
        try {
            const publicKey = createPublicKey(identity.public_key_pem);
            if (publicKey.asymmetricKeyType !== 'ec' || publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1')
                return false;
            return verify('sha256', payload.signing_payload, publicKey, Buffer.from(context.signature_base64, 'base64'));
        }
        catch {
            return false;
        }
    }
    const canonical = context.schema === HUMAN_AUTHORITY_SCHEMA
        ? canonicalizeHumanAuthorityV1({ action: context.action, request_id: context.request_id, request_digest: context.request_digest, approved_capabilities: approvedCapabilities, human_id: context.human_id, issued_at: context.issued_at, expires_at: context.expires_at, network_id: context.network_id, device_key_id: context.device_key_id, device_fingerprint: context.device_fingerprint })
        : new TextEncoder().encode(canonicalJson({ action: context.action, request_id: context.request_id, request_digest: context.request_digest, approved_capabilities: approvedCapabilities, human_id: context.human_id, issued_at: context.issued_at, expires_at: context.expires_at, network_id: context.network_id, device_key_id: context.device_key_id, device_fingerprint: context.device_fingerprint }));
    const payloadDigest = createHash('sha256').update(canonical).digest('hex');
    if (payloadDigest !== context.payload_digest)
        return false;
    try {
        const publicKey = createPublicKey(identity.public_key_pem);
        if (publicKey.asymmetricKeyType !== 'ec' || publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1')
            return false;
        return verify('sha256', Buffer.from(payloadDigest, 'utf8'), publicKey, Buffer.from(context.signature_base64, 'base64'));
    }
    catch {
        return false;
    }
}
export function verifyHumanApprovalContextDetailed(input) {
    if (!verifyHumanApprovalContext(input))
        return { status: 'blocked' };
    if (input.context.schema === HUMAN_AUTHORITY_V2_SCHEMA) {
        const current = input.context.canonicalization === APPROVAL_CANONICALIZATION
            && input.context.canonicalization_profile === APPROVAL_CANONICALIZATION_PROFILE
            && typeof input.context.profile_sha256 === 'string';
        return { status: current ? 'current-v2-accepted' : 'legacy-v2-accepted' };
    }
    return { status: 'accepted' };
}
