import canonicalize from 'canonicalize';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import type { TrustedRunnerProcessBoundary, TrustedRunnerSignature } from './trusted-runner.js';
import { macosEnvironmentPolicyDigests, validateMacOSTrustedEnvironmentPolicy, verifyTrustedEnvironmentProof, type TrustedEnvironmentProof, type NetworkPolicyMode } from './trusted-environment-proof.js';

const DIGEST = /^sha256:[0-9a-f]{64}$/;
export const MACOS_TRUSTED_RUNNER_ADAPTER_SCHEMA = 'zj-loop.macos_trusted_runner_adapter.v1' as const;

export type MacOSTrustedRunnerObservation = {
  schema: 'zj-loop.macos_trusted_runner_observation.v1';
  status: 'completed' | 'timed-out';
  runner_id: string;
  execution_id: string;
  attempt: number;
  preflight_digest: string;
  proof_digest: string;
  registry_snapshot_digest: string;
  process_boundary: TrustedRunnerProcessBoundary;
  exit_code?: number;
  signal?: number;
  stdout: string;
  stderr: string;
  stdout_digest: string;
  stderr_digest: string;
  stdout_bytes: number;
  stderr_bytes: number;
  output_truncated: boolean;
  environment_proof: TrustedEnvironmentProof;
  signature: TrustedRunnerSignature;
};

export type MacOSTrustedRunnerExecution = {
  runner_id: string;
  execution_id: string;
  attempt: number;
  preflight_digest: string;
  proof_digest: string;
  registry_snapshot_digest: string;
  network_policy: { mode: NetworkPolicyMode; policy_digest: string };
};

export type MacOSTrustedEnvironment = { cwd: string; network_policy: { mode: NetworkPolicyMode }; sandbox_policy: string; env_allowlist: string[]; env: Record<string, string> };

export type MacOSTrustedRunnerRegistrySnapshot = {
  revision: number;
  digest: string;
  entries: Array<{ runner_id: string; public_key_fingerprint: string; status: 'active' | 'revoked' }>;
};

function digest(value: unknown): value is string { return typeof value === 'string' && DIGEST.test(value); }
function canonicalDigest(value: unknown): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('macos-trusted-runner-canonicalization-invalid');
  return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}
function observationPayload(observation: MacOSTrustedRunnerObservation): Omit<MacOSTrustedRunnerObservation, 'signature'> {
  const { signature: _, ...payload } = observation;
  return payload;
}
function validSignature(observation: MacOSTrustedRunnerObservation): boolean {
  const signature = observation.signature;
  if (signature.algorithm !== 'ECDSA-P256' || !signature.public_key_pem || !/^[0-9a-f]{64}$/.test(signature.public_key_fingerprint) || !signature.signature_base64) return false;
  try {
    const publicKey = createPublicKey(signature.public_key_pem);
    const fingerprint = createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
    return fingerprint === signature.public_key_fingerprint && verify('sha256', Buffer.from(canonicalize(observationPayload(observation)) as string, 'utf8'), publicKey, Buffer.from(signature.signature_base64, 'base64'));
  } catch { return false; }
}
function digestText(value: string): string { return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`; }
function digestArgv(argv: string[]): string {
  const json = canonicalize(argv);
  if (typeof json !== 'string') throw new Error('macos-trusted-runner-argv-canonicalization-invalid');
  return digestText(json);
}

export function verifyMacOSTrustedRunnerObservation(input: { observation: MacOSTrustedRunnerObservation; execution: MacOSTrustedRunnerExecution; registry: MacOSTrustedRunnerRegistrySnapshot; argv: string[]; environment: MacOSTrustedEnvironment }): { status: 'accepted' } | { status: 'blocked'; reasons: string[] } {
  const value = input.observation;
  const reasons: string[] = [];
  if (value.schema !== 'zj-loop.macos_trusted_runner_observation.v1' || value.status !== 'completed' && value.status !== 'timed-out' || value.runner_id !== input.execution.runner_id || value.execution_id !== input.execution.execution_id || value.attempt !== input.execution.attempt || value.preflight_digest !== input.execution.preflight_digest || value.proof_digest !== input.execution.proof_digest || value.registry_snapshot_digest !== input.execution.registry_snapshot_digest) reasons.push('macos-trusted-runner-observation-binding-invalid');
  if (!digest(value.stdout_digest) || !digest(value.stderr_digest) || !Number.isInteger(value.stdout_bytes) || !Number.isInteger(value.stderr_bytes) || value.output_truncated) reasons.push('macos-trusted-runner-output-invalid');
  if (!value.process_boundary.all_descendants_terminated || value.process_boundary.orphan_processes_detected || value.process_boundary.unknown_descendants_detected) reasons.push('macos-trusted-runner-process-boundary-invalid');
  if (input.registry.digest !== canonicalDigest(input.registry.entries) || input.registry.revision < 1 || input.registry.entries.find((entry) => entry.runner_id === value.runner_id && entry.public_key_fingerprint === value.signature.public_key_fingerprint && entry.status === 'active') === undefined) reasons.push('macos-trusted-runner-registry-invalid');
  if (!validSignature(value)) reasons.push('macos-trusted-runner-signature-invalid');
  if (!value.environment_proof) reasons.push('trusted-environment-proof-missing');
  else {
    const policyDigests = macosEnvironmentPolicyDigests(input.environment);
    const environment = verifyTrustedEnvironmentProof({
      proof: value.environment_proof,
      execution: { ...input.execution, argv_digest: digestArgv(input.argv), cwd_digest: digestText(input.environment.cwd), env_policy_digest: policyDigests.env_policy_digest, sandbox_policy_digest: policyDigests.sandbox_policy_digest, network_policy: { mode: input.environment.network_policy.mode, policy_digest: policyDigests.policy_digest } },
      registry: input.registry,
    });
    if (environment.status === 'blocked') reasons.push(...environment.reasons);
  }
  return reasons.length === 0 ? { status: 'accepted' } : { status: 'blocked', reasons: [...new Set(reasons)].sort() };
}

export function macosTrustedRunnerRegistryDigest(entries: MacOSTrustedRunnerRegistrySnapshot['entries']): string { return canonicalDigest(entries); }

export function createMacOSTrustedRunnerAdapter(input: { helper_path: string; helper_digest: string; helper_timeout_ms?: number; registry: MacOSTrustedRunnerRegistrySnapshot }): { run(request: { key_tag: string; execution: MacOSTrustedRunnerExecution; argv: string[]; environment: MacOSTrustedEnvironment; timeout_ms: number; termination_grace_ms: number }): Promise<{ status: 'accepted' | 'blocked' | 'outcome-uncertain'; observation?: MacOSTrustedRunnerObservation; reasons?: string[] }> } {
  return {
    async run(request) {
      if (process.platform !== 'darwin') return { status: 'blocked', reasons: ['macos-trusted-runner-platform-unsupported'] };
      if (!digest(input.helper_digest) || !request.key_tag || request.argv.length === 0 || !request.environment?.cwd) return { status: 'blocked', reasons: ['macos-trusted-runner-request-invalid'] };
      const policy = validateMacOSTrustedEnvironmentPolicy(request.environment);
      if (policy.status === 'blocked') return policy;
      const policyDigests = macosEnvironmentPolicyDigests(request.environment);
      const helper = await readFile(input.helper_path).catch(() => null);
      if (!helper || `sha256:${createHash('sha256').update(helper).digest('hex')}` !== input.helper_digest) return { status: 'blocked', reasons: ['macos-trusted-runner-helper-digest-invalid'] };
      return new Promise((resolve) => {
        const child = spawn(input.helper_path, [], { stdio: ['pipe', 'pipe', 'pipe'] });
        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];
        let bytes = 0;
        let overflow = false;
        const maxBytes = 2 * 1024 * 1024;
        child.stdout.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes <= maxBytes) stdout.push(chunk); else overflow = true; });
        child.stderr.on('data', (chunk: Buffer) => { if (Buffer.concat(stderr).length <= maxBytes) stderr.push(chunk); });
        const timer = setTimeout(() => child.kill('SIGTERM'), input.helper_timeout_ms ?? 30_000);
        child.on('error', () => { clearTimeout(timer); resolve({ status: 'outcome-uncertain', reasons: ['macos-trusted-runner-helper-process-error'] }); });
        child.on('close', (code) => {
          clearTimeout(timer);
          if (overflow) return resolve({ status: 'blocked', reasons: ['macos-trusted-runner-helper-output-too-large'] });
          if (code !== 0) return resolve({ status: 'outcome-uncertain', reasons: ['macos-trusted-runner-helper-exited-nonzero'] });
          try {
            const parsed = JSON.parse(Buffer.concat(stdout).toString('utf8')) as MacOSTrustedRunnerObservation;
            const checked = verifyMacOSTrustedRunnerObservation({ observation: parsed, execution: request.execution, registry: input.registry, argv: request.argv, environment: request.environment });
            resolve(checked.status === 'accepted' ? { status: 'accepted', observation: parsed } : checked);
          } catch { resolve({ status: 'blocked', reasons: ['macos-trusted-runner-protocol-invalid'] }); }
        });
        child.stdin.end(JSON.stringify({ schema: 'zj-loop.macos_trusted_runner_request.v1', key_tag: request.key_tag, ...request.execution, argv: request.argv, ...request.environment, ...policyDigests, network_policy: { mode: request.environment.network_policy.mode, policy_digest: policyDigests.policy_digest }, timeout_ms: request.timeout_ms, termination_grace_ms: request.termination_grace_ms }));
      });
    },
  };
}
