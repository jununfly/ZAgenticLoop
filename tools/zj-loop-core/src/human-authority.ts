import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';

export const HUMAN_AUTHORITY_SCHEMA = 'zj-loop.human_authority.v1' as const;

export type HumanPublicIdentity = {
  schema: typeof HUMAN_AUTHORITY_SCHEMA;
  human_id: string;
  algorithm: 'Ed25519';
  public_key_pem: string;
  public_key_fingerprint: string;
};

export type HumanApprovalContext = {
  schema: typeof HUMAN_AUTHORITY_SCHEMA;
  human_id: string;
  public_key_fingerprint: string;
  action: string;
  request_id: string;
  request_digest: string;
  issued_at: string;
  expires_at: string;
  payload_digest: string;
  signature_base64: string;
};

export type RecoveryMaterial = {
  public_identifier: string;
  secret: string;
};

export type HumanAuthorityProvider = {
  getPublicIdentity(): HumanPublicIdentity;
  signApprovalContext(input: { action: string; request_id: string; request_digest: string; issued_at?: string; expires_at?: string }): Promise<HumanApprovalContext>;
  createRecoveryMaterial(): Promise<RecoveryMaterial>;
  rotateRecoveryMaterial(): Promise<RecoveryMaterial>;
  verifyRecoveryMaterial(secret: string): Promise<boolean>;
};

function requireText(value: string, error: string): string {
  if (!value.trim()) throw new Error(error);
  return value;
}

function canonicalJson(value: Record<string, string>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))));
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function now(): string {
  return new Date().toISOString();
}

export function createInMemoryHumanAuthorityProvider(input: { human_id: string }): HumanAuthorityProvider {
  const humanId = requireText(input.human_id, 'human-id-required');
  const keys = generateKeyPairSync('ed25519');
  const publicKeyPem = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const publicKeyFingerprint = createHash('sha256').update(keys.publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
  let recoveryHash: string | null = null;
  const identity = (): HumanPublicIdentity => ({ schema: HUMAN_AUTHORITY_SCHEMA, human_id: humanId, algorithm: 'Ed25519', public_key_pem: publicKeyPem, public_key_fingerprint: publicKeyFingerprint });
  const createRecovery = (): RecoveryMaterial => {
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
      const payloadDigest = digest(canonicalJson({ action, request_id: requestId, request_digest: requestDigest, human_id: humanId, issued_at: issuedAt, expires_at: expiresAt }));
      const signature = sign(null, Buffer.from(payloadDigest, 'utf8'), keys.privateKey);
      return { schema: HUMAN_AUTHORITY_SCHEMA, human_id: humanId, public_key_fingerprint: publicKeyFingerprint, action, request_id: requestId, request_digest: requestDigest, issued_at: issuedAt, expires_at: expiresAt, payload_digest: payloadDigest, signature_base64: signature.toString('base64') };
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
