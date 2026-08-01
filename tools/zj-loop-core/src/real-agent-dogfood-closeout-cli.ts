#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultCliIo, runCli, type CliIo } from './cli.js';
import type { HumanSigner } from './human-signer.js';
import { createMacOSKeychainHumanSigner } from './macos-keychain-human-signer.js';
import { projectRealAgentDogfoodLifecycle, type RealAgentDogfoodEvent } from './real-agent-dogfood-lifecycle.js';
import { createRealAgentDogfoodCloseout, recordRealAgentDogfoodCloseout } from './real-agent-dogfood-closeout.js';
import { createSqliteStateStore } from './sqlite-state-store.js';

type Deps = { signer?: HumanSigner; now?: () => string };
function required(options: Record<string, string | boolean | undefined>, name: string): string { const value = options[name]; if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name}-required`); return value; }
function signerFor(options: Record<string, string | boolean | undefined>, deps: Deps): HumanSigner {
  if (deps.signer) return deps.signer;
  if (process.platform !== 'darwin') throw new Error('closeout-signer-adapter-required');
  return createMacOSKeychainHumanSigner({ human_id: required(options, 'human-id'), key_tag: required(options, 'key-tag'), helper_path: required(options, 'helper-path') });
}

export function runRealAgentDogfoodCloseoutCli(argv: readonly string[] = process.argv.slice(2), io: CliIo = defaultCliIo, deps: Deps = {}): Promise<number> {
  return runCli({
    name: 'zj-loop-real-agent-dogfood-closeout',
    usage: 'zj-loop-real-agent-dogfood-closeout closeout [options]',
    options: [
      { name: 'command', type: 'positional', description: 'closeout' },
      { name: 'state-store', flag: 'state-store', type: 'string', description: 'SQLite StateStore path' },
      { name: 'network-id', flag: 'network-id', type: 'string', description: 'Network id' },
      { name: 'dogfood-id', flag: 'dogfood-id', type: 'string', description: 'Dogfood id' },
      { name: 'repo-root', flag: 'repo-root', type: 'string', description: 'Original repository root' },
      { name: 'worktree-path', flag: 'worktree-path', type: 'string', description: 'Isolated worktree to remove' },
      { name: 'reason', flag: 'reason', type: 'string', description: 'Human closeout reason' },
      { name: 'human-id', flag: 'human-id', type: 'string', description: 'Human id for macOS Keychain signer' },
      { name: 'key-tag', flag: 'key-tag', type: 'string', description: 'macOS Keychain key tag' },
      { name: 'helper-path', flag: 'helper-path', type: 'string', description: 'macOS Keychain signer helper path' },
    ],
    async handler({ options }) {
      if (String(options.command) !== 'closeout') throw new Error('unsupported-closeout-command');
      const stateStore = createSqliteStateStore({ filename: required(options, 'state-store') });
      try {
        const networkId = required(options, 'network-id');
        const dogfoodId = required(options, 'dogfood-id');
        const snapshot = await stateStore.readEvents({ network_id: networkId, aggregate_type: 'real-agent-dogfood', aggregate_id: dogfoodId });
        const lifecycle = projectRealAgentDogfoodLifecycle(snapshot.events as unknown as RealAgentDogfoodEvent[]);
        const signer = signerFor(options, deps);
        const worktreePath = required(options, 'worktree-path');
        const closeout = await createRealAgentDogfoodCloseout({ signer, lifecycle, worktree_path: worktreePath, reason: required(options, 'reason'), closed_at: deps.now?.() ?? new Date().toISOString() });
        const result = await recordRealAgentDogfoodCloseout({ stateStore, lifecycle, closeout, identity: await signer.getPublicIdentity(), expected_revision: snapshot.snapshot_revision, repo_root: required(options, 'repo-root'), worktree_path: required(options, 'worktree-path'), now: deps.now?.() ?? new Date().toISOString() });
        io.stdout(JSON.stringify({ schema: 'zj-loop.real_agent_dogfood_closeout_cli.v1', status: result.status, network_id: networkId, dogfood_id: dogfoodId, execution_id: lifecycle.execution_id, attempt: lifecycle.attempt, lifecycle_status: lifecycle.status, state_revision: result.revision, evidence_retained: true, side_effects_executed: true }));
        return 0;
      } finally { await stateStore.close(); }
    },
  }, argv, io);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) process.exitCode = await runRealAgentDogfoodCloseoutCli();
