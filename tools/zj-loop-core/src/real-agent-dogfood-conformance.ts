import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';

const execFile = promisify(execFileCallback);
export const REAL_AGENT_DOGFOOD_CONFORMANCE_SCHEMA = 'zj-loop.real_agent_dogfood_conformance_evidence.v1' as const;
export const REAL_AGENT_DOGFOOD_CONFORMANCE_DIGEST_PROFILE = 'zj-loop.real-agent-dogfood-conformance.v1' as const;
export const REAL_AGENT_DOGFOOD_CONFORMANCE_COMMAND = ['npm', 'test'] as const;
const FAILURE_MATRIX = ['worker-lease-expiry', 'worker-lease-digest-mismatch', 'lifecycle-revision-conflict', 'graph-phase-append-conflict', 'worker-lease-release-conflict', 'cleanup-uncertainty', 'replay-idempotency', 'replay-digest-conflict'] as const;
export const REAL_AGENT_DOGFOOD_FAILURE_MATRIX_DIGEST = `sha256:${createHash('sha256').update(JSON.stringify(FAILURE_MATRIX), 'utf8').digest('hex')}`;

export type RealAgentDogfoodConformanceEvidence = {
  schema: typeof REAL_AGENT_DOGFOOD_CONFORMANCE_SCHEMA;
  status: 'passed' | 'blocked';
  plan_digest: string;
  core_commit: string;
  package_root: string;
  test_command: readonly string[];
  failure_matrix_digest: string;
  digest_profile: typeof REAL_AGENT_DOGFOOD_CONFORMANCE_DIGEST_PROFILE;
  exit_code: number;
  output_digest: string;
  side_effects_executed: false;
};

function canonical(value: unknown): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('real-agent-dogfood-conformance-canonicalization-invalid');
  return json;
}
function digest(value: unknown): string { return `sha256:${createHash('sha256').update(typeof value === 'string' ? value : canonical(value), 'utf8').digest('hex')}`; }

export async function generateRealAgentDogfoodConformanceEvidence(input: {
  repo_root: string;
  plan_digest: string;
  evidenceStore: Pick<ContentAddressedEvidenceStore, 'put'>;
  run?: (cwd: string, command: readonly string[]) => Promise<{ exit_code: number; stdout: string; stderr: string }>;
  git_head?: (cwd: string) => Promise<string>;
}): Promise<{ status: 'passed' | 'blocked'; evidence_digest: string; evidence: RealAgentDogfoodConformanceEvidence }> {
  if (!input.repo_root.trim() || !/^sha256:[0-9a-f]{64}$/.test(input.plan_digest)) throw new Error('real-agent-dogfood-conformance-input-invalid');
  const packageRoot = path.join(input.repo_root, 'tools', 'zj-loop-core');
  const gitHead = input.git_head ?? (async (cwd) => (await execFile('git', ['rev-parse', 'HEAD'], { cwd })).stdout.trim());
  const run = input.run ?? (async (cwd, command) => {
    try {
      const result = await execFile(command[0], command.slice(1), { cwd, maxBuffer: 8 * 1024 * 1024 });
      return { exit_code: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      const failure = error as { code?: number; stdout?: string; stderr?: string };
      return { exit_code: typeof failure.code === 'number' ? failure.code : 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
    }
  });
  const [coreCommit, result] = await Promise.all([gitHead(input.repo_root), run(packageRoot, REAL_AGENT_DOGFOOD_CONFORMANCE_COMMAND)]);
  if (!/^[0-9a-f]{40}$/i.test(coreCommit)) throw new Error('real-agent-dogfood-conformance-core-commit-invalid');
  const evidence: RealAgentDogfoodConformanceEvidence = {
    schema: REAL_AGENT_DOGFOOD_CONFORMANCE_SCHEMA,
    status: result.exit_code === 0 ? 'passed' : 'blocked',
    plan_digest: input.plan_digest,
    core_commit: coreCommit,
    package_root: packageRoot,
    test_command: [...REAL_AGENT_DOGFOOD_CONFORMANCE_COMMAND],
    failure_matrix_digest: REAL_AGENT_DOGFOOD_FAILURE_MATRIX_DIGEST,
    digest_profile: REAL_AGENT_DOGFOOD_CONFORMANCE_DIGEST_PROFILE,
    exit_code: result.exit_code,
    output_digest: digest(`${result.stdout}\n${result.stderr}`),
    side_effects_executed: false,
  };
  const stored = await input.evidenceStore.put({ content: JSON.stringify(evidence), kind: 'real-agent-dogfood-conformance' });
  return { status: evidence.status, evidence_digest: stored.digest, evidence };
}
