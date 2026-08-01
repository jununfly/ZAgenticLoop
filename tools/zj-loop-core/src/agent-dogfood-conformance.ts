import canonicalize from 'canonicalize';
import { createHash, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';

export const AGENT_DOGFOOD_CONFORMANCE_SCHEMA = 'zj-loop.agent_dogfood_conformance.v1' as const;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

export type AgentDogfoodFixture = {
  fixture_version: string;
  network_id: string;
  task_id: string;
  registry_snapshot: { revision: number; digest: string };
  execution: {
    execution_id: string;
    attempt: number;
    commit_sha: string;
    approved_preflight_digest: string;
    registry_snapshot_digest: string;
    preflight_digest: string;
    process_status: 'completed' | 'failed' | 'cancelled' | 'timed-out';
    result_digest: string;
    verifier_status: 'passed' | 'blocked';
  };
  post_run_observation: {
    status: 'signed' | 'uncertain';
    execution_id: string;
    attempt: number;
    preflight_digest: string;
    proof_digest: string;
    registry_snapshot_digest: string;
    after_worktree_clean: boolean;
    after_network_denied: boolean;
    after_credentials_clean: boolean;
    side_effects_detected: boolean;
    process_boundary: {
      kind: 'process-group' | 'job-object';
      process_group_id: string | null;
      job_object_id: string | null;
      child_process_count: number;
      all_descendants_terminated: boolean;
      termination_sequence_digest: string;
      orphan_processes_detected: boolean;
      unknown_descendants_detected: boolean;
    };
    signature: { algorithm: 'ECDSA-P256'; public_key_pem: string; public_key_fingerprint: string; signature_base64: string };
  };
  provider: { provider_id: string; adapter_version: string };
  trusted_runner_registry: Array<{ runner_id: string; public_key_fingerprint: string; status: 'active' | 'revoked' }>;
  environment: {
    proof_source: 'trusted-runner' | 'agent-self-report';
    proof_stage: 'pre-launch' | 'post-launch';
    runner_isolation: 'separate-process' | 'protected-sandbox' | 'same-process';
    network_denied: { status: 'proved' | 'blocked'; evidence_digest: string };
    credentials: { status: 'clean' | 'blocked'; evidence_digest: string };
    trusted_runner: {
      runner_id: string;
      runner_version: string;
      execution_id: string;
      attempt: number;
      preflight_digest: string;
      registry_snapshot_digest: string;
      worktree_digest: string;
      network_evidence_digest: string;
      credential_evidence_digest: string;
      issued_at: string;
      expires_at: string;
      proof_digest: string;
      signature: { algorithm: 'ECDSA-P256'; public_key_pem: string; public_key_fingerprint: string; signature_base64: string };
    };
  };
  worktree: { before_clean: boolean; after_clean: boolean };
  artifacts: { redaction_status: 'passed' | 'blocked'; artifact_digests: string[] };
  review: { package_digest: string; decision: 'accepted' | 'rejected' | 'request-revision' | 'pending' };
  created_at: string;
};

export type AgentDogfoodConformanceReport = {
  schema: typeof AGENT_DOGFOOD_CONFORMANCE_SCHEMA;
  fixture_version: string;
  network_id: string;
  task_id: string;
  status: 'passed' | 'blocked';
  side_effects_executed: false;
  provider: AgentDogfoodFixture['provider'];
  execution: Pick<AgentDogfoodFixture['execution'], 'execution_id' | 'attempt' | 'commit_sha' | 'preflight_digest'>;
  phases: Array<{ name: 'environment' | 'execution' | 'artifacts' | 'verification' | 'human-review'; status: 'passed' | 'blocked'; reason?: string }>;
  blocking_reasons: string[];
  created_at: string;
  report_digest: string;
};

function digest(value: unknown): value is string { return typeof value === 'string' && DIGEST.test(value); }
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function reportDigest(value: Omit<AgentDogfoodConformanceReport, 'report_digest'>): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('agent-dogfood-conformance-canonicalization-invalid');
  return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}

function trustedProofDigest(value: Omit<AgentDogfoodFixture['environment']['trusted_runner'], 'proof_digest' | 'signature'>): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('agent-dogfood-trusted-proof-canonicalization-invalid');
  return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}

function registryDigest(value: AgentDogfoodFixture['trusted_runner_registry']): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('agent-dogfood-registry-canonicalization-invalid');
  return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}

function runnerSignatureValid(proofDigest: string, signature: AgentDogfoodFixture['environment']['trusted_runner']['signature']): boolean {
  if (signature.algorithm !== 'ECDSA-P256' || !text(signature.public_key_pem) || !/^[0-9a-f]{64}$/.test(signature.public_key_fingerprint) || !text(signature.signature_base64)) return false;
  try {
    const publicKey = createPublicKey(signature.public_key_pem);
    const fingerprint = createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
    return fingerprint === signature.public_key_fingerprint && verify('sha256', Buffer.from(proofDigest, 'utf8'), publicKey, Buffer.from(signature.signature_base64, 'base64'));
  } catch {
    return false;
  }
}

function observationDigest(value: Omit<AgentDogfoodFixture['post_run_observation'], 'signature'>): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('agent-dogfood-observation-canonicalization-invalid');
  return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}

function phase(name: AgentDogfoodConformanceReport['phases'][number]['name'], reasons: string[], prefix: string | string[]): AgentDogfoodConformanceReport['phases'][number] {
  const prefixes = Array.isArray(prefix) ? prefix : [prefix];
  const reason = reasons.find((item) => prefixes.some((value) => item.startsWith(value)));
  return reason ? { name, status: 'blocked', reason } : { name, status: 'passed' };
}

export function evaluateAgentDogfoodConformance(input: AgentDogfoodFixture): AgentDogfoodConformanceReport {
  const reasons: string[] = [];
  if (!text(input.fixture_version) || !text(input.network_id) || !text(input.task_id) || !text(input.created_at)) reasons.push('execution-identity-invalid');
  if (!text(input.provider.provider_id) || !text(input.provider.adapter_version)) reasons.push('provider-identity-invalid');
  if (input.environment.proof_source !== 'trusted-runner') reasons.push('environment-proof-not-trusted');
  if (input.environment.proof_stage !== 'pre-launch') reasons.push('trusted-environment-proof-stage-invalid');
  if (!['separate-process', 'protected-sandbox'].includes(input.environment.runner_isolation)) reasons.push('trusted-runner-isolation-invalid');
  if (!text(input.execution.execution_id) || !Number.isInteger(input.execution.attempt) || input.execution.attempt < 1 || !/^[0-9a-f]{40,64}$/.test(input.execution.commit_sha)) reasons.push('execution-identity-invalid');
  if (!digest(input.execution.approved_preflight_digest) || !digest(input.execution.preflight_digest)) reasons.push('execution-preflight-digest-invalid');
  if (!Number.isInteger(input.registry_snapshot.revision) || input.registry_snapshot.revision < 1 || !digest(input.registry_snapshot.digest) || input.registry_snapshot.digest !== registryDigest(input.trusted_runner_registry)) reasons.push('trusted-runner-registry-snapshot-drift');
  if (input.execution.registry_snapshot_digest !== input.registry_snapshot.digest) reasons.push('trusted-runner-registry-snapshot-drift');
  if (digest(input.execution.approved_preflight_digest) && digest(input.execution.preflight_digest) && input.execution.preflight_digest !== input.execution.approved_preflight_digest) reasons.push('execution-preflight-drift');
  if (!digest(input.execution.result_digest)) reasons.push('execution-result-missing');
  if (input.environment.network_denied.status !== 'proved' || !digest(input.environment.network_denied.evidence_digest)) reasons.push('network-denied-proof-missing');
  if (input.environment.credentials.status !== 'clean' || !digest(input.environment.credentials.evidence_digest)) reasons.push('credential-inheritance-detected');
  const trusted = input.environment.trusted_runner;
  if (!text(trusted.runner_id) || !text(trusted.runner_version) || !Number.isInteger(trusted.attempt) || trusted.attempt < 1 || !digest(trusted.preflight_digest) || !digest(trusted.worktree_digest) || !digest(trusted.network_evidence_digest) || !digest(trusted.credential_evidence_digest) || !digest(trusted.proof_digest)) reasons.push('trusted-environment-proof-invalid');
  if (trusted.execution_id !== input.execution.execution_id || trusted.attempt !== input.execution.attempt || trusted.preflight_digest !== input.execution.preflight_digest || trusted.registry_snapshot_digest !== input.registry_snapshot.digest || trusted.network_evidence_digest !== input.environment.network_denied.evidence_digest || trusted.credential_evidence_digest !== input.environment.credentials.evidence_digest) reasons.push('trusted-environment-proof-binding-mismatch');
  if (trusted.proof_digest !== trustedProofDigest({ runner_id: trusted.runner_id, runner_version: trusted.runner_version, execution_id: trusted.execution_id, attempt: trusted.attempt, preflight_digest: trusted.preflight_digest, registry_snapshot_digest: trusted.registry_snapshot_digest, worktree_digest: trusted.worktree_digest, network_evidence_digest: trusted.network_evidence_digest, credential_evidence_digest: trusted.credential_evidence_digest, issued_at: trusted.issued_at, expires_at: trusted.expires_at })) reasons.push('trusted-environment-proof-digest-invalid');
  if (!runnerSignatureValid(trusted.proof_digest, trusted.signature)) reasons.push('trusted-environment-proof-signature-invalid');
  const registeredRunner = input.trusted_runner_registry.find((entry) => entry.runner_id === trusted.runner_id && entry.public_key_fingerprint === trusted.signature.public_key_fingerprint);
  if (!registeredRunner) reasons.push('trusted-runner-not-registered');
  else if (registeredRunner.status !== 'active') reasons.push('trusted-runner-not-active');
  if (!Number.isFinite(Date.parse(trusted.issued_at)) || !Number.isFinite(Date.parse(trusted.expires_at)) || Date.parse(trusted.issued_at) >= Date.parse(trusted.expires_at) || Date.parse(input.created_at) < Date.parse(trusted.issued_at)) reasons.push('trusted-environment-proof-invalid');
  if (Number.isFinite(Date.parse(trusted.expires_at)) && Date.parse(input.created_at) >= Date.parse(trusted.expires_at)) reasons.push('trusted-environment-proof-expired');
  const observation = input.post_run_observation;
  const boundary = observation.process_boundary;
  if (!boundary || !['process-group', 'job-object'].includes(boundary.kind) || (boundary.kind === 'process-group' && !text(boundary.process_group_id)) || (boundary.kind === 'job-object' && !text(boundary.job_object_id)) || !Number.isInteger(boundary.child_process_count) || boundary.child_process_count < 0 || !digest(boundary.termination_sequence_digest) || boundary.all_descendants_terminated !== true || boundary.orphan_processes_detected !== false || boundary.unknown_descendants_detected !== false) reasons.push('process-boundary-invalid');
  const observationPayload = { status: observation.status, execution_id: observation.execution_id, attempt: observation.attempt, preflight_digest: observation.preflight_digest, proof_digest: observation.proof_digest, registry_snapshot_digest: observation.registry_snapshot_digest, after_worktree_clean: observation.after_worktree_clean, after_network_denied: observation.after_network_denied, after_credentials_clean: observation.after_credentials_clean, side_effects_detected: observation.side_effects_detected, process_boundary: boundary };
  if (!observation.after_worktree_clean || !observation.after_network_denied || !observation.after_credentials_clean || observation.side_effects_detected) reasons.push('post-run-safety-observation-invalid');
  if (observation.status !== 'signed' || observation.execution_id !== input.execution.execution_id || observation.attempt !== input.execution.attempt || observation.preflight_digest !== input.execution.preflight_digest || observation.proof_digest !== trusted.proof_digest || observation.registry_snapshot_digest !== input.registry_snapshot.digest || observation.after_worktree_clean !== input.worktree.after_clean || !runnerSignatureValid(observationDigest(observationPayload), observation.signature)) reasons.push('post-run-observation-signature-invalid');
  if (!input.worktree.before_clean) reasons.push('worktree-not-clean-before-execution');
  if (!input.worktree.after_clean) reasons.push('worktree-not-clean-after-execution');
  if (input.execution.process_status !== 'completed') reasons.push('execution-outcome-uncertain');
  if (input.execution.verifier_status !== 'passed') reasons.push('task-verification-not-passed');
  if (input.artifacts.redaction_status !== 'passed' || input.artifacts.artifact_digests.length === 0 || input.artifacts.artifact_digests.some((item) => !digest(item))) reasons.push('sanitized-artifacts-not-persisted');
  if (input.review.decision !== 'accepted' || !digest(input.review.package_digest)) reasons.push('human-review-not-accepted');
  const uniqueReasons = [...new Set(reasons)].sort();
  const blockingReasons = [...new Set(uniqueReasons)].sort();
  const unsigned = {
    schema: AGENT_DOGFOOD_CONFORMANCE_SCHEMA,
    fixture_version: input.fixture_version,
    network_id: input.network_id,
    task_id: input.task_id,
    status: blockingReasons.length === 0 ? 'passed' as const : 'blocked' as const,
    side_effects_executed: false as const,
    provider: { ...input.provider },
    execution: { execution_id: input.execution.execution_id, attempt: input.execution.attempt, commit_sha: input.execution.commit_sha, preflight_digest: input.execution.preflight_digest },
    phases: [phase('environment', blockingReasons, 'network-'), phase('execution', blockingReasons, ['execution-', 'process-boundary-']), phase('artifacts', blockingReasons, 'sanitized-'), phase('verification', blockingReasons, 'task-'), phase('human-review', blockingReasons, 'human-')],
    blocking_reasons: blockingReasons,
    created_at: input.created_at,
  };
  return { ...unsigned, report_digest: reportDigest(unsigned) };
}

export function agentDogfoodConformanceDigest(report: AgentDogfoodConformanceReport): string {
  const { report_digest: _, ...unsigned } = report;
  return reportDigest(unsigned);
}

export function createAgentDogfoodFixture(): AgentDogfoodFixture {
  const d = (digit: string) => `sha256:${digit.repeat(64)}`;
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicKeyPem = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const publicKeyFingerprint = createHash('sha256').update(keys.publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
  const registry = [{ runner_id: 'runner-1', public_key_fingerprint: publicKeyFingerprint, status: 'active' as const }];
  const registrySnapshot = { revision: 1, digest: registryDigest(registry) };
  const fixture: AgentDogfoodFixture = {
    fixture_version: '1-5.1', network_id: 'network-dogfood-1', task_id: 'task-conformance-1', registry_snapshot: registrySnapshot,
    execution: { execution_id: 'execution-dogfood-1', attempt: 1, commit_sha: 'a'.repeat(40), approved_preflight_digest: d('1'), preflight_digest: d('1'), registry_snapshot_digest: registrySnapshot.digest, process_status: 'completed', result_digest: d('2'), verifier_status: 'passed' },
    provider: { provider_id: 'fixture-agent', adapter_version: 'fixture-1' },
    trusted_runner_registry: registry,
    environment: {
      proof_source: 'trusted-runner', proof_stage: 'pre-launch', runner_isolation: 'separate-process',
      network_denied: { status: 'proved', evidence_digest: d('3') },
      credentials: { status: 'clean', evidence_digest: d('7') },
      trusted_runner: {
        runner_id: 'runner-1', runner_version: 'trusted-runner-1', execution_id: 'execution-dogfood-1', attempt: 1,
        preflight_digest: d('1'), registry_snapshot_digest: registrySnapshot.digest, worktree_digest: d('8'), network_evidence_digest: d('3'), credential_evidence_digest: d('7'),
        issued_at: '2026-08-01T11:59:00.000Z', expires_at: '2026-08-01T12:05:00.000Z', proof_digest: '',
        signature: { algorithm: 'ECDSA-P256', public_key_pem: publicKeyPem, public_key_fingerprint: publicKeyFingerprint, signature_base64: '' },
      },
    },
    worktree: { before_clean: true, after_clean: true },
    artifacts: { redaction_status: 'passed', artifact_digests: [d('4'), d('5')] },
    post_run_observation: { status: 'signed', execution_id: 'execution-dogfood-1', attempt: 1, preflight_digest: d('1'), proof_digest: '', registry_snapshot_digest: registrySnapshot.digest, after_worktree_clean: true, after_network_denied: true, after_credentials_clean: true, side_effects_detected: false, process_boundary: { kind: 'process-group', process_group_id: 'pg-execution-dogfood-1', job_object_id: null, child_process_count: 2, all_descendants_terminated: true, termination_sequence_digest: d('9'), orphan_processes_detected: false, unknown_descendants_detected: false }, signature: { algorithm: 'ECDSA-P256', public_key_pem: publicKeyPem, public_key_fingerprint: publicKeyFingerprint, signature_base64: '' } },
    review: { package_digest: d('6'), decision: 'accepted' },
    created_at: '2026-08-01T12:00:00.000Z',
  };
  const { proof_digest: _, signature: __, ...unsignedProof } = fixture.environment.trusted_runner;
  fixture.environment.trusted_runner.proof_digest = trustedProofDigest(unsignedProof);
  fixture.environment.trusted_runner.signature.signature_base64 = sign('sha256', Buffer.from(fixture.environment.trusted_runner.proof_digest, 'utf8'), keys.privateKey).toString('base64');
  fixture.post_run_observation.proof_digest = fixture.environment.trusted_runner.proof_digest;
  const observationPayload = { status: fixture.post_run_observation.status, execution_id: fixture.post_run_observation.execution_id, attempt: fixture.post_run_observation.attempt, preflight_digest: fixture.post_run_observation.preflight_digest, proof_digest: fixture.post_run_observation.proof_digest, registry_snapshot_digest: fixture.post_run_observation.registry_snapshot_digest, after_worktree_clean: fixture.post_run_observation.after_worktree_clean, after_network_denied: fixture.post_run_observation.after_network_denied, after_credentials_clean: fixture.post_run_observation.after_credentials_clean, side_effects_detected: fixture.post_run_observation.side_effects_detected, process_boundary: fixture.post_run_observation.process_boundary };
  fixture.post_run_observation.signature.signature_base64 = sign('sha256', Buffer.from(observationDigest(observationPayload), 'utf8'), keys.privateKey).toString('base64');
  return fixture;
}
