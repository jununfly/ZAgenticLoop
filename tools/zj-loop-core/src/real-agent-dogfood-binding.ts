import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export type RealAgentDogfoodExecutionDefinition = { executable: string; args: string[]; cwd: string; worktree_path: string };
type ExecutionBindingInput = RealAgentDogfoodExecutionDefinition & { lease_id: string };
export type RealAgentDogfoodExecutionBinding = ExecutionBindingInput & { executable_digest: string; argv_digest: string; execution_binding_digest: string };

function digest(value: Uint8Array | string): string { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function argvDigest(input: Pick<ExecutionBindingInput, 'executable' | 'args' | 'cwd'>): string {
  const encoded = canonicalize({ executable: input.executable, args: input.args, cwd: input.cwd });
  if (typeof encoded !== 'string') throw new Error('argv-canonicalization-invalid');
  return digest(encoded);
}

function validateDefinition(input: RealAgentDogfoodExecutionDefinition): void {
  if (!input.executable.startsWith('/') || !input.cwd.startsWith('/') || !input.worktree_path.startsWith('/')) throw new Error('execution-binding-input-invalid');
}

function bindingDigest(input: RealAgentDogfoodExecutionDefinition & { executable_digest: string; argv_digest: string }): string {
  const encoded = canonicalize({ schema: 'zj-loop.real_agent_dogfood_execution_binding.v1', executable: input.executable, executable_digest: input.executable_digest, args: input.args, argv_digest: input.argv_digest, cwd: input.cwd, worktree_path: input.worktree_path });
  if (typeof encoded !== 'string') throw new Error('execution-binding-canonicalization-invalid');
  return digest(encoded);
}

export async function createRealAgentDogfoodExecutionBindingDigest(input: RealAgentDogfoodExecutionDefinition): Promise<string> {
  validateDefinition(input);
  const executable_digest = digest(await readFile(input.executable));
  const argv_digest = argvDigest(input);
  return bindingDigest({ ...input, executable_digest, argv_digest });
}

export async function createRealAgentDogfoodExecutionBinding(input: ExecutionBindingInput): Promise<RealAgentDogfoodExecutionBinding> {
  validateDefinition(input);
  if (!input.lease_id.trim()) throw new Error('execution-binding-input-invalid');
  const executable_digest = digest(await readFile(input.executable));
  const argv_digest = argvDigest(input);
  return { ...input, executable_digest, argv_digest, execution_binding_digest: bindingDigest({ ...input, executable_digest, argv_digest }) };
}

export async function validateRealAgentDogfoodExecutionBinding(input: { binding: RealAgentDogfoodExecutionBinding } & ExecutionBindingInput): Promise<{ status: 'accepted' } | { status: 'blocked'; reason: 'executable-digest-mismatch' | 'argv-digest-mismatch' | 'execution-binding-digest-mismatch' | 'worktree-binding-mismatch' | 'lease-binding-mismatch' }> {
  if (input.binding.worktree_path !== input.worktree_path || input.binding.cwd !== input.cwd) return { status: 'blocked', reason: 'worktree-binding-mismatch' };
  if (input.binding.lease_id !== input.lease_id) return { status: 'blocked', reason: 'lease-binding-mismatch' };
  if (input.binding.argv_digest !== argvDigest(input)) return { status: 'blocked', reason: 'argv-digest-mismatch' };
  try {
    const executable_digest = digest(await readFile(input.executable));
    if (input.binding.executable_digest !== executable_digest) return { status: 'blocked', reason: 'executable-digest-mismatch' };
    if (input.binding.execution_binding_digest !== bindingDigest({ executable: input.executable, args: input.args, cwd: input.cwd, worktree_path: input.worktree_path, executable_digest, argv_digest: input.binding.argv_digest })) return { status: 'blocked', reason: 'execution-binding-digest-mismatch' };
  } catch { return { status: 'blocked', reason: 'executable-digest-mismatch' }; }
  return { status: 'accepted' };
}
