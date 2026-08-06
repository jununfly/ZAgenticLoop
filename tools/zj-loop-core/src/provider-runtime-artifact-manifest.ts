import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const PROVIDER_RUNTIME_ARTIFACT_MANIFEST_SCHEMA = 'zj-loop.provider_runtime_artifact_manifest.v1' as const;

export type ProviderRuntimeArtifactTrustProfile = 'development-local' | 'production';

export type ProviderRuntimeArtifactManifest = {
  schema: typeof PROVIDER_RUNTIME_ARTIFACT_MANIFEST_SCHEMA;
  artifact_id: string;
  profile: ProviderRuntimeArtifactTrustProfile;
  platform: 'darwin' | 'win32' | 'linux';
  runtime_artifact_digest: string;
  helper_artifact_digest: string;
  runtime_code_directory_hash: string;
  helper_code_directory_hash: string;
  signing: {
    kind: 'ad-hoc' | 'developer-id';
    identifier: string;
    team_id: string | null;
    notarized: boolean;
  };
  version: string;
  created_at: string;
  manifest_digest: string;
};

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const HEX = /^[0-9a-f]{20,128}$/;
const KEYS = new Set(['schema', 'artifact_id', 'profile', 'platform', 'runtime_artifact_digest', 'helper_artifact_digest', 'runtime_code_directory_hash', 'helper_code_directory_hash', 'signing', 'version', 'created_at', 'manifest_digest']);
const SIGNING_KEYS = new Set(['kind', 'identifier', 'team_id', 'notarized']);

function canonical(value: unknown): string {
  const result = canonicalize(value);
  if (typeof result !== 'string') throw new Error('provider-runtime-artifact-manifest-canonicalization-invalid');
  return result;
}

function digest(value: Omit<ProviderRuntimeArtifactManifest, 'manifest_digest'>): string {
  return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`;
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && !value.includes('\0');
}

function validUnsigned(value: Record<string, unknown>): boolean {
  const signing = value.signing as Record<string, unknown> | undefined;
  return Object.keys(value).every((key) => KEYS.has(key))
    && value.schema === PROVIDER_RUNTIME_ARTIFACT_MANIFEST_SCHEMA
    && text(value.artifact_id)
    && (value.profile === 'development-local' || value.profile === 'production')
    && (value.platform === 'darwin' || value.platform === 'win32' || value.platform === 'linux')
    && DIGEST.test(String(value.runtime_artifact_digest))
    && DIGEST.test(String(value.helper_artifact_digest))
    && HEX.test(String(value.runtime_code_directory_hash))
    && HEX.test(String(value.helper_code_directory_hash))
    && !!signing
    && Object.keys(signing).every((key) => SIGNING_KEYS.has(key))
    && (signing.kind === 'ad-hoc' || signing.kind === 'developer-id')
    && text(signing.identifier)
    && (signing.team_id === null || text(signing.team_id))
    && typeof signing.notarized === 'boolean'
    && text(value.version)
    && Number.isFinite(Date.parse(String(value.created_at)));
}

export function providerRuntimeArtifactManifestDigest(value: ProviderRuntimeArtifactManifest): string {
  const { manifest_digest: _, ...unsigned } = value;
  return digest(unsigned);
}

export function createProviderRuntimeArtifactManifest(input: Omit<ProviderRuntimeArtifactManifest, 'schema' | 'manifest_digest'>): ProviderRuntimeArtifactManifest {
  const unsigned = { schema: PROVIDER_RUNTIME_ARTIFACT_MANIFEST_SCHEMA, ...structuredClone(input) } as Omit<ProviderRuntimeArtifactManifest, 'manifest_digest'>;
  if (!validUnsigned(unsigned)) throw new Error('provider-runtime-artifact-manifest-invalid');
  return Object.freeze({ ...unsigned, manifest_digest: digest(unsigned) });
}

export function validateProviderRuntimeArtifactManifest(input: unknown, options?: { profile?: ProviderRuntimeArtifactTrustProfile }): { status: 'valid'; manifest: ProviderRuntimeArtifactManifest } | { status: 'blocked'; reason: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { status: 'blocked', reason: 'provider-runtime-artifact-manifest-invalid' };
  const value = input as Record<string, unknown>;
  if (!validUnsigned(value) || !DIGEST.test(String(value.manifest_digest))) return { status: 'blocked', reason: 'provider-runtime-artifact-manifest-invalid' };
  const { manifest_digest: manifestDigest, ...unsigned } = value;
  if (manifestDigest !== digest(unsigned as Omit<ProviderRuntimeArtifactManifest, 'manifest_digest'>)) return { status: 'blocked', reason: 'provider-runtime-artifact-manifest-digest-invalid' };
  if (options?.profile && value.profile !== options.profile) return { status: 'blocked', reason: 'provider-runtime-artifact-profile-mismatch' };
  const signing = value.signing as ProviderRuntimeArtifactManifest['signing'];
  if (value.profile === 'development-local') {
    if (signing.kind !== 'ad-hoc' || signing.team_id !== null || signing.notarized) return { status: 'blocked', reason: 'provider-runtime-development-signing-policy-invalid' };
  } else if (signing.kind !== 'developer-id' || !signing.team_id || !signing.notarized) {
    return { status: 'blocked', reason: 'provider-runtime-production-signing-policy-invalid' };
  }
  return { status: 'valid', manifest: value as ProviderRuntimeArtifactManifest };
}

export async function readProviderRuntimeArtifactManifest(filePath: string): Promise<ProviderRuntimeArtifactManifest> {
  if (typeof filePath !== 'string' || !filePath.startsWith('/') || filePath.includes('\0')) throw new Error('provider-runtime-artifact-manifest-path-invalid');
  return JSON.parse(await readFile(filePath, 'utf8')) as ProviderRuntimeArtifactManifest;
}
