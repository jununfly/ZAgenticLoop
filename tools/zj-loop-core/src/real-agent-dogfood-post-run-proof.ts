import canonicalize from 'canonicalize';
import { createHash, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import type { TrustedRunnerProcessBoundary, TrustedRunnerSignature } from './trusted-runner.js';

export const REAL_AGENT_DOGFOOD_POST_RUN_PROOF_SCHEMA = 'zj-loop.real_agent_dogfood_post_run_proof.v1' as const;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

export type RealAgentDogfoodPostRunProof = {
  schema: typeof REAL_AGENT_DOGFOOD_POST_RUN_PROOF_SCHEMA;
  status: 'signed' | 'uncertain';
  runner_id: string;
  execution_id: string;
  attempt: number;
  worktree_path: string;
  executable_digest: string;
  stdout_digest: string;
  stderr_digest: string;
  process_boundary: TrustedRunnerProcessBoundary;
  after_worktree_clean: boolean;
  after_network_policy_proved: boolean;
  after_credentials_clean: boolean;
  side_effects_detected: boolean;
  issued_at: string;
  signature: TrustedRunnerSignature;
};

export type RealAgentDogfoodPostRunProofFactory = (input: {
  execution_id: string;
  attempt: number;
  worktree_path: string;
  executable_digest: string;
  stdout_digest: string;
  stderr_digest: string;
  provider_result: { status: string; success: boolean; pid: number; exit_code: number | null; signal: string | null };
}) => Promise<RealAgentDogfoodPostRunProof>;

function canonicalDigest(value: unknown): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('real-agent-dogfood-post-run-proof-canonicalization-invalid');
  return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}

function validDigest(value: unknown): boolean { return typeof value === 'string' && DIGEST.test(value); }

export function realAgentDogfoodPostRunProofDigest(proof: Omit<RealAgentDogfoodPostRunProof, 'signature'>): string { return canonicalDigest(proof); }

function validSignature(value: string, signature: TrustedRunnerSignature): boolean {
  if (signature.algorithm !== 'ECDSA-P256' || !signature.public_key_pem || !/^[0-9a-f]{64}$/.test(signature.public_key_fingerprint) || !signature.signature_base64) return false;
  try {
    const publicKey = createPublicKey(signature.public_key_pem);
    const fingerprint = createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
    return fingerprint === signature.public_key_fingerprint && verify('sha256', Buffer.from(value, 'utf8'), publicKey, Buffer.from(signature.signature_base64, 'base64'));
  } catch { return false; }
}

export function verifyRealAgentDogfoodPostRunProof(input: { proof: RealAgentDogfoodPostRunProof; execution_id: string; attempt: number; worktree_path: string; executable_digest: string; stdout_digest: string; stderr_digest: string }): { status: 'accepted' } | { status: 'blocked'; reasons: string[] } {
  const proof = input.proof;
  const reasons: string[] = [];
  if (proof.schema !== REAL_AGENT_DOGFOOD_POST_RUN_PROOF_SCHEMA || proof.status !== 'signed') reasons.push('post-run-proof-signature-missing');
  if (proof.execution_id !== input.execution_id || proof.attempt !== input.attempt || proof.worktree_path !== input.worktree_path || proof.executable_digest !== input.executable_digest || proof.stdout_digest !== input.stdout_digest || proof.stderr_digest !== input.stderr_digest) reasons.push('post-run-proof-binding-invalid');
  if (!validDigest(proof.executable_digest) || !validDigest(proof.stdout_digest) || !validDigest(proof.stderr_digest)) reasons.push('post-run-proof-digest-invalid');
  if (!proof.process_boundary?.all_descendants_terminated || proof.process_boundary.orphan_processes_detected || proof.process_boundary.unknown_descendants_detected) reasons.push('post-run-proof-process-boundary-invalid');
  if (!proof.after_worktree_clean || !proof.after_network_policy_proved || !proof.after_credentials_clean || proof.side_effects_detected) reasons.push('post-run-proof-safety-state-invalid');
  const { signature: _, ...unsigned } = proof;
  if (!validSignature(realAgentDogfoodPostRunProofDigest(unsigned), proof.signature)) reasons.push('post-run-proof-signature-invalid');
  return reasons.length === 0 ? { status: 'accepted' } : { status: 'blocked', reasons: [...new Set(reasons)].sort() };
}

export function createFakeRealAgentDogfoodPostRunProof(input: { runner_id?: string; execution_id: string; attempt: number; worktree_path: string; executable_digest: string; stdout_digest: string; stderr_digest: string; now?: string; process_boundary?: TrustedRunnerProcessBoundary; after_worktree_clean?: boolean; after_network_policy_proved?: boolean; after_credentials_clean?: boolean; side_effects_detected?: boolean }): RealAgentDogfoodPostRunProof {
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicKeyPem = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const fingerprint = createHash('sha256').update(keys.publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
  const unsigned: Omit<RealAgentDogfoodPostRunProof, 'signature'> = {
    schema: REAL_AGENT_DOGFOOD_POST_RUN_PROOF_SCHEMA,
    status: 'signed',
    runner_id: input.runner_id ?? 'fake-post-run-runner',
    execution_id: input.execution_id,
    attempt: input.attempt,
    worktree_path: input.worktree_path,
    executable_digest: input.executable_digest,
    stdout_digest: input.stdout_digest,
    stderr_digest: input.stderr_digest,
    process_boundary: input.process_boundary ?? { kind: 'process-group', process_group_id: 'pg-fake-post-run', job_object_id: null, child_process_count: 1, all_descendants_terminated: true, termination_sequence_digest: 'sha256:' + 'a'.repeat(64), orphan_processes_detected: false, unknown_descendants_detected: false },
    after_worktree_clean: input.after_worktree_clean ?? true,
    after_network_policy_proved: input.after_network_policy_proved ?? true,
    after_credentials_clean: input.after_credentials_clean ?? true,
    side_effects_detected: input.side_effects_detected ?? false,
    issued_at: input.now ?? new Date().toISOString(),
  };
  return { ...unsigned, signature: { algorithm: 'ECDSA-P256', public_key_pem: publicKeyPem, public_key_fingerprint: fingerprint, signature_base64: sign('sha256', Buffer.from(realAgentDogfoodPostRunProofDigest(unsigned), 'utf8'), keys.privateKey).toString('base64') } };
}
