import canonicalize from 'canonicalize';
import { createHash, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
export const TRUSTED_ENVIRONMENT_PROOF_SCHEMA = 'zj-loop.trusted_environment_proof.v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
export function createMacOSSeatbeltPolicy() {
    return '(version 1) (deny network*) (allow process*) (allow file-read*)';
}
export function macosEnvironmentPolicyDigests(input) {
    const envPolicy = [...input.env_allowlist].sort().map((key) => `${key}=${input.env[key] ?? ''}`).join('\n');
    return { sandbox_policy_digest: `sha256:${createHash('sha256').update(input.sandbox_policy, 'utf8').digest('hex')}`, env_policy_digest: `sha256:${createHash('sha256').update(envPolicy, 'utf8').digest('hex')}` };
}
export function validateMacOSTrustedEnvironmentPolicy(input) {
    const reasons = [];
    if (typeof input.sandbox_policy !== 'string' || !input.sandbox_policy.includes('(deny network*)'))
        reasons.push('network-deny-policy-missing');
    const allowlist = new Set(input.env_allowlist);
    const credentialKey = /(TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE_KEY|AUTH|API_KEY)/i;
    for (const key of input.env_allowlist)
        if (!/^(PATH|LANG|LC_[A-Za-z0-9_]+|TZ|TERM)$/.test(key) || credentialKey.test(key))
            reasons.push('credential-env-key-forbidden');
    for (const [key, value] of Object.entries(input.env)) {
        if (!allowlist.has(key) || typeof value !== 'string' || value.includes('\0'))
            reasons.push('environment-not-allowlisted');
    }
    return reasons.length === 0 ? { status: 'accepted' } : { status: 'blocked', reasons: [...new Set(reasons)].sort() };
}
function digest(value) { return typeof value === 'string' && DIGEST.test(value); }
function canonicalDigest(value) {
    const json = canonicalize(value);
    if (typeof json !== 'string')
        throw new Error('trusted-environment-canonicalization-invalid');
    return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}
function signatureFor(value, privateKey, publicKeyPem, fingerprint) {
    return { algorithm: 'ECDSA-P256', public_key_pem: publicKeyPem, public_key_fingerprint: fingerprint, signature_base64: sign('sha256', Buffer.from(value, 'utf8'), privateKey).toString('base64') };
}
function validSignature(value, signature) {
    if (signature.algorithm !== 'ECDSA-P256' || !signature.public_key_pem || !/^[0-9a-f]{64}$/.test(signature.public_key_fingerprint) || !signature.signature_base64)
        return false;
    try {
        const publicKey = createPublicKey(signature.public_key_pem);
        const fingerprint = createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
        return fingerprint === signature.public_key_fingerprint && verify('sha256', Buffer.from(value, 'utf8'), publicKey, Buffer.from(signature.signature_base64, 'base64'));
    }
    catch {
        return false;
    }
}
export function trustedEnvironmentProofDigest(value) { return canonicalDigest(value); }
export function trustedEnvironmentRegistryDigest(entries) { return canonicalDigest(entries); }
export function verifyTrustedEnvironmentProof(input) {
    const value = input.proof;
    const reasons = [];
    if (value.schema !== TRUSTED_ENVIRONMENT_PROOF_SCHEMA || value.status !== 'signed' || value.proof_source !== 'trusted-runner' || value.proof_stage !== 'pre-launch')
        reasons.push(value.proof_source === 'agent-self-report' ? 'environment-proof-not-trusted' : 'trusted-environment-proof-stage-invalid');
    if (value.runner_isolation === 'same-process')
        reasons.push('trusted-runner-isolation-invalid');
    const fields = ['execution_id', 'attempt', 'preflight_digest', 'registry_snapshot_digest', 'argv_digest', 'cwd_digest', 'env_policy_digest', 'sandbox_policy_digest'];
    for (const field of fields)
        if (value[field] !== input.execution[field])
            reasons.push('trusted-environment-proof-binding-mismatch');
    for (const field of ['preflight_digest', 'registry_snapshot_digest', 'argv_digest', 'cwd_digest', 'env_policy_digest', 'sandbox_policy_digest'])
        if (!digest(value[field]))
            reasons.push('trusted-environment-proof-invalid');
    if (value.network_denied.status !== 'proved' || !digest(value.network_denied.evidence_digest))
        reasons.push('network-denied-proof-missing');
    if (value.credentials.status !== 'clean' || !digest(value.credentials.evidence_digest) || !digest(value.credentials.allowlist_digest))
        reasons.push('credential-inheritance-detected');
    const { proof_digest: _, signature: __, ...unsigned } = value;
    if (!digest(value.proof_digest) || value.proof_digest !== trustedEnvironmentProofDigest(unsigned))
        reasons.push('trusted-environment-proof-digest-invalid');
    if (!validSignature(value.proof_digest, value.signature))
        reasons.push('trusted-environment-proof-signature-invalid');
    if (!Number.isInteger(input.registry.revision) || input.registry.revision < 1 || input.registry.digest !== trustedEnvironmentRegistryDigest(input.registry.entries) || input.registry.digest !== input.execution.registry_snapshot_digest)
        reasons.push('trusted-runner-registry-snapshot-drift');
    const registered = input.registry.entries.find((entry) => entry.runner_id === value.runner_id && entry.public_key_fingerprint === value.signature.public_key_fingerprint);
    if (!registered)
        reasons.push('trusted-runner-not-registered');
    else if (registered.status !== 'active')
        reasons.push('trusted-runner-not-active');
    const issued = Date.parse(value.issued_at);
    const expires = Date.parse(value.expires_at);
    const now = Date.parse(input.now ?? new Date().toISOString());
    if (!Number.isFinite(issued) || !Number.isFinite(expires) || !Number.isFinite(now) || issued >= expires || now < issued)
        reasons.push('trusted-environment-proof-invalid');
    if (Number.isFinite(expires) && Number.isFinite(now) && now >= expires)
        reasons.push('trusted-environment-proof-expired');
    return reasons.length === 0 ? { status: 'accepted' } : { status: 'blocked', reasons: [...new Set(reasons)].sort() };
}
export function createFakeTrustedEnvironmentProof(input) {
    const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const publicKeyPem = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const fingerprint = createHash('sha256').update(keys.publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
    const now = input.now ?? (() => new Date().toISOString());
    const issuedAt = now();
    const entries = [{ runner_id: input.runner_id, public_key_fingerprint: fingerprint, status: 'active' }];
    const registry = { revision: 1, entries, digest: trustedEnvironmentRegistryDigest(entries) };
    const execution = { ...input.execution, registry_snapshot_digest: registry.digest };
    const unsigned = {
        schema: TRUSTED_ENVIRONMENT_PROOF_SCHEMA,
        status: 'signed',
        proof_source: 'trusted-runner',
        proof_stage: 'pre-launch',
        runner_isolation: 'protected-sandbox',
        runner_id: input.runner_id,
        runner_version: 'fake-environment-runner-1',
        ...execution,
        network_denied: { status: 'proved', evidence_digest: input.network_evidence_digest },
        credentials: { status: 'clean', evidence_digest: input.credential_evidence_digest, allowlist_digest: input.allowlist_digest ?? `sha256:${'a'.repeat(64)}` },
        issued_at: issuedAt,
        expires_at: new Date(Date.parse(issuedAt) + (input.expires_in_ms ?? 300_000)).toISOString(),
    };
    const proof_digest = trustedEnvironmentProofDigest(unsigned);
    return { execution, proof: { ...unsigned, proof_digest, signature: signatureFor(proof_digest, keys.privateKey, publicKeyPem, fingerprint) }, registry, private_key_pem: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
}
