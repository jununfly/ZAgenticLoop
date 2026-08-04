import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { NativeOpnTracerMergeAuthorization } from './native-opn-tracer-aggregation.js';
import { nativeOpnTracerMergeAuthorizationDigest } from './review-handoff.js';

export { nativeOpnTracerMergeAuthorizationDigest } from './review-handoff.js';

const execFileAsync = promisify(execFile);
type GitResult = { status: number; stdout: string; stderr?: string };
type GitRunner = (args: string[]) => Promise<GitResult>;

function defaultGitRunner(repoRoot: string): GitRunner {
  return async (args) => {
    try {
      const result = await execFileAsync('git', args, { cwd: repoRoot, encoding: 'utf8' });
      return { status: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      const value = error as { code?: number; stdout?: string; stderr?: string };
      return { status: typeof value.code === 'number' ? value.code : 1, stdout: value.stdout ?? '', stderr: value.stderr };
    }
  };
}

export type NativeOpnGraphMergeAdmission = {
  status: 'ready' | 'blocked' | 'outcome-uncertain';
  side_effects_executed: false;
  reason?: 'human-acceptance-binding-invalid' | 'target-ref-mismatch' | 'target-worktree-ref-mismatch' | 'source-not-reachable' | 'fast-forward-not-possible' | 'target-not-clean' | 'scope-digest-mismatch' | 'merge-observation-uncertain';
};

export type NativeOpnGraphMergeAdapter = {
  observe: () => Promise<Parameters<typeof evaluateNativeOpnGraphMergeAdmission>[0]['observed']>;
  execute: (input: { authorization: NativeOpnTracerMergeAuthorization; expected_target_head: string }) => Promise<{ status: 'merged' | 'blocked' | 'outcome-uncertain'; target_head?: string; side_effects_executed: boolean; reason?: string }>;
};

export function evaluateNativeOpnGraphMergeAdmission(input: {
  authorization: NativeOpnTracerMergeAuthorization;
  human_acceptance: { decision: 'accepted' | string; merge_authorization_digest?: string };
  observed: {
    target_ref?: string;
    target_worktree_ref?: string;
    target_head?: string;
    source_commit_reachable?: boolean;
    fast_forward_possible?: boolean;
    target_clean?: boolean;
    scope_digest?: string;
  };
}): NativeOpnGraphMergeAdmission {
  if (input.human_acceptance.decision !== 'accepted' || input.human_acceptance.merge_authorization_digest !== nativeOpnTracerMergeAuthorizationDigest(input.authorization)) return { status: 'blocked', side_effects_executed: false, reason: 'human-acceptance-binding-invalid' };
  if (input.observed.target_ref !== input.authorization.target_ref) return { status: 'blocked', side_effects_executed: false, reason: 'target-ref-mismatch' };
  if (input.observed.target_worktree_ref !== undefined && input.observed.target_worktree_ref !== input.authorization.target_worktree_ref) return { status: 'blocked', side_effects_executed: false, reason: 'target-worktree-ref-mismatch' };
  if (input.observed.target_head === undefined || input.observed.target_worktree_ref === undefined || input.observed.source_commit_reachable === undefined || input.observed.fast_forward_possible === undefined || input.observed.target_clean === undefined || input.observed.scope_digest === undefined) return { status: 'outcome-uncertain', side_effects_executed: false, reason: 'merge-observation-uncertain' };
  if (!input.observed.source_commit_reachable) return { status: 'blocked', side_effects_executed: false, reason: 'source-not-reachable' };
  if (!input.observed.fast_forward_possible) return { status: 'blocked', side_effects_executed: false, reason: 'fast-forward-not-possible' };
  if (!input.observed.target_clean) return { status: 'blocked', side_effects_executed: false, reason: 'target-not-clean' };
  if (input.observed.scope_digest !== input.authorization.scope_digest) return { status: 'blocked', side_effects_executed: false, reason: 'scope-digest-mismatch' };
  return { status: 'ready', side_effects_executed: false };
}

export type NativeOpnGraphMergeExecution = { status: 'merged' | 'blocked' | 'outcome-uncertain'; side_effects_executed: boolean; target_head?: string; reason?: string };

export async function executeNativeOpnGraphMerge(input: { authorization: NativeOpnTracerMergeAuthorization; human_acceptance: { decision: 'accepted' | string; merge_authorization_digest?: string }; adapter: NativeOpnGraphMergeAdapter }): Promise<NativeOpnGraphMergeExecution> {
  let observed: Awaited<ReturnType<NativeOpnGraphMergeAdapter['observe']>>;
  try { observed = await input.adapter.observe(); } catch { return { status: 'outcome-uncertain', side_effects_executed: false, reason: 'merge-observation-uncertain' }; }
  const admission = evaluateNativeOpnGraphMergeAdmission({ authorization: input.authorization, human_acceptance: input.human_acceptance, observed });
  if (admission.status !== 'ready') return { status: admission.status, side_effects_executed: false, ...(admission.reason === undefined ? {} : { reason: admission.reason }) };
  try {
    const result = await input.adapter.execute({ authorization: input.authorization, expected_target_head: observed.target_head as string });
    return { status: result.status, target_head: result.target_head, side_effects_executed: result.side_effects_executed, ...(result.reason === undefined ? {} : { reason: result.reason }) };
  } catch { return { status: 'outcome-uncertain', side_effects_executed: false, reason: 'merge-execution-outcome-uncertain' }; }
}

export type NativeOpnGraphPostMergeGate = { status: 'passed' | 'blocked' | 'outcome-uncertain'; side_effects_executed: false; reason?: string };

export function evaluateNativeOpnGraphPostMergeGate(input: {
  authorization: NativeOpnTracerMergeAuthorization;
  observed: {
    target_ref?: string;
    target_head?: string;
    source_commit_sha?: string;
    fast_forward_confirmed?: boolean;
    target_clean?: boolean;
    scope_digest?: string;
    diff_check_passed?: boolean;
    project_verification?: 'passed' | 'failed' | 'unknown';
  };
}): NativeOpnGraphPostMergeGate {
  if (input.observed.target_ref !== input.authorization.target_ref) return { status: 'blocked', side_effects_executed: false, reason: 'target-ref-mismatch' };
  if (input.observed.target_head === undefined || input.observed.source_commit_sha === undefined || input.observed.fast_forward_confirmed === undefined || input.observed.target_clean === undefined || input.observed.scope_digest === undefined || input.observed.diff_check_passed === undefined || input.observed.project_verification === undefined || input.observed.project_verification === 'unknown') return { status: 'outcome-uncertain', side_effects_executed: false, reason: 'post-merge-observation-uncertain' };
  if (input.observed.target_head !== input.authorization.source_commit_sha || input.observed.source_commit_sha !== input.authorization.source_commit_sha) return { status: 'blocked', side_effects_executed: false, reason: 'target-source-binding-mismatch' };
  if (!input.observed.fast_forward_confirmed) return { status: 'blocked', side_effects_executed: false, reason: 'fast-forward-not-confirmed' };
  if (!input.observed.target_clean) return { status: 'blocked', side_effects_executed: false, reason: 'target-not-clean' };
  if (input.observed.scope_digest !== input.authorization.scope_digest) return { status: 'blocked', side_effects_executed: false, reason: 'scope-digest-mismatch' };
  if (!input.observed.diff_check_passed) return { status: 'blocked', side_effects_executed: false, reason: 'diff-check-failed' };
  if (input.observed.project_verification === 'failed') return { status: 'blocked', side_effects_executed: false, reason: 'project-verification-failed' };
  return { status: 'passed', side_effects_executed: false };
}

export function createLocalGitNativeOpnGraphMergeAdapter(input: { repo_root: string; target_worktree_ref: string; authorization: NativeOpnTracerMergeAuthorization; scope_digest: string; runGit?: GitRunner }): NativeOpnGraphMergeAdapter {
  const runGit = input.runGit ?? defaultGitRunner(input.repo_root);
  const observe = async () => {
    const ref = await runGit(['symbolic-ref', '--quiet', '--short', 'HEAD']);
    const head = await runGit(['rev-parse', 'HEAD']);
    const source = await runGit(['rev-parse', input.authorization.source_commit_sha]);
    const ancestor = head.status === 0 && source.status === 0 ? await runGit(['merge-base', '--is-ancestor', head.stdout.trim(), input.authorization.source_commit_sha]) : { status: 1, stdout: '' };
    const clean = await runGit(['status', '--porcelain']);
    return {
      target_ref: ref.status === 0 && ref.stdout.trim() ? `refs/heads/${ref.stdout.trim()}` : undefined,
      target_worktree_ref: input.target_worktree_ref,
      target_head: head.status === 0 && head.stdout.trim() ? head.stdout.trim() : undefined,
      source_commit_reachable: source.status === 0,
      fast_forward_possible: ancestor.status === 0,
      target_clean: clean.status === 0 && clean.stdout === '',
      scope_digest: input.scope_digest,
    };
  };
  const execute = async (execution: { authorization: NativeOpnTracerMergeAuthorization; expected_target_head: string }) => {
    if (execution.authorization.target_worktree_ref !== input.target_worktree_ref) return { status: 'blocked' as const, side_effects_executed: false, reason: 'target-worktree-ref-mismatch' };
    const ref = await runGit(['symbolic-ref', '--quiet', '--short', 'HEAD']);
    if (ref.status !== 0 || `refs/heads/${ref.stdout.trim()}` !== execution.authorization.target_ref) return { status: 'blocked' as const, side_effects_executed: false, reason: 'target-ref-mismatch' };
    const head = await runGit(['rev-parse', 'HEAD']);
    if (head.status !== 0) return { status: 'outcome-uncertain' as const, side_effects_executed: false, reason: 'target-head-unreadable' };
    if (head.stdout.trim() !== execution.expected_target_head) return { status: 'blocked' as const, side_effects_executed: false, reason: 'target-head-drift' };
    const merged = await runGit(['merge', '--ff-only', execution.authorization.source_commit_sha]);
    if (merged.status !== 0) return { status: 'blocked' as const, side_effects_executed: false, reason: 'merge-command-failed' };
    const finalHead = await runGit(['rev-parse', 'HEAD']);
    if (finalHead.status !== 0 || finalHead.stdout.trim() !== execution.authorization.source_commit_sha) return { status: 'outcome-uncertain' as const, side_effects_executed: true, reason: 'merged-head-unreadable-or-mismatched' };
    return { status: 'merged' as const, target_head: finalHead.stdout.trim(), side_effects_executed: true };
  };
  return { observe, execute };
}
