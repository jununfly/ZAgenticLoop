import { execFile as execFileCallback } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { createRealAgentDogfoodGraphPhaseRecord, type RealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
import type { RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import { createRealAgentDogfoodVerificationPlan, prepareDisposableRealAgentDogfoodVerifierWorktree, type RealAgentDogfoodVerificationCommand, type RealAgentDogfoodVerificationPlan } from './real-agent-dogfood-independent-verification.js';
import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';

const execFile = promisify(execFileCallback);
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/i;

export type RealAgentDogfoodGraphIndependentVerificationAdapterResult = {
  status: 'passed' | 'blocked' | 'outcome-uncertain';
  reason?: string;
  evidence_digest?: string;
  record?: RealAgentDogfoodGraphPhaseRecord;
};

type CommandObservation = {
  id: string;
  executable: string;
  args: string[];
  timeout_ms: number;
  status: 'passed' | 'blocked' | 'outcome-uncertain';
  exit_code: number | null;
  stdout: string;
  stderr: string;
  timed_out: boolean;
};

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFile('git', args, { cwd, maxBuffer: 1024 * 1024 });
  return result.stdout.trim();
}

async function canonicalPath(value: string): Promise<string> {
  return realpath(path.resolve(value));
}

async function runCommand(cwd: string, command: RealAgentDogfoodVerificationCommand): Promise<CommandObservation> {
  try {
    const result = await execFile(command.executable, command.args, { cwd, timeout: command.timeout_ms, maxBuffer: 8 * 1024 * 1024 });
    return { ...command, status: 'passed', exit_code: 0, stdout: result.stdout, stderr: result.stderr, timed_out: false };
  } catch (error) {
    const failure = error as { code?: number | string; signal?: string; killed?: boolean; stdout?: string; stderr?: string };
    const timedOut = failure.signal === 'SIGTERM' || failure.killed === true;
    return { ...command, status: timedOut ? 'outcome-uncertain' : 'blocked', exit_code: typeof failure.code === 'number' ? failure.code : null, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '', timed_out: timedOut };
  }
}

export function createRealAgentDogfoodGraphIndependentVerificationAdapter(input: {
  plan: RealAgentDogfoodGraphPlan;
  network_id: string;
  verifier_id: string;
  evidence_store: Pick<ContentAddressedEvidenceStore, 'put'>;
  source_phase: RealAgentDogfoodGraphPhaseRecord;
  scope_phase: RealAgentDogfoodGraphPhaseRecord;
  commands: RealAgentDogfoodVerificationCommand[];
  prepare_worktree?: typeof prepareDisposableRealAgentDogfoodVerifierWorktree;
  run_command?: typeof runCommand;
}): () => Promise<RealAgentDogfoodGraphIndependentVerificationAdapterResult> {
  return async () => {
    if (input.source_phase.phase !== 'source_execution' || input.source_phase.status !== 'passed' || input.scope_phase.phase !== 'scope_observation' || input.scope_phase.status !== 'passed') return { status: 'outcome-uncertain', reason: 'independent-verification-prerequisite-not-passed' };
    if (input.source_phase.network_id !== input.network_id || input.scope_phase.network_id !== input.network_id || input.source_phase.plan_digest !== input.plan.plan_digest || input.scope_phase.plan_digest !== input.plan.plan_digest || !input.source_phase.completed_phases.includes('source_execution') || !input.scope_phase.completed_phases.includes('scope_observation')) return { status: 'outcome-uncertain', reason: 'independent-verification-prerequisite-binding-invalid' };
    if (input.source_phase.execution_id !== input.plan.execution_id || input.scope_phase.execution_id !== input.plan.execution_id || input.scope_phase.actor_kind !== 'coordinator' || !input.scope_phase.actor_identity || !input.verifier_id.trim()) return { status: 'outcome-uncertain', reason: 'independent-verification-identity-binding-invalid' };
    if (!DIGEST.test(input.source_phase.execution_binding_digest ?? '') || !DIGEST.test(input.source_phase.worker_lease_digest ?? '')) return { status: 'outcome-uncertain', reason: 'independent-verification-source-binding-invalid' };

    let inputCommit: string;
    try { inputCommit = await git(input.plan.source_worktree, ['rev-parse', 'HEAD']); }
    catch { return { status: 'outcome-uncertain', reason: 'independent-verification-source-commit-unavailable' }; }
    if (!COMMIT.test(inputCommit)) return { status: 'outcome-uncertain', reason: 'independent-verification-source-commit-invalid' };
    const verificationPlan: RealAgentDogfoodVerificationPlan = createRealAgentDogfoodVerificationPlan({ execution_id: input.plan.execution_id, attempt: input.plan.attempt, verifier_id: input.verifier_id, input_commit: inputCommit, repo_root: input.plan.source_worktree, verifier_worktree_root: path.dirname(input.plan.verifier_worktree), commands: input.commands });
    if (path.resolve(path.join(verificationPlan.verifier.worktree_root, `${input.plan.execution_id}-attempt-${input.plan.attempt}`)) !== path.resolve(input.plan.verifier_worktree)) return { status: 'outcome-uncertain', reason: 'independent-verification-worktree-binding-invalid' };

    let prepared;
    try { prepared = await (input.prepare_worktree ?? prepareDisposableRealAgentDogfoodVerifierWorktree)({ repo_root: input.plan.source_worktree, worktree_root: verificationPlan.verifier.worktree_root, execution_id: input.plan.execution_id, attempt: input.plan.attempt, input_commit: inputCommit, verifier_id: input.verifier_id }); }
    catch { return { status: 'outcome-uncertain', reason: 'independent-verification-worktree-prepare-failed' }; }
    let expectedWorktreePath: string;
    let preparedWorktreePath: string;
    try {
      [expectedWorktreePath, preparedWorktreePath] = await Promise.all([canonicalPath(input.plan.verifier_worktree), canonicalPath(prepared.worktree_path)]);
    } catch { return { status: 'outcome-uncertain', reason: 'independent-verification-worktree-fact-invalid' }; }
    if (preparedWorktreePath !== expectedWorktreePath || prepared.input_commit !== inputCommit) return { status: 'outcome-uncertain', reason: 'independent-verification-worktree-fact-invalid' };

    const observations: CommandObservation[] = [];
    for (const command of verificationPlan.commands) {
      const observation = await (input.run_command ?? runCommand)(prepared.worktree_path, command);
      observations.push(observation);
      if (observation.status !== 'passed') break;
    }
    let headCommit: string | null = null;
    let worktreeStatus: string | null = null;
    try {
      headCommit = await git(prepared.worktree_path, ['rev-parse', 'HEAD']);
      worktreeStatus = await git(prepared.worktree_path, ['status', '--porcelain', '--untracked-files=all']);
    } catch { return { status: 'outcome-uncertain', reason: 'independent-verification-worktree-observation-failed' }; }
    const allPassed = observations.length === verificationPlan.commands.length && observations.every((item) => item.status === 'passed') && headCommit === inputCommit && worktreeStatus === '';
    const uncertain = observations.some((item) => item.status === 'outcome-uncertain') || headCommit === null || worktreeStatus === null;
    const status = allPassed ? 'passed' : uncertain ? 'outcome-uncertain' : 'blocked';
    const reason = allPassed ? 'independent-verification-passed' : uncertain ? 'independent-verification-facts-uncertain' : observations.find((item) => item.status !== 'passed')?.id === undefined ? 'independent-verification-worktree-drift' : `independent-verification-command-${observations.find((item) => item.status !== 'passed')?.id}`;
    const evidencePayload = { schema: 'zj-loop.real_agent_dogfood_graph_independent_verification_evidence.v1', network_id: input.network_id, execution_id: input.plan.execution_id, attempt: input.plan.attempt, verifier_id: input.verifier_id, verification_plan: verificationPlan, verifier_worktree: prepared, input_commit: inputCommit, head_commit: headCommit, worktree_status: worktreeStatus, commands: observations, status, reason };
    let evidence: { digest: string };
    try { evidence = await input.evidence_store.put({ content: JSON.stringify(evidencePayload), kind: 'real-agent-dogfood-graph-independent-verification' }); }
    catch { return { status: 'outcome-uncertain', reason: 'independent-verification-evidence-write-failed' }; }
    if (!DIGEST.test(evidence.digest)) return { status: 'outcome-uncertain', reason: 'independent-verification-evidence-invalid' };
    const record = createRealAgentDogfoodGraphPhaseRecord({ plan: input.plan, network_id: input.network_id, phase: 'independent_verification', status, completed_phases: status === 'passed' ? ['source_execution', 'scope_observation', 'independent_verification'] : ['source_execution', 'scope_observation'], reason, actor_kind: 'trusted-runner', actor_identity: input.verifier_id, evidence_digest: evidence.digest, evidence_refs: [evidence.digest], execution_binding_digest: input.source_phase.execution_binding_digest, worker_lease_digest: input.source_phase.worker_lease_digest });
    return { status, reason, evidence_digest: evidence.digest, record };
  };
}
