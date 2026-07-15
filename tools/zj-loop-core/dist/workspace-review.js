import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
const execFile = promisify(execFileCallback);
export const WORKSPACE_CHANGED_FILES_SCHEMA = 'zj-loop.workspace_changed_files.v1';
export async function captureWorkspaceReviewArtifacts(input) {
    const git = await readGitWorkspace(input.root);
    if (!git.ok) {
        return {
            status: 'hard_stopped',
            reason: 'workspace-git-unavailable',
            next_steps: ['Run this Workspace Adapter route inside a Git worktree with a committed HEAD.'],
        };
    }
    const changedFiles = [...new Set([...git.trackedFiles, ...git.untrackedFiles])].sort();
    if (changedFiles.length === 0) {
        return {
            status: 'hard_stopped',
            reason: 'workspace-no-changes',
            next_steps: ['Apply the intended local changes, then resume this Workspace Adapter orchestration.'],
        };
    }
    const id = sanitizeId(input.orchestrationId);
    const reviewDirectory = `zj-loop/reviews/${id}`;
    const patchPath = `${reviewDirectory}/workspace-change.patch`;
    const changedFilesPath = `${reviewDirectory}/changed-files.json`;
    const untrackedPatches = await Promise.all(git.untrackedFiles.map((file) => gitDiffNoIndex(input.root, file)));
    const patch = [git.trackedPatch, ...untrackedPatches].filter(Boolean).join('');
    const manifest = {
        schema: WORKSPACE_CHANGED_FILES_SCHEMA,
        schema_version: 1,
        created_at: input.now,
        orchestration_id: input.orchestrationId,
        carrier: {
            kind: 'local-activation-request',
            path: input.carrierPath,
        },
        git: {
            branch: git.branch,
            head_sha: git.headSha,
        },
        changed_files: changedFiles,
        patch: {
            path: patchPath,
            format: 'git-diff-binary',
        },
    };
    await writeText(input.root, patchPath, patch);
    await writeText(input.root, changedFilesPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return {
        status: 'executed_to_review_artifact',
        patch_path: patchPath,
        changed_files_path: changedFilesPath,
        changed_files: changedFiles,
        branch: git.branch,
        head_sha: git.headSha,
    };
}
async function readGitWorkspace(root) {
    try {
        const [branch, headSha, trackedFiles, untrackedFiles, trackedPatch] = await Promise.all([
            gitOutput(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
            gitOutput(root, ['rev-parse', 'HEAD']),
            gitOutput(root, ['diff', '--name-only', '-z', 'HEAD']),
            gitOutput(root, ['ls-files', '--others', '--exclude-standard', '-z']),
            gitOutput(root, ['diff', '--binary', 'HEAD']),
        ]);
        return {
            ok: true,
            branch: branch.trim(),
            headSha: headSha.trim(),
            trackedFiles: splitNullDelimited(trackedFiles),
            untrackedFiles: splitNullDelimited(untrackedFiles)
                .filter((file) => !file.startsWith('zj-loop/requests/')
                && !file.startsWith('zj-loop/evidence/')
                && !file.startsWith('zj-loop/reviews/')
                && !file.startsWith('zj-loop/orchestrations/')),
            trackedPatch,
        };
    }
    catch {
        return { ok: false };
    }
}
async function gitOutput(root, args) {
    const result = await execFile('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    return result.stdout;
}
async function gitDiffNoIndex(root, file) {
    try {
        return await gitOutput(root, ['diff', '--no-index', '--binary', '--', '/dev/null', file]);
    }
    catch (error) {
        if (error?.code === 1 && typeof error.stdout === 'string')
            return error.stdout;
        throw error;
    }
}
async function writeText(root, relativePath, text) {
    const target = path.resolve(root, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, text);
}
function splitNullDelimited(value) {
    return value.split('\0').filter(Boolean);
}
function sanitizeId(value) {
    return value.replace(/[^A-Za-z0-9._-]/g, '-');
}
