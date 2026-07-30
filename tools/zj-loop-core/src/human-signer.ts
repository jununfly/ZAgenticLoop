import { createHash, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';

export const HUMAN_SIGNER_SCHEMA = 'zj-loop.human_signer.v1' as const;
export const HUMAN_SIGNATURE_SCHEMA = 'zj-loop.human_signature.v1' as const;

const P256_ORDER = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
const P256_HALF_ORDER = P256_ORDER / 2n;

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

function readDerInteger(bytes: Uint8Array, offset: number): { value: bigint; next: number } | null {
  if (bytes[offset] !== 0x02) return null;
  const length = bytes[offset + 1];
  if (length === undefined || length === 0 || length > 33 || offset + 2 + length > bytes.length) return null;
  const start = offset + 2;
  const end = start + length;
  const value = bytes.subarray(start, end);
  if (value[0] === 0 && (length === 1 || (value[1] & 0x80) === 0)) return null;
  if ((value[0] & 0x80) !== 0) return null;
  return { value: BigInt(`0x${Buffer.from(value).toString('hex')}`), next: end };
}

function isCanonicalLowSEcdsaDer(signature: Uint8Array): boolean {
  if (signature.length < 8 || signature[0] !== 0x30 || signature[1] !== signature.length - 2) return false;
  const r = readDerInteger(signature, 2);
  if (!r) return false;
  const s = readDerInteger(signature, r.next);
  if (!s || s.next !== signature.length || r.value <= 0n || r.value >= P256_ORDER || s.value <= 0n || s.value > P256_HALF_ORDER) return false;
  return true;
}

function encodeDerInteger(value: bigint): Buffer {
  let hex = value.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const bytes = Buffer.from(hex, 'hex');
  const content = bytes[0] >= 0x80 ? Buffer.concat([Buffer.from([0]), bytes]) : bytes;
  return Buffer.concat([Buffer.from([0x02, content.length]), content]);
}

export function normalizeP256EcdsaDer(signature: Uint8Array): Uint8Array {
  if (signature.length < 8 || signature[0] !== 0x30 || signature[1] !== signature.length - 2) throw new Error('human-signature-der-invalid');
  const r = readDerInteger(signature, 2);
  if (!r) throw new Error('human-signature-der-invalid');
  const s = readDerInteger(signature, r.next);
  if (!s || s.next !== signature.length || r.value <= 0n || r.value >= P256_ORDER || s.value <= 0n || s.value >= P256_ORDER) throw new Error('human-signature-der-invalid');
  const lowS = s.value > P256_HALF_ORDER ? P256_ORDER - s.value : s.value;
  const body = Buffer.concat([encodeDerInteger(r.value), encodeDerInteger(lowS)]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
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
      const signature = normalizeP256EcdsaDer(sign('sha256', Buffer.from(input.payload), keys.privateKey));
      return { schema: HUMAN_SIGNATURE_SCHEMA, algorithm: 'ECDSA-P256', public_key_fingerprint: publicKeyFingerprint, signature_base64: Buffer.from(signature).toString('base64') };
    },
  };
}

export function verifyHumanSignature(input: { identity: HumanSignerIdentity; payload: Uint8Array; signature: HumanSignature }): boolean {
  if (input.identity.schema !== HUMAN_SIGNER_SCHEMA || input.identity.algorithm !== 'ECDSA-P256' || input.signature.schema !== HUMAN_SIGNATURE_SCHEMA || input.signature.algorithm !== 'ECDSA-P256') return false;
  if (!(input.payload instanceof Uint8Array) || !/^[0-9a-f]{64}$/.test(input.identity.public_key_fingerprint) || input.signature.public_key_fingerprint !== input.identity.public_key_fingerprint) return false;
  try {
    const signatureBytes = Buffer.from(input.signature.signature_base64, 'base64');
    if (!isCanonicalLowSEcdsaDer(signatureBytes)) return false;
    const publicKey = createPublicKey(input.identity.public_key_pem);
    if (publicKey.asymmetricKeyType !== 'ec' || publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1' || fingerprint(publicKey) !== input.identity.public_key_fingerprint) return false;
    return verify('sha256', Buffer.from(input.payload), publicKey, signatureBytes);
  } catch {
    return false;
  }
}
