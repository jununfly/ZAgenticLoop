import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { evaluateNativeOpnGraphPostMergeGate, nativeOpnTracerMergeAuthorizationDigest } from './native-opn-graph-merge.js';
import type { NativeOpnTracerMergeAuthorization } from './native-opn-tracer-aggregation.js';
import { createRealAgentDogfoodGraphPhaseRecord, type RealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
import type { RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
import type { RealAgentDogfoodVerificationCommand } from './real-agent-dogfood-independent-verification.js';

const execFile = promisify(execFileCallback);
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/i;
const COMMAND_IDS = ['git-diff-check', 'project-build', 'target-test', 'graph-regression'] as const;
const MAX_OUTPUT_BYTES = 256 * 1024;

export type RealAgentDogfoodGraphPostMergeGateAdapterResult = {
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
  timed_out: boolean;
  stdout_bytes: number;
  stderr_bytes: number;
  stdout_digest: string;
  stderr_digest: string;
};

type GitObservation = { status: number; stdout: string; stderr?: string };
type GitRunner = (cwd: string, args: string[]) => Promise<GitObservation>;

function digestBytes(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function defaultGitRunner(): GitRunner {
  return async (cwd, args) => {
    try {
      const result = await execFile('git', args, { cwd, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES });
      return { status: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      const value = error as { code?: number; stdout?: string; stderr?: string };
      return { status: typeof value.code === 'number' ? value.code : 1, stdout: value.stdout ?? '', stderr: value.stderr };
    }
  };
}

function validCommands(commands: RealAgentDogfoodVerificationCommand[]): boolean {
  return commands.length === COMMAND_IDS.length && commands.every((command, index) => command.id === COMMAND_IDS[index] && command.executable.trim() !== '' && command.args.every((arg) => !arg.includes('\0')) && Number.isInteger(command.timeout_ms) && command.timeout_ms > 0 && command.timeout_ms <= 24 * 60 * 60 * 1000);
}

async function runCommand(cwd: string, command: RealAgentDogfoodVerificationCommand): Promise<CommandObservation> {
  try {
    const result = await execFile(command.executable, command.args, { cwd, encoding: 'utf8', timeout: command.timeout_ms, maxBuffer: MAX_OUTPUT_BYTES });
    return {
      id: command.id,
      executable: command.executable,
      args: [...command.args],
      timeout_ms: command.timeout_ms,
      status: 'passed',
      exit_code: 0,
      timed_out: false,
      stdout_bytes: Buffer.byteLength(result.stdout, 'utf8'),
      stderr_bytes: Buffer.byteLength(result.stderr, 'utf8'),
      stdout_digest: digestBytes(result.stdout),
      stderr_digest: digestBytes(result.stderr),
    };
  } catch (error) {
    const value = error as { code?: number | string; signal?: string; killed?: boolean; stdout?: string; stderr?: string };
    const stdout = value.stdout ?? '';
    const stderr = value.stderr ?? '';
    const timedOut = value.signal === 'SIGTERM' || value.killed === true;
    return {
      id: command.id,
      executable: command.executable,
      args: [...command.args],
      timeout_ms: command.timeout_ms,
      status: timedOut ? 'outcome-uncertain' : 'blocked',
      exit_code: typeof value.code === 'number' ? value.code : null,
      timed_out: timedOut,
      stdout_bytes: Buffer.byteLength(stdout, 'utf8'),
      stderr_bytes: Buffer.byteLength(stderr, 'utf8'),
      stdout_digest: digestBytes(stdout),
      stderr_digest: digestBytes(stderr),
    };
  }
}

function completedThroughMerge(status: 'passed' | 'blocked' | 'outcome-uncertain') {
  return status === 'passed'
    ? ['source_execution', 'scope_observation', 'independent_verification', 'human_acceptance', 'merge', 'post_merge_gate'] as const
    : ['source_execution', 'scope_observation', 'independent_verification', 'human_acceptance', 'merge'] as const;
}

export function createRealAgentDogfoodGraphPostMergeGateAdapter(input: {
  plan: RealAgentDogfoodGraphPlan;
  network_id: string;
  verifier_id: string;
  merge_phase: RealAgentDogfoodGraphPhaseRecord;
  human_acceptance: { decision: 'accepted' | string; merge_authorization_digest?: string };
  authorization: NativeOpnTracerMergeAuthorization;
  target_worktree: string;
  commands: RealAgentDogfoodVerificationCommand[];
  evidence_store: Pick<ContentAddressedEvidenceStore, 'put'>;
  run_git?: GitRunner;
  run_command?: typeof runCommand;
}): () => Promise<RealAgentDogfoodGraphPostMergeGateAdapterResult> {
  return async () => {
    if (input.merge_phase.phase !== 'merge' || input.merge_phase.status !== 'passed' || !['coordinator', 'human'].includes(input.merge_phase.actor_kind ?? '') || !input.merge_phase.actor_identity || input.merge_phase.network_id !== input.network_id || input.merge_phase.plan_digest !== input.plan.plan_digest || input.merge_phase.execution_id !== input.plan.execution_id || !input.merge_phase.completed_phases.includes('merge') || !input.merge_phase.evidence_digest || !DIGEST.test(input.merge_phase.evidence_digest)) return { status: 'blocked', reason: 'post-merge-gate-merge-prerequisite-invalid' };
    if (input.human_acceptance.decision !== 'accepted' || input.human_acceptance.merge_authorization_digest !== nativeOpnTracerMergeAuthorizationDigest(input.authorization)) return { status: 'blocked', reason: 'post-merge-gate-human-acceptance-binding-invalid' };
    if (!input.verifier_id.trim() || !validCommands(input.commands)) return { status: 'blocked', reason: 'post-merge-gate-command-plan-invalid' };

    const runGit = input.run_git ?? defaultGitRunner();
    const [ref, targetHead, sourceCommit, targetStatus] = await Promise.all([
      runGit(input.target_worktree, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
      runGit(input.target_worktree, ['rev-parse', 'HEAD']),
      runGit(input.target_worktree, ['rev-parse', input.authorization.source_commit_sha]),
      runGit(input.target_worktree, ['status', '--porcelain', '--untracked-files=all']),
    ]);
    if (ref.status !== 0 || targetHead.status !== 0 || sourceCommit.status !== 0 || targetStatus.status !== 0) {
      const reason = 'post-merge-gate-target-observation-uncertain';
      const evidencePayload = {
        schema: 'zj-loop.real_agent_dogfood_graph_post_merge_gate_evidence.v1',
        network_id: input.network_id,
        execution_id: input.plan.execution_id,
        plan_digest: input.plan.plan_digest,
        verifier_id: input.verifier_id,
        target_worktree: input.target_worktree,
        target_observation: {
          ref_status: ref.status,
          target_head_status: targetHead.status,
          source_commit_status: sourceCommit.status,
          target_status_status: targetStatus.status,
        },
        result_status: 'outcome-uncertain',
        reason,
      };
      let evidence: { digest: string };
      try { evidence = await input.evidence_store.put({ content: JSON.stringify(evidencePayload), kind: 'real-agent-dogfood-graph-post-merge-gate' }); }
      catch { return { status: 'outcome-uncertain', reason: 'post-merge-gate-evidence-write-failed' }; }
      if (!DIGEST.test(evidence.digest)) return { status: 'outcome-uncertain', reason: 'post-merge-gate-evidence-invalid' };
      const record = createRealAgentDogfoodGraphPhaseRecord({ plan: input.plan, network_id: input.network_id, phase: 'post_merge_gate', status: 'outcome-uncertain', completed_phases: completedThroughMerge('outcome-uncertain'), reason, actor_kind: 'trusted-runner', actor_identity: input.verifier_id, evidence_digest: evidence.digest, evidence_refs: [evidence.digest] });
      return { status: 'outcome-uncertain', reason, evidence_digest: evidence.digest, record };
    }
    const targetRef = ref.stdout.trim() ? `refs/heads/${ref.stdout.trim()}` : undefined;
    const targetHeadSha = targetHead.stdout.trim();
    const sourceCommitSha = sourceCommit.stdout.trim();
    if (!COMMIT.test(targetHeadSha) || !COMMIT.test(sourceCommitSha)) return { status: 'outcome-uncertain', reason: 'post-merge-gate-commit-observation-invalid' };

    const observations: CommandObservation[] = [];
    for (const command of input.commands) {
      const observation = await (input.run_command ?? runCommand)(input.target_worktree, command);
      observations.push(observation);
      if (observation.status !== 'passed') break;
    }
    const diffCheck = observations.find((item) => item.id === 'git-diff-check');
    const failedCommand = observations.find((item) => item.status !== 'passed');
    const projectVerification = failedCommand?.status === 'outcome-uncertain' ? 'unknown' : failedCommand ? 'failed' : observations.length === COMMAND_IDS.length ? 'passed' : 'unknown';
    const gate = evaluateNativeOpnGraphPostMergeGate({
      authorization: input.authorization,
      observed: {
        target_ref: targetRef,
        target_head: targetHeadSha,
        source_commit_sha: sourceCommitSha,
        fast_forward_confirmed: targetHeadSha === sourceCommitSha,
        target_clean: targetStatus.stdout === '',
        scope_digest: input.authorization.scope_digest,
        diff_check_passed: diffCheck?.status === 'passed',
        project_verification: projectVerification,
      },
    });
    const reason = gate.status === 'passed' ? 'post-merge-gate-passed' : gate.reason ?? `post-merge-gate-${gate.status}`;
    const evidencePayload = {
      schema: 'zj-loop.real_agent_dogfood_graph_post_merge_gate_evidence.v1',
      network_id: input.network_id,
      execution_id: input.plan.execution_id,
      plan_digest: input.plan.plan_digest,
      verifier_id: input.verifier_id,
      target_worktree: input.target_worktree,
      target_ref: targetRef ?? null,
      target_head: targetHeadSha,
      source_commit_sha: sourceCommitSha,
      authorization_source_commit_sha: input.authorization.source_commit_sha,
      target_clean: targetStatus.stdout === '',
      scope_digest: input.authorization.scope_digest,
      commands: observations,
      result_status: gate.status,
      reason,
    };
    let evidence: { digest: string };
    try { evidence = await input.evidence_store.put({ content: JSON.stringify(evidencePayload), kind: 'real-agent-dogfood-graph-post-merge-gate' }); }
    catch { return { status: 'outcome-uncertain', reason: 'post-merge-gate-evidence-write-failed' }; }
    if (!DIGEST.test(evidence.digest)) return { status: 'outcome-uncertain', reason: 'post-merge-gate-evidence-invalid' };
    const record = createRealAgentDogfoodGraphPhaseRecord({ plan: input.plan, network_id: input.network_id, phase: 'post_merge_gate', status: gate.status, completed_phases: completedThroughMerge(gate.status), reason, actor_kind: 'trusted-runner', actor_identity: input.verifier_id, evidence_digest: evidence.digest, evidence_refs: [evidence.digest] });
    return { status: gate.status, reason, evidence_digest: evidence.digest, record };
  };
}
