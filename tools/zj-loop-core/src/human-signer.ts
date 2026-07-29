import { createHash, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';

export const HUMAN_SIGNER_SCHEMA = 'zj-loop.human_signer.v1' as const;
export const HUMAN_SIGNATURE_SCHEMA = 'zj-loop.human_signature.v1' as const;

export type HumanSignerIdentity = {
  schema: typeof HUMAN_SIGNER_SCHEMA;
  human_id: string;
  algorithm: 'ECDSA-P256';
  public_key_pem: string;
  public_key_fingerprint: string;
};

export type HumanSignature = {
  schema: typeof HUMAN_SIGNATURE_SCHEMA;
  algorithm: 'ECDSA-P256';
  public_key_fingerprint: string;
  signature_base64: string;
};

export type HumanSigner = {
  getPublicIdentity(): Promise<HumanSignerIdentity> | HumanSignerIdentity;
  sign(input: { payload: Uint8Array }): Promise<HumanSignature>;
};

function requireText(value: string, error: string): string {
  if (!value.trim()) throw new Error(error);
  return value;
}

function fingerprint(publicKey: ReturnType<typeof createPublicKey>): string {
  return createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
}

function cloneIdentity(identity: HumanSignerIdentity): HumanSignerIdentity {
  return { ...identity };
}

export function createInMemoryHumanSigner(input: { human_id: string }): HumanSigner {
  const humanId = requireText(input.human_id, 'human-id-required');
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicKey = keys.publicKey;
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const publicKeyFingerprint = fingerprint(publicKey);
  const identity: HumanSignerIdentity = { schema: HUMAN_SIGNER_SCHEMA, human_id: humanId, algorithm: 'ECDSA-P256', public_key_pem: publicKeyPem, public_key_fingerprint: publicKeyFingerprint };
  return {
    getPublicIdentity: () => cloneIdentity(identity),
    async sign(input) {
      if (!(input.payload instanceof Uint8Array)) throw new Error('human-signature-payload-required');
      return { schema: HUMAN_SIGNATURE_SCHEMA, algorithm: 'ECDSA-P256', public_key_fingerprint: publicKeyFingerprint, signature_base64: sign('sha256', Buffer.from(input.payload), keys.privateKey).toString('base64') };
    },
  };
}

export function verifyHumanSignature(input: { identity: HumanSignerIdentity; payload: Uint8Array; signature: HumanSignature }): boolean {
  if (input.identity.schema !== HUMAN_SIGNER_SCHEMA || input.identity.algorithm !== 'ECDSA-P256' || input.signature.schema !== HUMAN_SIGNATURE_SCHEMA || input.signature.algorithm !== 'ECDSA-P256') return false;
  if (!(input.payload instanceof Uint8Array) || !/^[0-9a-f]{64}$/.test(input.identity.public_key_fingerprint) || input.signature.public_key_fingerprint !== input.identity.public_key_fingerprint) return false;
  try {
    const publicKey = createPublicKey(input.identity.public_key_pem);
    if (publicKey.asymmetricKeyType !== 'ec' || publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1' || fingerprint(publicKey) !== input.identity.public_key_fingerprint) return false;
    return verify('sha256', Buffer.from(input.payload), publicKey, Buffer.from(input.signature.signature_base64, 'base64'));
  } catch {
    return false;
  }
}
