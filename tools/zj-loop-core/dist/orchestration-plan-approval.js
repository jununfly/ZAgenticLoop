import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { verifyHumanSignature } from './human-signer.js';
import { ORCHESTRATION_PLAN_CANONICALIZATION } from './protocol-registry.js';
export const ORCHESTRATION_PLAN_APPROVAL_SCHEMA = 'zj-loop.orchestration_plan_approval.v1';
export const ORCHESTRATION_PLAN_APPROVAL_PROFILE = 'orchestration-plan-approval-v1-2026-07';
const ORCHESTRATION_PLAN_APPROVAL_DOMAIN = 'ZJ-LOOP/ORCHESTRATION-PLAN-APPROVAL/V1\0';
const PROFILE = Object.freeze({
    schema: 'zj-loop.canonicalization_profile.v1',
    profile_id: ORCHESTRATION_PLAN_APPROVAL_PROFILE,
    canonicalization: ORCHESTRATION_PLAN_CANONICALIZATION,
    schema_version: ORCHESTRATION_PLAN_APPROVAL_SCHEMA,
    set_paths: Object.freeze(['approved_capabilities']),
});
function profileSha256() {
    const value = canonicalize(PROFILE);
    if (typeof value !== 'string')
        throw new Error('orchestration-plan-approval-profile-invalid');
    return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
export function orchestrationPlanApprovalProfileSha256() { return profileSha256(); }
function requireInput(input) {
    for (const key of ['network_id', 'plan_id', 'plan_digest', 'request_id', 'issued_at', 'expires_at', 'device_key_id', 'device_fingerprint'])
        if (!input[key].trim())
            throw new Error(`orchestration-plan-approval-${key}-required`);
    if (!Number.isInteger(input.plan_revision) || input.plan_revision < 1)
        throw new Error('orchestration-plan-approval-revision-invalid');
    if (!/^sha256:[0-9a-f]{64}$/.test(input.plan_digest))
        throw new Error('orchestration-plan-approval-digest-invalid');
    if (!/^[0-9a-f]{64}$/.test(input.device_fingerprint))
        throw new Error('orchestration-plan-approval-device-invalid');
    if (!Array.isArray(input.approved_capabilities) || input.approved_capabilities.some((value) => typeof value !== 'string' || !value.trim()))
        throw new Error('orchestration-plan-approval-capabilities-invalid');
    if (!Number.isFinite(Date.parse(input.issued_at)) || !Number.isFinite(Date.parse(input.expires_at)) || Date.parse(input.issued_at) >= Date.parse(input.expires_at))
        throw new Error('orchestration-plan-approval-time-invalid');
}
function canonicalInput(input) {
    const value = {
        action: 'orchestration.plan.approve',
        approved_capabilities: [...new Set(input.approved_capabilities)].sort(),
        canonicalization: ORCHESTRATION_PLAN_CANONICALIZATION,
        canonicalization_profile: ORCHESTRATION_PLAN_APPROVAL_PROFILE,
        device_fingerprint: input.device_fingerprint,
        device_key_id: input.device_key_id,
        expires_at: input.expires_at,
        human_id: input.human_id,
        issued_at: input.issued_at,
        network_id: input.network_id,
        plan_digest: input.plan_digest,
        plan_id: input.plan_id,
        plan_revision: input.plan_revision,
        profile_sha256: input.profile_sha256,
        request_id: input.request_id,
    };
    const json = canonicalize(value);
    if (typeof json !== 'string')
        throw new Error('orchestration-plan-approval-canonicalization-invalid');
    const canonical = new TextEncoder().encode(json);
    const domain = new TextEncoder().encode(ORCHESTRATION_PLAN_APPROVAL_DOMAIN);
    const payload = new Uint8Array(domain.byteLength + canonical.byteLength);
    payload.set(domain);
    payload.set(canonical, domain.byteLength);
    return payload;
}
export async function createOrchestrationPlanApproval(input) {
    requireInput(input);
    const { signer, ...approvalInput } = input;
    const identity = await signer.getPublicIdentity();
    const profile_sha256 = profileSha256();
    const signature = await signer.sign({ payload: canonicalInput({ ...approvalInput, human_id: identity.human_id, profile_sha256 }) });
    return { schema: ORCHESTRATION_PLAN_APPROVAL_SCHEMA, ...approvalInput, action: 'orchestration.plan.approve', human_id: identity.human_id, public_key_fingerprint: identity.public_key_fingerprint, signature, canonicalization: ORCHESTRATION_PLAN_CANONICALIZATION, canonicalization_profile: ORCHESTRATION_PLAN_APPROVAL_PROFILE, profile_sha256 };
}
export function verifyOrchestrationPlanApproval(input) {
    const approval = input.approval;
    try {
        requireInput(approval);
    }
    catch {
        return { status: 'blocked', reason: 'approval-schema-invalid' };
    }
    if (approval.action !== 'orchestration.plan.approve' || approval.canonicalization !== ORCHESTRATION_PLAN_CANONICALIZATION || approval.canonicalization_profile !== ORCHESTRATION_PLAN_APPROVAL_PROFILE || approval.profile_sha256 !== profileSha256())
        return { status: 'blocked', reason: 'approval-profile-invalid' };
    if (approval.human_id !== input.identity.human_id || approval.public_key_fingerprint !== input.identity.public_key_fingerprint || approval.signature.public_key_fingerprint !== input.identity.public_key_fingerprint)
        return { status: 'blocked', reason: 'human-identity-mismatch' };
    if (approval.network_id !== input.expected.network_id || approval.plan_id !== input.expected.plan_id || approval.request_id !== input.expected.request_id || approval.device_key_id !== input.expected.device_key_id || approval.device_fingerprint !== input.expected.device_fingerprint)
        return { status: 'blocked', reason: 'approval-binding-mismatch' };
    if (approval.plan_revision !== input.expected.plan_revision)
        return { status: 'blocked', reason: 'plan-revision-mismatch' };
    if (approval.plan_digest !== input.expected.plan_digest)
        return { status: 'blocked', reason: 'plan-digest-mismatch' };
    if (Date.parse(input.now) >= Date.parse(approval.expires_at))
        return { status: 'blocked', reason: 'approval-expired' };
    if (!verifyHumanSignature({ identity: input.identity, payload: canonicalInput({ ...approval, profile_sha256: approval.profile_sha256 }), signature: approval.signature }))
        return { status: 'blocked', reason: 'approval-signature-invalid' };
    return { status: 'accepted' };
}
