import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

type ExecutionBindingInput = { executable: string; args: string[]; cwd: string; worktree_path: string; lease_id: string };
export type RealAgentDogfoodExecutionBinding = ExecutionBindingInput & { executable_digest: string; argv_digest: string };

function digest(value: Uint8Array | string): string { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function argvDigest(input: Pick<ExecutionBindingInput, 'executable' | 'args' | 'cwd'>): string {
  const encoded = canonicalize({ executable: input.executable, args: input.args, cwd: input.cwd });
  if (typeof encoded !== 'string') throw new Error('argv-canonicalization-invalid');
  return digest(encoded);
}

export async function createRealAgentDogfoodExecutionBinding(input: ExecutionBindingInput): Promise<RealAgentDogfoodExecutionBinding> {
  if (!input.executable.startsWith('/') || !input.cwd.startsWith('/') || !input.worktree_path.startsWith('/') || !input.lease_id.trim()) throw new Error('execution-binding-input-invalid');
  return { ...input, executable_digest: digest(await readFile(input.executable)), argv_digest: argvDigest(input) };
}

export async function validateRealAgentDogfoodExecutionBinding(input: { binding: RealAgentDogfoodExecutionBinding } & ExecutionBindingInput): Promise<{ status: 'accepted' } | { status: 'blocked'; reason: 'executable-digest-mismatch' | 'argv-digest-mismatch' | 'worktree-binding-mismatch' | 'lease-binding-mismatch' }> {
  if (input.binding.worktree_path !== input.worktree_path || input.binding.cwd !== input.cwd) return { status: 'blocked', reason: 'worktree-binding-mismatch' };
  if (input.binding.lease_id !== input.lease_id) return { status: 'blocked', reason: 'lease-binding-mismatch' };
  if (input.binding.argv_digest !== argvDigest(input)) return { status: 'blocked', reason: 'argv-digest-mismatch' };
  try { if (input.binding.executable_digest !== digest(await readFile(input.executable))) return { status: 'blocked', reason: 'executable-digest-mismatch' }; } catch { return { status: 'blocked', reason: 'executable-digest-mismatch' }; }
  return { status: 'accepted' };
}
