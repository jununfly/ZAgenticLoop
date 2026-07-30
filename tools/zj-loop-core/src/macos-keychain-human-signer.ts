import { createHash, createPublicKey } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { HumanSigner, HumanSignerIdentity, HumanSignature } from './human-signer.js';
import { HUMAN_SIGNATURE_SCHEMA, HUMAN_SIGNER_SCHEMA, normalizeP256EcdsaDer } from './human-signer.js';

type BridgeResponse = { public_key_spki_base64: string; public_key_fingerprint: string; signature_base64?: string };

function requireText(value: string, error: string): string {
  if (!value.trim()) throw new Error(error);
  return value;
}

function spkiPem(base64: string): string {
  const der = Buffer.from(base64, 'base64');
  const lines = der.toString('base64').match(/.{1,64}/g) ?? [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----\n`;
}

function validateBridgeKey(response: BridgeResponse): { pem: string; fingerprint: string } {
  const der = Buffer.from(response.public_key_spki_base64, 'base64');
  const key = createPublicKey({ key: der, format: 'der', type: 'spki' });
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error('macos-keychain-public-key-invalid');
  const fingerprint = createHash('sha256').update(der).digest('hex');
  if (response.public_key_fingerprint !== fingerprint) throw new Error('macos-keychain-fingerprint-mismatch');
  return { pem: spkiPem(response.public_key_spki_base64), fingerprint };
}

function runHelper(input: { helper_path: string; command: 'identity' | 'sign' | 'delete'; key_tag: string; payload?: Uint8Array }): Promise<BridgeResponse> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.helper_path, [input.command, input.key_tag], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) { reject(new Error(stderr.trim() || 'macos-keychain-helper-failed')); return; }
      try { resolve(JSON.parse(stdout) as BridgeResponse); } catch { reject(new Error('macos-keychain-helper-response-invalid')); }
    });
    if (input.payload) child.stdin.end(JSON.stringify({ payload_base64: Buffer.from(input.payload).toString('base64') }));
    else child.stdin.end();
  });
}

export function createMacOSKeychainHumanSigner(input: { human_id: string; key_tag: string; helper_path: string }): HumanSigner {
  if (process.platform !== 'darwin') throw new Error('macos-keychain-unavailable');
  const humanId = requireText(input.human_id, 'human-id-required');
  const keyTag = requireText(input.key_tag, 'key-tag-required');
  const helperPath = requireText(input.helper_path, 'macos-keychain-helper-path-required');
  let cachedIdentity: HumanSignerIdentity | null = null;
  const identity = async (): Promise<HumanSignerIdentity> => {
    const response = await runHelper({ helper_path: helperPath, command: 'identity', key_tag: keyTag });
    const key = validateBridgeKey(response);
    const result: HumanSignerIdentity = { schema: HUMAN_SIGNER_SCHEMA, human_id: humanId, algorithm: 'ECDSA-P256', public_key_pem: key.pem, public_key_fingerprint: key.fingerprint };
    cachedIdentity = result;
    return { ...result };
  };
  return {
    getPublicIdentity: () => cachedIdentity ? { ...cachedIdentity } : identity(),
    async sign(signInput) {
      if (!(signInput.payload instanceof Uint8Array)) throw new Error('human-signature-payload-required');
      const response = await runHelper({ helper_path: helperPath, command: 'sign', key_tag: keyTag, payload: signInput.payload });
      const key = validateBridgeKey(response);
      const current = cachedIdentity ?? await identity();
      if (current.public_key_fingerprint !== key.fingerprint) throw new Error('macos-keychain-identity-changed');
      if (!response.signature_base64) throw new Error('macos-keychain-signature-missing');
      const signature: HumanSignature = { schema: HUMAN_SIGNATURE_SCHEMA, algorithm: 'ECDSA-P256', public_key_fingerprint: key.fingerprint, signature_base64: Buffer.from(normalizeP256EcdsaDer(Buffer.from(response.signature_base64, 'base64'))).toString('base64') };
      return signature;
    },
  };
}
