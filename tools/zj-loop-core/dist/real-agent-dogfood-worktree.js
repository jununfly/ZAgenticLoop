import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
const execFile = promisify(execFileCallback);
async function canonicalPath(input) {
    const absolute = path.resolve(input);
    try {
        return await realpath(absolute);
    }
    catch {
        const parent = path.dirname(absolute);
        const name = path.basename(absolute);
        return path.join(await realpath(parent), name);
    }
}
function inside(child, parent) {
    const relative = path.relative(parent, child);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
async function git(args, cwd) {
    const result = await execFile('git', args, { cwd, maxBuffer: 1024 * 1024 });
    return result.stdout.trim();
}
export async function prepareRealAgentDogfoodWorktree(input) {
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(input.execution_id))
        return { status: 'blocked', reason: 'execution-id-invalid' };
    if (!path.isAbsolute(input.repo_root) || !path.isAbsolute(input.worktree_root))
        return { status: 'blocked', reason: 'absolute-paths-required' };
    let repo;
    let worktreeRoot;
    try {
        repo = await canonicalPath(input.repo_root);
        await stat(repo);
        await mkdir(input.worktree_root, { recursive: true });
        worktreeRoot = await canonicalPath(input.worktree_root);
    }
    catch {
        return { status: 'blocked', reason: 'repo-unreadable' };
    }
    if (inside(worktreeRoot, repo))
        return { status: 'blocked', reason: 'worktree-root-inside-repo' };
    const branch = `zj-loop/real-agent-dogfood/${input.execution_id}`;
    const worktreePath = path.join(worktreeRoot, input.execution_id);
    try {
        const dirty = await git(['-C', repo, 'status', '--porcelain', '--untracked-files=all'], repo);
        if (dirty)
            return { status: 'blocked', reason: 'repo-not-clean' };
        const baseCommit = await git(['-C', repo, 'rev-parse', 'HEAD'], repo);
        if (!/^[0-9a-f]{40}$/i.test(baseCommit))
            return { status: 'blocked', reason: 'base-commit-invalid' };
        try {
            await stat(worktreePath);
            const currentCommit = await git(['-C', worktreePath, 'rev-parse', 'HEAD'], repo);
            const currentBranch = await git(['-C', worktreePath, 'branch', '--show-current'], repo);
            if (currentCommit !== baseCommit || currentBranch !== branch)
                return { status: 'blocked', reason: 'existing-worktree-binding-mismatch' };
            return { status: 'reused', execution_id: input.execution_id, branch, worktree_path: worktreePath, base_commit: baseCommit };
        }
        catch {
            await git(['worktree', 'add', '-b', branch, worktreePath, baseCommit], repo);
            return { status: 'prepared', execution_id: input.execution_id, branch, worktree_path: worktreePath, base_commit: baseCommit };
        }
    }
    catch (error) {
        return { status: 'blocked', reason: error instanceof Error ? error.message : 'worktree-prepare-failed' };
    }
}
