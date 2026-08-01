import canonicalize from 'canonicalize';
import { createHash, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';

export const TRUSTED_ENVIRONMENT_PROOF_SCHEMA = 'zj-loop.trusted_environment_proof.v1' as const;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

export type TrustedEnvironmentExecution = {
  execution_id: string;
  attempt: number;
  preflight_digest: string;
  registry_snapshot_digest: string;
  argv_digest: string;
  cwd_digest: string;
  env_policy_digest: string;
  sandbox_policy_digest: string;
};

export type TrustedEnvironmentProof = {
  schema: typeof TRUSTED_ENVIRONMENT_PROOF_SCHEMA;
  status: 'signed' | 'blocked';
  proof_source: 'trusted-runner' | 'agent-self-report';
  proof_stage: 'pre-launch' | 'post-launch';
  runner_isolation: 'separate-process' | 'protected-sandbox' | 'same-process';
  runner_id: string;
  runner_version: string;
  execution_id: string;
  attempt: number;
  preflight_digest: string;
  registry_snapshot_digest: string;
  argv_digest: string;
  cwd_digest: string;
  env_policy_digest: string;
  sandbox_policy_digest: string;
  network_denied: { status: 'proved' | 'blocked'; evidence_digest: string };
  credentials: { status: 'clean' | 'blocked'; evidence_digest: string; allowlist_digest: string };
  issued_at: string;
  expires_at: string;
  proof_digest: string;
  signature: { algorithm: 'ECDSA-P256'; public_key_pem: string; public_key_fingerprint: string; signature_base64: string };
};

export type TrustedEnvironmentRegistry = {
  revision: number;
  digest: string;
  entries: Array<{ runner_id: string; public_key_fingerprint: string; status: 'active' | 'revoked' }>;
};

export function createMacOSSeatbeltPolicy(): string {
  return '(version 1) (deny network*) (allow process*) (allow file-read*)';
}

export function macosEnvironmentPolicyDigests(input: { sandbox_policy: string; env_allowlist: string[]; env: Record<string, string> }): { sandbox_policy_digest: string; env_policy_digest: string } {
  const envPolicy = [...input.env_allowlist].sort().map((key) => `${key}=${input.env[key] ?? ''}`).join('\n');
  return { sandbox_policy_digest: `sha256:${createHash('sha256').update(input.sandbox_policy, 'utf8').digest('hex')}`, env_policy_digest: `sha256:${createHash('sha256').update(envPolicy, 'utf8').digest('hex')}` };
}

export function validateMacOSTrustedEnvironmentPolicy(input: { sandbox_policy: string; env_allowlist: string[]; env: Record<string, string> }): { status: 'accepted' } | { status: 'blocked'; reasons: string[] } {
  const reasons: string[] = [];
  if (typeof input.sandbox_policy !== 'string' || !input.sandbox_policy.includes('(deny network*)')) reasons.push('network-deny-policy-missing');
  const allowlist = new Set(input.env_allowlist);
  const credentialKey = /(TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE_KEY|AUTH|API_KEY)/i;
  for (const key of input.env_allowlist) if (!/^(PATH|LANG|LC_[A-Za-z0-9_]+|TZ|TERM)$/.test(key) || credentialKey.test(key)) reasons.push('credential-env-key-forbidden');
  for (const [key, value] of Object.entries(input.env)) {
    if (!allowlist.has(key) || typeof value !== 'string' || value.includes('\0')) reasons.push('environment-not-allowlisted');
  }
  return reasons.length === 0 ? { status: 'accepted' } : { status: 'blocked', reasons: [...new Set(reasons)].sort() };
}

function digest(value: unknown): value is string { return typeof value === 'string' && DIGEST.test(value); }
function canonicalDigest(value: unknown): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('trusted-environment-canonicalization-invalid');
  return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}
function signatureFor(value: string, privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'], publicKeyPem: string, fingerprint: string): TrustedEnvironmentProof['signature'] {
  return { algorithm: 'ECDSA-P256', public_key_pem: publicKeyPem, public_key_fingerprint: fingerprint, signature_base64: sign('sha256', Buffer.from(value, 'utf8'), privateKey).toString('base64') };
}
function validSignature(value: string, signature: TrustedEnvironmentProof['signature']): boolean {
  if (signature.algorithm !== 'ECDSA-P256' || !signature.public_key_pem || !/^[0-9a-f]{64}$/.test(signature.public_key_fingerprint) || !signature.signature_base64) return false;
  try {
    const publicKey = createPublicKey(signature.public_key_pem);
    const fingerprint = createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
    return fingerprint === signature.public_key_fingerprint && verify('sha256', Buffer.from(value, 'utf8'), publicKey, Buffer.from(signature.signature_base64, 'base64'));
  } catch { return false; }
}

export function trustedEnvironmentProofDigest(value: Omit<TrustedEnvironmentProof, 'proof_digest' | 'signature'>): string { return canonicalDigest(value); }
export function trustedEnvironmentRegistryDigest(entries: TrustedEnvironmentRegistry['entries']): string { return canonicalDigest(entries); }

export function verifyTrustedEnvironmentProof(input: { proof: TrustedEnvironmentProof; execution: TrustedEnvironmentExecution; registry: TrustedEnvironmentRegistry; now?: string }): { status: 'accepted' } | { status: 'blocked'; reasons: string[] } {
  const value = input.proof;
  const reasons: string[] = [];
  if (value.schema !== TRUSTED_ENVIRONMENT_PROOF_SCHEMA || value.status !== 'signed' || value.proof_source !== 'trusted-runner' || value.proof_stage !== 'pre-launch') reasons.push(value.proof_source === 'agent-self-report' ? 'environment-proof-not-trusted' : 'trusted-environment-proof-stage-invalid');
  if (value.runner_isolation === 'same-process') reasons.push('trusted-runner-isolation-invalid');
  const fields: Array<keyof TrustedEnvironmentExecution> = ['execution_id', 'attempt', 'preflight_digest', 'registry_snapshot_digest', 'argv_digest', 'cwd_digest', 'env_policy_digest', 'sandbox_policy_digest'];
  for (const field of fields) if (value[field] !== input.execution[field]) reasons.push('trusted-environment-proof-binding-mismatch');
  for (const field of ['preflight_digest', 'registry_snapshot_digest', 'argv_digest', 'cwd_digest', 'env_policy_digest', 'sandbox_policy_digest'] as const) if (!digest(value[field])) reasons.push('trusted-environment-proof-invalid');
  if (value.network_denied.status !== 'proved' || !digest(value.network_denied.evidence_digest)) reasons.push('network-denied-proof-missing');
  if (value.credentials.status !== 'clean' || !digest(value.credentials.evidence_digest) || !digest(value.credentials.allowlist_digest)) reasons.push('credential-inheritance-detected');
  const { proof_digest: _, signature: __, ...unsigned } = value;
  if (!digest(value.proof_digest) || value.proof_digest !== trustedEnvironmentProofDigest(unsigned)) reasons.push('trusted-environment-proof-digest-invalid');
  if (!validSignature(value.proof_digest, value.signature)) reasons.push('trusted-environment-proof-signature-invalid');
  if (!Number.isInteger(input.registry.revision) || input.registry.revision < 1 || input.registry.digest !== trustedEnvironmentRegistryDigest(input.registry.entries) || input.registry.digest !== input.execution.registry_snapshot_digest) reasons.push('trusted-runner-registry-snapshot-drift');
  const registered = input.registry.entries.find((entry) => entry.runner_id === value.runner_id && entry.public_key_fingerprint === value.signature.public_key_fingerprint);
  if (!registered) reasons.push('trusted-runner-not-registered');
  else if (registered.status !== 'active') reasons.push('trusted-runner-not-active');
  const issued = Date.parse(value.issued_at);
  const expires = Date.parse(value.expires_at);
  const now = Date.parse(input.now ?? new Date().toISOString());
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || !Number.isFinite(now) || issued >= expires || now < issued) reasons.push('trusted-environment-proof-invalid');
  if (Number.isFinite(expires) && Number.isFinite(now) && now >= expires) reasons.push('trusted-environment-proof-expired');
  return reasons.length === 0 ? { status: 'accepted' } : { status: 'blocked', reasons: [...new Set(reasons)].sort() };
}

export function createFakeTrustedEnvironmentProof(input: { runner_id: string; execution: TrustedEnvironmentExecution; now?: () => string; expires_in_ms?: number; network_evidence_digest: string; credential_evidence_digest: string; allowlist_digest?: string }): { execution: TrustedEnvironmentExecution; proof: TrustedEnvironmentProof; registry: TrustedEnvironmentRegistry; private_key_pem: string } {
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicKeyPem = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const fingerprint = createHash('sha256').update(keys.publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
  const now = input.now ?? (() => new Date().toISOString());
  const issuedAt = now();
  const entries = [{ runner_id: input.runner_id, public_key_fingerprint: fingerprint, status: 'active' as const }];
  const registry = { revision: 1, entries, digest: trustedEnvironmentRegistryDigest(entries) };
  const execution = { ...input.execution, registry_snapshot_digest: registry.digest };
  const unsigned = {
    schema: TRUSTED_ENVIRONMENT_PROOF_SCHEMA,
    status: 'signed' as const,
    proof_source: 'trusted-runner' as const,
    proof_stage: 'pre-launch' as const,
    runner_isolation: 'protected-sandbox' as const,
    runner_id: input.runner_id,
    runner_version: 'fake-environment-runner-1',
    ...execution,
    network_denied: { status: 'proved' as const, evidence_digest: input.network_evidence_digest },
    credentials: { status: 'clean' as const, evidence_digest: input.credential_evidence_digest, allowlist_digest: input.allowlist_digest ?? `sha256:${'a'.repeat(64)}` },
    issued_at: issuedAt,
    expires_at: new Date(Date.parse(issuedAt) + (input.expires_in_ms ?? 300_000)).toISOString(),
  };
  const proof_digest = trustedEnvironmentProofDigest(unsigned);
  return { execution, proof: { ...unsigned, proof_digest, signature: signatureFor(proof_digest, keys.privateKey, publicKeyPem, fingerprint) }, registry, private_key_pem: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
}
