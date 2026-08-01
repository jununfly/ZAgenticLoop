import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
function digest(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function argvDigest(input) {
    const encoded = canonicalize({ executable: input.executable, args: input.args, cwd: input.cwd });
    if (typeof encoded !== 'string')
        throw new Error('argv-canonicalization-invalid');
    return digest(encoded);
}
export async function createRealAgentDogfoodExecutionBinding(input) {
    if (!input.executable.startsWith('/') || !input.cwd.startsWith('/') || !input.worktree_path.startsWith('/') || !input.lease_id.trim())
        throw new Error('execution-binding-input-invalid');
    return { ...input, executable_digest: digest(await readFile(input.executable)), argv_digest: argvDigest(input) };
}
export async function validateRealAgentDogfoodExecutionBinding(input) {
    if (input.binding.worktree_path !== input.worktree_path || input.binding.cwd !== input.cwd)
        return { status: 'blocked', reason: 'worktree-binding-mismatch' };
    if (input.binding.lease_id !== input.lease_id)
        return { status: 'blocked', reason: 'lease-binding-mismatch' };
    if (input.binding.argv_digest !== argvDigest(input))
        return { status: 'blocked', reason: 'argv-digest-mismatch' };
    try {
        if (input.binding.executable_digest !== digest(await readFile(input.executable)))
            return { status: 'blocked', reason: 'executable-digest-mismatch' };
    }
    catch {
        return { status: 'blocked', reason: 'executable-digest-mismatch' };
    }
    return { status: 'accepted' };
}
