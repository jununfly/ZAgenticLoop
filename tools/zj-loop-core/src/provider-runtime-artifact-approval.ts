import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { verifyHumanSignature, type HumanSigner, type HumanSignerIdentity, type HumanSignature } from './human-signer.js';
import type { ProviderRuntimeArtifactManifest } from './provider-runtime-artifact-manifest.js';

export const PROVIDER_RUNTIME_ARTIFACT_APPROVAL_SCHEMA = 'zj-loop.provider_runtime_artifact_approval.v1' as const;
export const PROVIDER_RUNTIME_ARTIFACT_APPROVAL_ACTION = 'provider.runtime.artifact.approve' as const;
export const PROVIDER_RUNTIME_ARTIFACT_APPROVAL_PROFILE = 'provider-runtime-artifact-approval-v1-2026-08' as const;
const DOMAIN = 'ZJ-LOOP/PROVIDER-RUNTIME-ARTIFACT-APPROVAL/V1\0';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const FINGERPRINT = /^[0-9a-f]{64}$/;
const KEYS = new Set(['schema', 'action', 'canonicalization_profile', 'profile_sha256', 'approval_id', 'revision', 'network_id', 'node_id', 'device_id', 'artifact_id', 'manifest_digest', 'artifact_profile', 'platform', 'issued_at', 'expires_at', 'human_id', 'signer_fingerprint', 'side_effects_executed', 'canonical_payload_digest', 'signature']);

export type ProviderRuntimeArtifactApproval = {
  schema: typeof PROVIDER_RUNTIME_ARTIFACT_APPROVAL_SCHEMA;
  action: typeof PROVIDER_RUNTIME_ARTIFACT_APPROVAL_ACTION;
  canonicalization_profile: typeof PROVIDER_RUNTIME_ARTIFACT_APPROVAL_PROFILE;
  profile_sha256: string;
  approval_id: string;
  revision: number;
  network_id: string;
  node_id: string;
  device_id: string;
  artifact_id: string;
  manifest_digest: string;
  artifact_profile: ProviderRuntimeArtifactManifest['profile'];
  platform: ProviderRuntimeArtifactManifest['platform'];
  issued_at: string;
  expires_at: string;
  human_id: string;
  signer_fingerprint: string;
  side_effects_executed: false;
  canonical_payload_digest: string;
  signature: HumanSignature;
};

type ApprovalPayload = Omit<ProviderRuntimeArtifactApproval, 'canonical_payload_digest' | 'signature'>;

function canonical(value: unknown): string {
  const result = canonicalize(value);
  if (typeof result !== 'string') throw new Error('provider-runtime-artifact-approval-canonicalization-invalid');
  return result;
}

function digest(value: unknown): string { return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`; }
function profileDigest(): string { return digest({ schema: 'zj-loop.canonicalization_profile.v1', profile_id: PROVIDER_RUNTIME_ARTIFACT_APPROVAL_PROFILE, schema_version: PROVIDER_RUNTIME_ARTIFACT_APPROVAL_SCHEMA }); }
function payloadBytes(value: ApprovalPayload): Uint8Array {
  const domain = new TextEncoder().encode(DOMAIN);
  const body = new TextEncoder().encode(canonical(value));
  const result = new Uint8Array(domain.byteLength + body.byteLength);
  result.set(domain);
  result.set(body, domain.byteLength);
  return result;
}
function text(value: unknown): value is string { return typeof value === 'string' && value.trim() !== '' && !value.includes('\0'); }
function timestamp(value: unknown): value is string { return text(value) && Number.isFinite(Date.parse(value)); }

function payloadOf(value: ProviderRuntimeArtifactApproval): ApprovalPayload {
  const { canonical_payload_digest: _, signature: __, ...payload } = value;
  return payload;
}

function validateShape(value: unknown): value is ProviderRuntimeArtifactApproval {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).every((key) => KEYS.has(key))
    && item.schema === PROVIDER_RUNTIME_ARTIFACT_APPROVAL_SCHEMA
    && item.action === PROVIDER_RUNTIME_ARTIFACT_APPROVAL_ACTION
    && item.canonicalization_profile === PROVIDER_RUNTIME_ARTIFACT_APPROVAL_PROFILE
    && DIGEST.test(String(item.profile_sha256))
    && text(item.approval_id)
    && Number.isInteger(item.revision) && (item.revision as number) >= 1
    && text(item.network_id) && text(item.node_id) && text(item.device_id) && text(item.artifact_id)
    && DIGEST.test(String(item.manifest_digest))
    && (item.artifact_profile === 'development-local' || item.artifact_profile === 'production')
    && (item.platform === 'darwin' || item.platform === 'win32' || item.platform === 'linux')
    && timestamp(item.issued_at) && timestamp(item.expires_at) && Date.parse(item.issued_at as string) < Date.parse(item.expires_at as string)
    && text(item.human_id) && FINGERPRINT.test(String(item.signer_fingerprint))
    && item.side_effects_executed === false
    && DIGEST.test(String(item.canonical_payload_digest))
    && !!item.signature;
}

export async function createProviderRuntimeArtifactApproval(input: {
  signer: HumanSigner;
  network_id: string;
  node_id: string;
  device_id: string;
  manifest: Pick<ProviderRuntimeArtifactManifest, 'artifact_id' | 'manifest_digest' | 'profile' | 'platform'>;
  approval_id: string;
  revision: number;
  issued_at: string;
  expires_at: string;
}): Promise<ProviderRuntimeArtifactApproval> {
  if (!input.signer || typeof input.signer.sign !== 'function' || typeof input.signer.getPublicIdentity !== 'function') throw new Error('provider-runtime-artifact-approval-signer-required');
  if (!text(input.network_id) || !text(input.node_id) || !text(input.device_id) || !text(input.approval_id)) throw new Error('provider-runtime-artifact-approval-context-invalid');
  if (!Number.isInteger(input.revision) || input.revision < 1) throw new Error('provider-runtime-artifact-approval-revision-invalid');
  if (!text(input.manifest.artifact_id) || !DIGEST.test(input.manifest.manifest_digest) || (input.manifest.profile !== 'development-local' && input.manifest.profile !== 'production') || (input.manifest.platform !== 'darwin' && input.manifest.platform !== 'win32' && input.manifest.platform !== 'linux')) throw new Error('provider-runtime-artifact-approval-manifest-invalid');
  if (!timestamp(input.issued_at) || !timestamp(input.expires_at) || Date.parse(input.issued_at) >= Date.parse(input.expires_at)) throw new Error('provider-runtime-artifact-approval-time-invalid');
  const identity = await input.signer.getPublicIdentity();
  if (identity.schema !== 'zj-loop.human_signer.v1' || identity.algorithm !== 'ECDSA-P256' || !text(identity.human_id) || !FINGERPRINT.test(identity.public_key_fingerprint)) throw new Error('provider-runtime-artifact-approval-identity-invalid');
  const payload: ApprovalPayload = { schema: PROVIDER_RUNTIME_ARTIFACT_APPROVAL_SCHEMA, action: PROVIDER_RUNTIME_ARTIFACT_APPROVAL_ACTION, canonicalization_profile: PROVIDER_RUNTIME_ARTIFACT_APPROVAL_PROFILE, profile_sha256: profileDigest(), approval_id: input.approval_id, revision: input.revision, network_id: input.network_id, node_id: input.node_id, device_id: input.device_id, artifact_id: input.manifest.artifact_id, manifest_digest: input.manifest.manifest_digest, artifact_profile: input.manifest.profile, platform: input.manifest.platform, issued_at: input.issued_at, expires_at: input.expires_at, human_id: identity.human_id, signer_fingerprint: identity.public_key_fingerprint, side_effects_executed: false };
  return { ...payload, canonical_payload_digest: digest(payload), signature: await input.signer.sign({ payload: payloadBytes(payload) }) };
}

export function validateProviderRuntimeArtifactApproval(input: {
  approval: unknown;
  identity: HumanSignerIdentity;
  expected: { network_id: string; node_id: string; device_id: string; manifest: Pick<ProviderRuntimeArtifactManifest, 'artifact_id' | 'manifest_digest' | 'profile' | 'platform'> };
  now?: string;
  revoked?: boolean;
}): { status: 'valid'; approval: ProviderRuntimeArtifactApproval } | { status: 'blocked'; reason: string } {
  if (input.approval && typeof input.approval === 'object' && !Array.isArray(input.approval) && (input.approval as Record<string, unknown>).side_effects_executed !== false) return { status: 'blocked', reason: 'artifact-approval-safety-boundary-invalid' };
  if (!validateShape(input.approval)) return { status: 'blocked', reason: 'artifact-approval-invalid' };
  const approval = input.approval;
  if (approval.profile_sha256 !== profileDigest()) return { status: 'blocked', reason: 'artifact-approval-profile-invalid' };
  if (input.revoked) return { status: 'blocked', reason: 'artifact-approval-revoked' };
  if (approval.network_id !== input.expected.network_id || approval.node_id !== input.expected.node_id || approval.device_id !== input.expected.device_id) return { status: 'blocked', reason: 'artifact-approval-context-mismatch' };
  if (approval.artifact_id !== input.expected.manifest.artifact_id || approval.manifest_digest !== input.expected.manifest.manifest_digest || approval.artifact_profile !== input.expected.manifest.profile || approval.platform !== input.expected.manifest.platform) return { status: 'blocked', reason: 'artifact-approval-manifest-mismatch' };
  if (input.identity.schema !== 'zj-loop.human_signer.v1' || input.identity.algorithm !== 'ECDSA-P256' || input.identity.human_id !== approval.human_id || input.identity.public_key_fingerprint !== approval.signer_fingerprint || approval.signature.public_key_fingerprint !== approval.signer_fingerprint) return { status: 'blocked', reason: 'artifact-approval-human-identity-mismatch' };
  if (approval.canonical_payload_digest !== digest(payloadOf(approval))) return { status: 'blocked', reason: 'artifact-approval-payload-digest-invalid' };
  if (input.now !== undefined && (!timestamp(input.now) || Date.parse(input.now) < Date.parse(approval.issued_at))) return { status: 'blocked', reason: 'artifact-approval-issued-in-future' };
  if (input.now !== undefined && Date.parse(input.now) >= Date.parse(approval.expires_at)) return { status: 'blocked', reason: 'artifact-approval-expired' };
  if (!verifyHumanSignature({ identity: input.identity, payload: payloadBytes(payloadOf(approval)), signature: approval.signature })) return { status: 'blocked', reason: 'artifact-approval-signature-invalid' };
  return { status: 'valid', approval };
}
