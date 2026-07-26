import { execFile as execFileCallback } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { AgentHandoff } from "./agent-local.js";

export const AGENT_WORKTREE_SCHEMA = "zj-loop.agent_local_worktree.v1";

export type AgentLocalWorktreeResult = {
  schema: typeof AGENT_WORKTREE_SCHEMA;
  status: "prepared" | "reused" | "blocked";
  handoff_id: string;
  branch: string | null;
  worktree_path: string | null;
  base_commit: string | null;
  side_effects_executed: boolean;
  reason?: string;
};

type GitRunner = (args: string[], cwd: string) => Promise<{ stdout: string; stderr: string }>;

export function agentLocalBranchName(handoffId: string): string {
  assertSafeId(handoffId);
  return `zj-loop/agent-local/${handoffId}`;
}

export async function prepareAgentLocalWorktree(input: {
  handoff: AgentHandoff;
  repoRoot: string;
  worktreeRoot: string;
  gitRunner?: GitRunner;
}): Promise<AgentLocalWorktreeResult> {
  const handoff = input.handoff;
  const branch = agentLocalBranchName(handoff.handoff_id);
  const baseCommit = handoff.workspace.base_commit;
  const blocked = (reason: string): AgentLocalWorktreeResult => ({
    schema: AGENT_WORKTREE_SCHEMA,
    status: "blocked",
    handoff_id: handoff.handoff_id,
    branch: null,
    worktree_path: null,
    base_commit: baseCommit || null,
    side_effects_executed: false,
    reason,
  });
  if (handoff.status !== "claimed" || !handoff.claim) return blocked("handoff-claim-required");
  if (!/^[0-9a-f]{40}$/i.test(baseCommit)) return blocked("workspace-base-commit-invalid");
  if (!path.isAbsolute(input.repoRoot) || !path.isAbsolute(input.worktreeRoot)) return blocked("absolute-workspace-paths-required");
  const worktreePath = path.resolve(input.worktreeRoot, handoff.handoff_id);
  if (worktreePath !== input.worktreeRoot && !worktreePath.startsWith(`${input.worktreeRoot}${path.sep}`)) return blocked("worktree-path-escapes-root");
  const git = input.gitRunner ?? defaultGitRunner;
  try {
    await stat(input.repoRoot);
    await mkdir(input.worktreeRoot, { recursive: true });
    let existing = false;
    try { await stat(worktreePath); existing = true; } catch { /* path is available */ }
    if (existing) {
      const head = (await git(["-C", worktreePath, "rev-parse", "HEAD"], input.repoRoot)).stdout.trim();
      const currentBranch = (await git(["-C", worktreePath, "branch", "--show-current"], input.repoRoot)).stdout.trim();
      if (head !== baseCommit || currentBranch !== branch) return blocked("existing-worktree-binding-mismatch");
      return { schema: AGENT_WORKTREE_SCHEMA, status: "reused", handoff_id: handoff.handoff_id, branch, worktree_path: worktreePath, base_commit: baseCommit, side_effects_executed: false };
    }
    await git(["worktree", "add", "-b", branch, worktreePath, baseCommit], input.repoRoot);
    return { schema: AGENT_WORKTREE_SCHEMA, status: "prepared", handoff_id: handoff.handoff_id, branch, worktree_path: worktreePath, base_commit: baseCommit, side_effects_executed: true };
  } catch (error) {
    return blocked(error instanceof Error ? error.message : "worktree-prepare-failed");
  }
}

async function defaultGitRunner(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  const execFile = promisify(execFileCallback);
  const result = await execFile("git", args, { cwd, maxBuffer: 1024 * 1024 });
  return { stdout: result.stdout, stderr: result.stderr };
}

function assertSafeId(value: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error("agent-id-invalid");
}
