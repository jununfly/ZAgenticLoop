import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/i;
const PLAN_KEYS = new Set(['execution_id', 'attempt', 'verifier_id', 'input_commit', 'repo_root', 'verifier_worktree_root', 'commands']);
const COMMAND_KEYS = new Set(['id', 'executable', 'args', 'timeout_ms']);

export type RealAgentDogfoodVerificationCommand = { id: string; executable: string; args: string[]; timeout_ms: number };
export type RealAgentDogfoodVerificationPlan = {
  schema: 'zj-loop.real_agent_dogfood_verification_plan.v1';
  execution_id: string;
  attempt: number;
  input_commit: string;
  verifier: { identity: string; worktree_root: string };
  commands: RealAgentDogfoodVerificationCommand[];
  plan_digest: string;
};

function canonical(value: unknown): string {
  const result = canonicalize(value);
  if (typeof result !== 'string') throw new Error('real-agent-dogfood-verification-canonicalization-invalid');
  return result;
}
function digest(value: unknown): string { return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`; }
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && !value.includes('\0'); }
function withoutDigest(value: RealAgentDogfoodVerificationPlan): Omit<RealAgentDogfoodVerificationPlan, 'plan_digest'> { const { plan_digest: _, ...unsigned } = value; return unsigned; }

export function createRealAgentDogfoodVerificationPlan(input: {
  execution_id: string;
  attempt: number;
  verifier_id: string;
  input_commit: string;
  repo_root: string;
  verifier_worktree_root: string;
  commands: RealAgentDogfoodVerificationCommand[];
}): RealAgentDogfoodVerificationPlan {
  if (!input || typeof input !== 'object' || Object.keys(input).some((key) => !PLAN_KEYS.has(key)) || !text(input.execution_id) || !Number.isInteger(input.attempt) || input.attempt < 1 || !text(input.verifier_id) || !COMMIT.test(input.input_commit) || !path.isAbsolute(input.repo_root) || !path.isAbsolute(input.verifier_worktree_root) || !Array.isArray(input.commands) || input.commands.length < 1 || input.commands.length > 32) throw new Error('real-agent-dogfood-verification-plan-input-invalid');
  const ids = new Set<string>();
  for (const command of input.commands) {
    if (!command || typeof command !== 'object' || Object.keys(command).some((key) => !COMMAND_KEYS.has(key)) || !text(command.id) || ids.has(command.id) || !text(command.executable) || !Array.isArray(command.args) || command.args.some((arg) => typeof arg !== 'string' || arg.includes('\0')) || !Number.isInteger(command.timeout_ms) || command.timeout_ms < 1 || command.timeout_ms > 24 * 60 * 60 * 1000) throw new Error('real-agent-dogfood-verification-command-invalid');
    ids.add(command.id);
  }
  const unsigned = {
    schema: 'zj-loop.real_agent_dogfood_verification_plan.v1' as const,
    execution_id: input.execution_id,
    attempt: input.attempt,
    input_commit: input.input_commit,
    verifier: { identity: input.verifier_id, worktree_root: input.verifier_worktree_root },
    commands: input.commands.map((command) => ({ id: command.id, executable: command.executable, args: [...command.args], timeout_ms: command.timeout_ms })),
  } satisfies Omit<RealAgentDogfoodVerificationPlan, 'plan_digest'>;
  return Object.freeze({ ...unsigned, plan_digest: digest(unsigned) });
}

export type DisposableVerifierWorktree = { status: 'prepared'; execution_id: string; attempt: number; verifier_id: string; worktree_path: string; input_commit: string; pre_cleanup: { status: 'clean'; head_commit: string; untracked: false } };

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFile('git', args, { cwd, maxBuffer: 1024 * 1024 });
  return result.stdout.trim();
}
async function canonicalPath(value: string): Promise<string> {
  const absolute = path.resolve(value);
  try { return await realpath(absolute); } catch { return path.join(await realpath(path.dirname(absolute)), path.basename(absolute)); }
}

export async function prepareDisposableRealAgentDogfoodVerifierWorktree(input: { repo_root: string; worktree_root: string; execution_id: string; attempt: number; input_commit: string; verifier_id: string }): Promise<DisposableVerifierWorktree> {
  if (!path.isAbsolute(input.repo_root) || !path.isAbsolute(input.worktree_root) || !text(input.execution_id) || !Number.isInteger(input.attempt) || input.attempt < 1 || !COMMIT.test(input.input_commit) || !text(input.verifier_id)) throw new Error('real-agent-dogfood-verifier-worktree-input-invalid');
  const repo = await canonicalPath(input.repo_root);
  await stat(repo);
  const head = await git(repo, ['rev-parse', 'HEAD']);
  if (!COMMIT.test(head) || head !== input.input_commit) throw new Error('real-agent-dogfood-verifier-input-commit-mismatch');
  if (await git(repo, ['status', '--porcelain', '--untracked-files=all'])) throw new Error('real-agent-dogfood-verifier-repo-not-clean');
  await mkdir(input.worktree_root, { recursive: true });
  const root = await canonicalPath(input.worktree_root);
  const worktreePath = path.join(root, `${input.execution_id}-attempt-${input.attempt}`);
  await git(repo, ['worktree', 'add', '--detach', worktreePath, input.input_commit]);
  const worktreeHead = await git(worktreePath, ['rev-parse', 'HEAD']);
  if (worktreeHead !== input.input_commit) throw new Error('real-agent-dogfood-verifier-worktree-commit-mismatch');
  return { status: 'prepared', execution_id: input.execution_id, attempt: input.attempt, verifier_id: input.verifier_id, worktree_path: worktreePath, input_commit: input.input_commit, pre_cleanup: { status: 'clean', head_commit: worktreeHead, untracked: false } };
}

export async function verifyDisposableRealAgentDogfoodWorktreeCleanup(input: { worktree_path: string; repo_root: string }): Promise<{ status: 'clean' | 'blocked'; reason?: string; head_commit?: string }> {
  try {
    const status = await git(input.worktree_path, ['status', '--porcelain', '--untracked-files=all']);
    const head = await git(input.worktree_path, ['rev-parse', 'HEAD']);
    if (status) return { status: 'blocked', reason: 'verifier-worktree-dirty', head_commit: head };
    return { status: 'clean', head_commit: head };
  } catch { return { status: 'blocked', reason: 'verifier-worktree-unreadable' }; }
}

export function validateRealAgentDogfoodVerificationPlan(plan: RealAgentDogfoodVerificationPlan): { status: 'valid' | 'blocked'; reason?: string } {
  try {
    createRealAgentDogfoodVerificationPlan({ execution_id: plan.execution_id, attempt: plan.attempt, verifier_id: plan.verifier.identity, input_commit: plan.input_commit, repo_root: '/repo', verifier_worktree_root: plan.verifier.worktree_root, commands: plan.commands });
    return digest(withoutDigest(plan)) === plan.plan_digest ? { status: 'valid' } : { status: 'blocked', reason: 'plan-digest-invalid' };
  } catch { return { status: 'blocked', reason: 'plan-invalid' }; }
}
