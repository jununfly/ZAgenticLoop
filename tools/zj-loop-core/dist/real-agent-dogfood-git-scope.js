import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { validateCodexWriteScope } from './codex-agent-provider-adapter.js';
const execFile = promisify(execFileCallback);
const COMMIT = /^[0-9a-f]{40}$/i;
export const REAL_AGENT_DOGFOOD_GIT_SCOPE_OBSERVATION_SCHEMA = 'zj-loop.real_agent_dogfood_git_scope_observation.v1';
function digest(value) {
    const json = canonicalize(value);
    if (typeof json !== 'string')
        throw new Error('git-scope-observation-canonicalization-invalid');
    return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}
function validRelativeFile(value) {
    return typeof value === 'string' && value.length > 0 && !value.includes('\0') && !path.isAbsolute(value) && !value.split('/').includes('..');
}
async function git(repoRoot, args) {
    const result = await execFile('git', args, { cwd: repoRoot, maxBuffer: 1024 * 1024 });
    return result.stdout.trim();
}
function lines(value) {
    return value === '' ? [] : value.split('\n').filter(Boolean);
}
function statusFiles(value) {
    return lines(value).map((line) => line.length >= 3 ? line.slice(3).trim() : line.trim()).sort();
}
export async function observeRealAgentDogfoodGitScope(input) {
    if (!input || typeof input.repo_root !== 'string' || !path.isAbsolute(input.repo_root) || !COMMIT.test(input.baseline_commit) || !Array.isArray(input.allowed_files) || !input.allowed_files.every(validRelativeFile))
        throw new Error('git-scope-observation-input-invalid');
    try {
        const [headCommit, parentCommit, changedOutput, statusOutput] = await Promise.all([
            git(input.repo_root, ['rev-parse', 'HEAD']),
            git(input.repo_root, ['rev-parse', 'HEAD^']),
            git(input.repo_root, ['diff', '--name-only', `${input.baseline_commit}..HEAD`, '--']),
            git(input.repo_root, ['status', '--porcelain', '--untracked-files=all']),
        ]);
        const diffCheck = await execFile('git', ['diff', '--check', `${input.baseline_commit}..HEAD`, '--'], { cwd: input.repo_root, maxBuffer: 1024 * 1024 }).then(() => true).catch(() => false);
        const changedFiles = lines(changedOutput);
        const uncommittedFiles = statusFiles(statusOutput);
        const scope = validateCodexWriteScope({ allowed_files: [...input.allowed_files], changed_files: changedFiles, uncommitted_files: uncommittedFiles, commit_parent: parentCommit, baseline_commit: input.baseline_commit, diff_check_passed: diffCheck });
        const unsigned = { schema: REAL_AGENT_DOGFOOD_GIT_SCOPE_OBSERVATION_SCHEMA, repo_root: input.repo_root, baseline_commit: input.baseline_commit, head_commit: headCommit, commit_parent: parentCommit, allowed_files: [...input.allowed_files].sort(), changed_files: changedFiles, uncommitted_files: uncommittedFiles, diff_check_passed: diffCheck, scope };
        return { ...unsigned, observation_digest: digest(unsigned) };
    }
    catch (error) {
        throw new Error(error instanceof Error ? `git-scope-observation-failed:${error.message}` : 'git-scope-observation-failed');
    }
}
