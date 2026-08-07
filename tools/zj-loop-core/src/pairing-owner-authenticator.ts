import { createHash, createPublicKey, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { verifyHumanApprovalContext, type HumanApprovalContext, type HumanPublicIdentity } from './human-authority.js';
import type { PairingOwnerAuthenticator } from './pairing-http-server.js';
import { HUMAN_AUTHORITY_V2_SCHEMA } from './human-authority.js';

export const PAIRING_OWNER_AUTHENTICATOR_SCHEMA = 'zj-loop.pairing_owner_authenticator.v1' as const;

function requireText(value: string, error: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(error);
  return value;
}

function bearerMatches(authorization: string | null, expected: string): boolean {
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false;
  const received = Buffer.from(authorization.slice('Bearer '.length), 'utf8');
  const token = Buffer.from(expected, 'utf8');
  return received.length === token.length && timingSafeEqual(received, token);
}

function blocked(): { status: 'blocked'; reason: 'owner-not-authorized' } {
  return { status: 'blocked', reason: 'owner-not-authorized' };
}

export function createPairingOwnerAuthenticator(input: {
  identity: HumanPublicIdentity;
  owner_token: string;
  now?: () => string;
}): PairingOwnerAuthenticator {
  requireText(input.owner_token, 'pairing-owner-token-required');
  if (!input.identity || typeof input.identity !== 'object') throw new Error('pairing-owner-identity-required');
  const now = input.now ?? (() => new Date().toISOString());
  return {
    authenticate(request) {
      if (!bearerMatches(request.authorization, input.owner_token)) return blocked();
      if (request.action === 'pairing.list' || request.action === 'pairing.inbox') return { status: 'allowed', human_id: input.identity.human_id };
      const context = request.context;
      if (!context || !request.request_id || !request.request_digest || context.action !== request.action || context.request_id !== request.request_id || context.request_digest !== request.request_digest) return blocked();
      if (request.action === 'pairing.approve' && request.require_v2 !== true) return blocked();
      if (request.action === 'pairing.approve' && (!request.peer_fingerprint || context.device_fingerprint !== request.peer_fingerprint)) return blocked();
      if (!verifyHumanApprovalContext({ identity: input.identity, context: context as HumanApprovalContext, now: now(), require_v2: request.action === 'pairing.approve' })) return blocked();
      return { status: 'allowed', human_id: input.identity.human_id };
    },
  };
}

export async function loadPairingOwnerIdentity(input: { human_id: string; public_key_path: string }): Promise<HumanPublicIdentity> {
  requireText(input.human_id, 'pairing-owner-human-id-required');
  requireText(input.public_key_path, 'pairing-owner-public-key-path-required');
  const publicKeyPem = await readFile(input.public_key_path, 'utf8');
  const publicKey = createPublicKey(publicKeyPem);
  if (publicKey.asymmetricKeyType !== 'ec' || publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error('pairing-owner-public-key-invalid');
  const publicKeyFingerprint = createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
  return { schema: HUMAN_AUTHORITY_V2_SCHEMA, human_id: input.human_id, algorithm: 'ECDSA-P256', public_key_pem: publicKeyPem, public_key_fingerprint: publicKeyFingerprint };
}
