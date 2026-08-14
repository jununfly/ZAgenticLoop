import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { HumanSigner, HumanSignerIdentity, HumanSignature } from './human-signer.js';
import { HUMAN_SIGNATURE_SCHEMA, HUMAN_SIGNER_SCHEMA, normalizeP256EcdsaDer } from './human-signer.js';

function requireText(value: string, error: string): string {
  if (!value.trim()) throw new Error(error);
  return value;
}

function identityFromKey(humanId: string, keyPem: string): { identity: HumanSignerIdentity; privateKey: ReturnType<typeof createPrivateKey> } {
  const privateKey = createPrivateKey(keyPem);
  const publicKey = createPublicKey(privateKey);
  if (publicKey.asymmetricKeyType !== 'ec' || publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error('pem-human-signer-p256-required');
  const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
  const fingerprint = createHash('sha256').update(publicKeyDer).digest('hex');
  return {
    privateKey,
    identity: { schema: HUMAN_SIGNER_SCHEMA, human_id: humanId, algorithm: 'ECDSA-P256', public_key_pem: publicKey.export({ type: 'spki', format: 'pem' }).toString(), public_key_fingerprint: fingerprint },
  };
}

export function createPemFileHumanSigner(input: { human_id: string; private_key_path: string }): HumanSigner {
  const humanId = requireText(input.human_id, 'human-id-required');
  const privateKeyPath = requireText(input.private_key_path, 'human-signer-private-key-path-required');
  let cached: { identity: HumanSignerIdentity; privateKey: ReturnType<typeof createPrivateKey> } | null = null;
  const load = async () => {
    const current = identityFromKey(humanId, await readFile(privateKeyPath, 'utf8'));
    if (cached && cached.identity.public_key_fingerprint !== current.identity.public_key_fingerprint) throw new Error('pem-human-signer-identity-changed');
    cached = current;
    return current;
  };
  return {
    getPublicIdentity: async () => (await load()).identity,
    async sign(input) {
      if (!(input.payload instanceof Uint8Array)) throw new Error('human-signature-payload-required');
      const current = await load();
      const signature = normalizeP256EcdsaDer(sign('sha256', Buffer.from(input.payload), current.privateKey));
      return { schema: HUMAN_SIGNATURE_SCHEMA, algorithm: 'ECDSA-P256', public_key_fingerprint: current.identity.public_key_fingerprint, signature_base64: Buffer.from(signature).toString('base64') } as HumanSignature;
    },
  };
}
