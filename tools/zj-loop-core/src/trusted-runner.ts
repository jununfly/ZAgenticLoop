import canonicalize from 'canonicalize';
import { createHash, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import type { ProviderAuthRef } from './provider-auth-runtime.js';

export const TRUSTED_RUNNER_PROTOCOL_SCHEMA = 'zj-loop.trusted_runner_protocol.v1' as const;
export const TRUSTED_RUNNER_PROOF_SCHEMA = 'zj-loop.trusted_runner_proof.v1' as const;
export const TRUSTED_RUNNER_OBSERVATION_SCHEMA = 'zj-loop.trusted_runner_observation.v1' as const;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

export type TrustedRunnerExecutionContext = {
  runner_id: string;
  registry_revision: number;
  execution_id: string;
  attempt: number;
  preflight_digest: string;
  registry_snapshot_digest: string;
  capabilities_digest: string;
  provider_auth_ref: ProviderAuthRef;
  helper: { helper_id: string; helper_version: string; protocol_version: typeof TRUSTED_RUNNER_PROTOCOL_SCHEMA; executable_digest: string };
};

export type TrustedRunnerProcessBoundary = {
  kind: 'process-group' | 'job-object';
  process_group_id: string | null;
  job_object_id: string | null;
  child_process_count: number;
  all_descendants_terminated: boolean;
  termination_sequence_digest: string;
  orphan_processes_detected: boolean;
  unknown_descendants_detected: boolean;
};

export type TrustedRunnerProof = {
  schema: typeof TRUSTED_RUNNER_PROOF_SCHEMA;
  status: 'signed' | 'blocked';
  runner_id: string;
  runner_version: string;
  registry_revision: number;
  execution_id: string;
  attempt: number;
  preflight_digest: string;
  registry_snapshot_digest: string;
  capabilities_digest: string;
  helper_digest: string;
  issued_at: string;
  expires_at: string;
  proof_digest: string;
  signature: TrustedRunnerSignature;
};

export type TrustedRunnerObservation = {
  schema: typeof TRUSTED_RUNNER_OBSERVATION_SCHEMA;
  status: 'signed' | 'uncertain';
  runner_id: string;
  registry_revision: number;
  execution_id: string;
  attempt: number;
  preflight_digest: string;
  proof_digest: string;
  registry_snapshot_digest: string;
  capabilities_digest: string;
  stdout_digest: string;
  stderr_digest: string;
  stdout_bytes: number;
  stderr_bytes: number;
  output_truncated: boolean;
  process_boundary: TrustedRunnerProcessBoundary;
  signature: TrustedRunnerSignature;
};

export type TrustedRunnerSignature = { algorithm: 'ECDSA-P256'; public_key_pem: string; public_key_fingerprint: string; signature_base64: string };

export type TrustedRunner = {
  prepareExecution(input: { execution: TrustedRunnerExecutionContext }): Promise<TrustedRunnerProof>;
  launch(input: { execution: TrustedRunnerExecutionContext; proof: TrustedRunnerProof }): Promise<{ status: 'launched'; execution_id: string; attempt: number; process_boundary: TrustedRunnerProcessBoundary }>;
  observe(input: { execution: TrustedRunnerExecutionContext; proof: TrustedRunnerProof; launch: { process_boundary: TrustedRunnerProcessBoundary }; output: { stdout: string; stderr: string } }): Promise<TrustedRunnerObservation>;
  verifyBoundary(observation: TrustedRunnerObservation): { status: 'proved' | 'blocked'; reason?: string };
};

function digest(value: unknown): value is string { return typeof value === 'string' && DIGEST.test(value); }
function canonicalDigest(value: unknown, error: string): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error(error);
  return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}
function bytesDigest(value: string): string { return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`; }
function signatureFor(value: string, privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'], publicKeyPem: string, fingerprint: string): TrustedRunnerSignature {
  return { algorithm: 'ECDSA-P256', public_key_pem: publicKeyPem, public_key_fingerprint: fingerprint, signature_base64: sign('sha256', Buffer.from(value, 'utf8'), privateKey).toString('base64') };
}
function validSignature(value: string, signature: TrustedRunnerSignature): boolean {
  if (signature.algorithm !== 'ECDSA-P256' || !signature.public_key_pem || !/^[0-9a-f]{64}$/.test(signature.public_key_fingerprint) || !signature.signature_base64) return false;
  try {
    const publicKey = createPublicKey(signature.public_key_pem);
    const fingerprint = createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
    return fingerprint === signature.public_key_fingerprint && verify('sha256', Buffer.from(value, 'utf8'), publicKey, Buffer.from(signature.signature_base64, 'base64'));
  } catch { return false; }
}
export function trustedRunnerProofDigest(proof: Omit<TrustedRunnerProof, 'proof_digest' | 'signature'>): string {
  return canonicalDigest(proof, 'trusted-runner-proof-canonicalization-invalid');
}

export function trustedRunnerObservationDigest(observation: Omit<TrustedRunnerObservation, 'signature'>): string {
  return canonicalDigest(observation, 'trusted-runner-observation-canonicalization-invalid');
}

export function createFakeTrustedRunner(input: { runner_id: string; runner_version?: string; now?: () => string; expires_in_ms?: number; boundary?: TrustedRunnerProcessBoundary }): TrustedRunner {
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicKeyPem = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const fingerprint = createHash('sha256').update(keys.publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
  const now = input.now ?? (() => new Date().toISOString());
  const runnerVersion = input.runner_version ?? 'fake-1';
  const boundary = input.boundary ?? { kind: 'process-group', process_group_id: `pg-${input.runner_id}`, job_object_id: null, child_process_count: 1, all_descendants_terminated: true, termination_sequence_digest: bytesDigest('terminated'), orphan_processes_detected: false, unknown_descendants_detected: false };
  return {
    async prepareExecution({ execution }) {
      if (execution.runner_id !== input.runner_id || !execution.execution_id || !Number.isInteger(execution.registry_revision) || execution.registry_revision < 1 || execution.attempt < 1 || !digest(execution.preflight_digest) || !digest(execution.registry_snapshot_digest) || !digest(execution.capabilities_digest) || !digest(execution.helper.executable_digest)) throw new Error('trusted-runner-execution-context-invalid');
      const issuedAt = now();
      const expiresAt = new Date(Date.parse(issuedAt) + (input.expires_in_ms ?? 300_000)).toISOString();
      const unsigned = { schema: TRUSTED_RUNNER_PROOF_SCHEMA, status: 'signed' as const, runner_id: execution.runner_id, runner_version: runnerVersion, registry_revision: execution.registry_revision, execution_id: execution.execution_id, attempt: execution.attempt, preflight_digest: execution.preflight_digest, registry_snapshot_digest: execution.registry_snapshot_digest, capabilities_digest: execution.capabilities_digest, helper_digest: execution.helper.executable_digest, issued_at: issuedAt, expires_at: expiresAt };
      const proof_digest = trustedRunnerProofDigest(unsigned);
      return { ...unsigned, proof_digest, signature: signatureFor(proof_digest, keys.privateKey, publicKeyPem, fingerprint) };
    },
    async launch({ execution, proof }) {
      if (proof.status !== 'signed' || proof.runner_id !== execution.runner_id || proof.registry_revision !== execution.registry_revision || proof.execution_id !== execution.execution_id || proof.attempt !== execution.attempt || proof.preflight_digest !== execution.preflight_digest || proof.registry_snapshot_digest !== execution.registry_snapshot_digest || proof.capabilities_digest !== execution.capabilities_digest || proof.proof_digest !== trustedRunnerProofDigest({ schema: proof.schema, status: proof.status, runner_id: proof.runner_id, runner_version: proof.runner_version, registry_revision: proof.registry_revision, execution_id: proof.execution_id, attempt: proof.attempt, preflight_digest: proof.preflight_digest, registry_snapshot_digest: proof.registry_snapshot_digest, capabilities_digest: proof.capabilities_digest, helper_digest: proof.helper_digest, issued_at: proof.issued_at, expires_at: proof.expires_at }) || !validSignature(proof.proof_digest, proof.signature)) throw new Error('trusted-runner-proof-invalid');
      return { status: 'launched', execution_id: execution.execution_id, attempt: execution.attempt, process_boundary: { ...boundary } };
    },
    async observe({ execution, proof, launch, output }) {
      if (proof.runner_id !== execution.runner_id || proof.registry_revision !== execution.registry_revision || proof.registry_snapshot_digest !== execution.registry_snapshot_digest || proof.capabilities_digest !== execution.capabilities_digest) throw new Error('trusted-runner-proof-binding-invalid');
      const unsigned = { schema: TRUSTED_RUNNER_OBSERVATION_SCHEMA, status: 'signed' as const, runner_id: execution.runner_id, registry_revision: execution.registry_revision, execution_id: execution.execution_id, attempt: execution.attempt, preflight_digest: execution.preflight_digest, proof_digest: proof.proof_digest, registry_snapshot_digest: execution.registry_snapshot_digest, capabilities_digest: execution.capabilities_digest, stdout_digest: bytesDigest(output.stdout), stderr_digest: bytesDigest(output.stderr), stdout_bytes: Buffer.byteLength(output.stdout, 'utf8'), stderr_bytes: Buffer.byteLength(output.stderr, 'utf8'), output_truncated: false, process_boundary: { ...launch.process_boundary } };
      const observation_digest = trustedRunnerObservationDigest(unsigned);
      return { ...unsigned, signature: signatureFor(observation_digest, keys.privateKey, publicKeyPem, fingerprint) };
    },
    verifyBoundary(observation) {
      const { signature, ...unsigned } = observation;
      if (observation.status !== 'signed' || !validSignature(trustedRunnerObservationDigest(unsigned), signature)) return { status: 'blocked', reason: 'trusted-runner-observation-invalid' };
      const value = observation.process_boundary;
      if (value.all_descendants_terminated && !value.orphan_processes_detected && !value.unknown_descendants_detected) return { status: 'proved' };
      return { status: 'blocked', reason: 'trusted-runner-process-boundary-invalid' };
    },
  };
}
