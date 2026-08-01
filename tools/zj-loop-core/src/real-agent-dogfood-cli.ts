#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultCliIo, runCli, type CliIo } from './cli.js';
import {
  appendRealAgentDogfoodEvent,
  createRealAgentDogfoodDraft,
  createRealAgentDogfoodTransition,
  projectRealAgentDogfoodLifecycle,
  type RealAgentDogfoodEvent,
} from './real-agent-dogfood-lifecycle.js';
import { createSqliteStateStore } from './sqlite-state-store.js';
import { verifyHumanApprovalContextDetailed, type HumanApprovalContext, type HumanPublicIdentity } from './human-authority.js';
import { acquireRealAgentDogfoodWorkerLease } from './real-agent-dogfood-worker.js';
import { prepareRealAgentDogfoodWorktree } from './real-agent-dogfood-worktree.js';

const CLI_NAME = 'zj-loop-real-agent-dogfood';
const DIGEST = /^sha256:[0-9a-f]{64}$/;

type RuntimePaths = { state_store: string; evidence_store: string; worktree_root: string };

export function defaultRealAgentDogfoodRuntimePaths(platform = process.platform, home = os.homedir(), env = process.env): RuntimePaths {
  const root = platform === 'darwin'
    ? path.join(home, 'Library', 'Application Support', 'ZAgenticLoop')
    : platform === 'win32'
      ? path.join(env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'ZAgenticLoop')
      : path.join(env.XDG_STATE_HOME ?? path.join(home, '.local', 'state'), 'zagenticloop');
  return { state_store: path.join(root, 'state', 'state.db'), evidence_store: path.join(root, 'evidence'), worktree_root: path.join(root, 'worktrees') };
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
}

async function canonicalPath(input: string): Promise<string> {
  const absolute = path.resolve(input);
  const parts = absolute.split(path.sep);
  let existing = path.parse(absolute).root;
  for (let index = 1; index < parts.length; index++) {
    const candidate = path.join(existing, parts[index]);
    try {
      existing = await realpath(candidate);
    } catch {
      const remainder = parts.slice(index).join(path.sep);
      return path.resolve(existing, remainder);
    }
  }
  return existing;
}

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function validateRuntimePaths(input: { repo: string; stateStore: string; evidenceStore: string }): Promise<{ repo: string; stateStore: string; evidenceStore: string }> {
  const repo = await canonicalPath(input.repo);
  const stateStore = await canonicalPath(input.stateStore);
  const evidenceStore = await canonicalPath(input.evidenceStore);
  if (isInside(stateStore, repo) || isInside(evidenceStore, repo)) throw new Error('runtime-storage-path-inside-repo');
  return { repo, stateStore, evidenceStore };
}

function required(options: Record<string, string | boolean | undefined>, name: string): string {
  const value = options[name];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name}-required`);
  return value;
}

function outputLifecycle(lifecycle: ReturnType<typeof projectRealAgentDogfoodLifecycle>, extra: Record<string, unknown> = {}) {
  return {
    schema: 'zj-loop.real_agent_dogfood_cli_result.v1',
    status: lifecycle.status,
    network_id: lifecycle.network_id,
    dogfood_id: lifecycle.dogfood_id,
    execution_id: lifecycle.execution_id,
    attempt: lifecycle.attempt,
    provider_id: lifecycle.provider_id,
    next_action: lifecycle.next_action,
    reason_code: lifecycle.reason_code,
    evidence_refs: [],
    ...extra,
  };
}

async function append(stateStore: ReturnType<typeof createSqliteStateStore>, networkId: string, event: RealAgentDogfoodEvent, expectedRevision: number) {
  return appendRealAgentDogfoodEvent({ stateStore, expected_revision: expectedRevision, event });
}

async function start(options: Record<string, string | boolean | undefined>) {
  const repoInput = required(options, 'repo');
  const goal = required(options, 'goal');
  const providerId = required(options, 'provider-id');
  const adapter = required(options, 'adapter');
  const executable = required(options, 'executable');
  const networkPolicy = required(options, 'network-policy');
  if (!['network-denied', 'network-allowed'].includes(networkPolicy)) throw new Error('network-policy-invalid');
  if (!path.isAbsolute(executable) || executable.includes('\0')) throw new Error('executable-must-be-absolute');
  const defaults = defaultRealAgentDogfoodRuntimePaths();
  const paths = await validateRuntimePaths({ repo: repoInput, stateStore: typeof options['state-store'] === 'string' ? options['state-store'] : defaults.state_store, evidenceStore: typeof options['evidence-store'] === 'string' ? options['evidence-store'] : defaults.evidence_store });
  await mkdir(path.dirname(paths.stateStore), { recursive: true });
  await mkdir(paths.evidenceStore, { recursive: true });
  const networkId = `network-${randomUUID()}`;
  const dogfoodId = `dogfood-${randomUUID()}`;
  const executionId = `execution-${randomUUID()}`;
  const now = new Date().toISOString();
  const worktree = await prepareRealAgentDogfoodWorktree({ repo_root: paths.repo, worktree_root: typeof options['worktree-root'] === 'string' ? options['worktree-root'] : defaults.worktree_root, execution_id: executionId });
  if (worktree.status === 'blocked') throw new Error(`worktree-${worktree.reason}`);
  const stateStore = createSqliteStateStore({ filename: paths.stateStore });
  try {
    await stateStore.createNetwork({ network_id: networkId, owner_id: 'human-local', now });
    const draft = createRealAgentDogfoodDraft({ network_id: networkId, dogfood_id: dogfoodId, execution_id: executionId, attempt: 1, provider_id: providerId, adapter_version: adapter, created_at: now });
    let revision = 1;
    await append(stateStore, networkId, draft.event, revision++);
    const policyDigest = digest({ repo: paths.repo, worktree_path: worktree.worktree_path, base_commit: worktree.base_commit, branch: worktree.branch, executable, network_policy: networkPolicy });
    const preflight = createRealAgentDogfoodTransition({ lifecycle: draft.lifecycle, to: 'preflight-ready', event_id: `${dogfoodId}:preflight-ready`, occurred_at: now, fact_digest: policyDigest, next_action: 'human-approval' });
    await append(stateStore, networkId, preflight.event, revision++);
    const awaiting = createRealAgentDogfoodTransition({ lifecycle: preflight.lifecycle, to: 'awaiting-human-approval', event_id: `${dogfoodId}:awaiting-human-approval`, occurred_at: now, fact_digest: policyDigest, next_action: 'human-approval' });
    await append(stateStore, networkId, awaiting.event, revision++);
    const summaryBase = { schema: 'zj-loop.real_agent_dogfood_approval_summary.v1', status: awaiting.lifecycle.status, network_id: networkId, dogfood_id: dogfoodId, execution_id: executionId, attempt: 1, goal, repo: paths.repo, worktree_path: worktree.worktree_path, branch: worktree.branch, base_commit: worktree.base_commit, provider_id: providerId, adapter: adapter, executable, network_policy: networkPolicy, policy_digest: policyDigest, lifecycle_revision: revision, lifecycle_digest: awaiting.lifecycle.lifecycle_digest, created_at: now };
    const summary = { ...summaryBase, summary_digest: digest(summaryBase) };
    const summaryPath = path.join(paths.evidenceStore, `${dogfoodId}.approval-summary.json`);
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
    return outputLifecycle(awaiting.lifecycle, { provider_invoked: false, approval_summary_path: summaryPath, approval_summary_digest: summary.summary_digest, policy_digest: policyDigest, worktree_path: worktree.worktree_path, branch: worktree.branch, base_commit: worktree.base_commit, state_store: paths.stateStore });
  } finally {
    await stateStore.close();
  }
}

async function resume(options: Record<string, string | boolean | undefined>) {
  const dogfoodId = required(options, 'dogfood-id');
  const networkId = required(options, 'network-id');
  const approvalId = required(options, 'approval-id');
  if (!/^[A-Za-z0-9._-]{1,256}$/.test(approvalId)) throw new Error('approval-id-invalid');
  const defaults = defaultRealAgentDogfoodRuntimePaths();
  const evidenceStore = await canonicalPath(typeof options['evidence-store'] === 'string' ? options['evidence-store'] : defaults.evidence_store);
  const statePath = typeof options['state-store'] === 'string' ? options['state-store'] : defaults.state_store;
  const stateStore = createSqliteStateStore({ filename: statePath });
  try {
    const snapshot = await stateStore.readEvents({ network_id: networkId, aggregate_type: 'real-agent-dogfood', aggregate_id: dogfoodId });
    const events = snapshot.events as unknown as RealAgentDogfoodEvent[];
    const lifecycle = projectRealAgentDogfoodLifecycle(events);
    if (lifecycle.dogfood_id !== dogfoodId) throw new Error('dogfood-id-mismatch');
    if (lifecycle.status !== 'awaiting-human-approval') return outputLifecycle(lifecycle, { provider_invoked: false });
    let envelope: { schema?: unknown; dogfood_id?: unknown; execution_id?: unknown; attempt?: unknown; lifecycle_revision?: unknown; policy_digest?: unknown; approval_summary_digest?: unknown; approval?: HumanApprovalContext; identity?: HumanPublicIdentity };
    try {
      envelope = JSON.parse(await readFile(path.join(evidenceStore, `${approvalId}.json`), 'utf8')) as typeof envelope;
    } catch {
      return outputLifecycle(lifecycle, { provider_invoked: false, reason_code: 'human-approval-required', next_action: 'human-approval' });
    }
    if (envelope.schema !== 'zj-loop.real_agent_dogfood_approval_envelope.v1' || envelope.dogfood_id !== dogfoodId || envelope.execution_id !== lifecycle.execution_id || envelope.attempt !== lifecycle.attempt || envelope.lifecycle_revision !== snapshot.snapshot_revision || typeof envelope.policy_digest !== 'string' || typeof envelope.approval_summary_digest !== 'string' || !envelope.approval || !envelope.identity) throw new Error('human-approval-binding-invalid');
    const summaryPath = path.join(evidenceStore, `${dogfoodId}.approval-summary.json`);
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as { summary_digest?: unknown; policy_digest?: unknown };
    if (summary.summary_digest !== envelope.approval_summary_digest || summary.policy_digest !== envelope.policy_digest) throw new Error('human-approval-summary-mismatch');
    if (envelope.approval.action !== 'real-agent-dogfood.approve' || envelope.approval.request_id !== dogfoodId || envelope.approval.request_digest !== summary.summary_digest || envelope.approval.network_id !== networkId || envelope.approval.schema !== 'zj-loop.human_authority.v2') throw new Error('human-approval-context-mismatch');
    if (verifyHumanApprovalContextDetailed({ identity: envelope.identity, context: envelope.approval, require_v2: true }).status !== 'current-v2-accepted') throw new Error('human-approval-signature-invalid');
    const workerId = `worker-${randomUUID()}`;
    const lease = await acquireRealAgentDogfoodWorkerLease({ stateStore, network_id: networkId, execution_id: lifecycle.execution_id, worker_id: workerId });
    if (lease.status === 'blocked') throw new Error(lease.reason);
    const running = createRealAgentDogfoodTransition({ lifecycle, to: 'running', event_id: `${dogfoodId}:attempt-${lifecycle.attempt}:running`, occurred_at: new Date().toISOString(), approval_digest: digest(envelope.approval), next_action: 'provider-execution' });
    const result = await append(stateStore, networkId, running.event, lease.revision);
    if (result.status === 'conflict') throw new Error('lifecycle-revision-conflict');
    return outputLifecycle(running.lifecycle, { provider_invoked: false, worker_id: lease.worker_id, worker_lease_id: lease.lease_id, worker_lease_expires_at: lease.expires_at, approval_digest: running.lifecycle.approval_digest });
  } finally {
    await stateStore.close();
  }
}

async function status(options: Record<string, string | boolean | undefined>) {
  const dogfoodId = required(options, 'dogfood-id');
  const networkId = required(options, 'network-id');
  const defaults = defaultRealAgentDogfoodRuntimePaths();
  const statePath = typeof options['state-store'] === 'string' ? options['state-store'] : defaults.state_store;
  const stateStore = createSqliteStateStore({ filename: statePath });
  try {
    const snapshot = await stateStore.readEvents({ network_id: networkId, aggregate_type: 'real-agent-dogfood', aggregate_id: dogfoodId });
    const events = snapshot.events as unknown as RealAgentDogfoodEvent[];
    const lifecycle = projectRealAgentDogfoodLifecycle(events);
    if (lifecycle.dogfood_id !== dogfoodId) throw new Error('dogfood-id-mismatch');
    return outputLifecycle(lifecycle, { state_revision: snapshot.snapshot_revision, event_count: events.length });
  } finally {
    await stateStore.close();
  }
}

export function runRealAgentDogfoodCli(argv: readonly string[] = process.argv.slice(2), io?: CliIo): Promise<number> {
  const outputIo = io ?? defaultCliIo;
  return runCli({
    name: CLI_NAME,
    description: 'Prepare and inspect a provider-neutral OPN real-agent dogfood lifecycle.',
    usage: `${CLI_NAME} <start|status> [options]`,
    options: [
      { name: 'command', type: 'positional', description: 'start or status' },
      { name: 'goal', type: 'string', description: 'Human-readable goal' },
      { name: 'repo', type: 'string', description: 'Target repository path' },
      { name: 'provider-id', flag: 'provider-id', type: 'string', description: 'Provider identity' },
      { name: 'adapter', type: 'string', description: 'Provider adapter version' },
      { name: 'executable', type: 'string', description: 'Absolute Provider executable path' },
      { name: 'network-policy', flag: 'network-policy', type: 'enum', values: ['network-denied', 'network-allowed'], description: 'Coarse network policy' },
      { name: 'state-store', flag: 'state-store', type: 'string', description: 'SQLite StateStore path' },
      { name: 'evidence-store', flag: 'evidence-store', type: 'string', description: 'Evidence directory path' },
      { name: 'dogfood-id', flag: 'dogfood-id', type: 'string', description: 'Dogfood id for status' },
      { name: 'network-id', flag: 'network-id', type: 'string', description: 'Network id for status' },
      { name: 'approval-id', flag: 'approval-id', type: 'string', description: 'Persisted approval envelope id for resume' },
      { name: 'worktree-root', flag: 'worktree-root', type: 'string', description: 'Directory for isolated execution worktrees' },
    ],
    async handler({ options }) {
      const command = String(options.command ?? '');
      if (command === 'start') {
        const result = await start(options);
        outputIo.stdout(JSON.stringify(result, null, 2));
        return 0;
      }
      if (command === 'status') {
        const result = await status(options);
        outputIo.stdout(JSON.stringify(result, null, 2));
        return 0;
      }
      if (command === 'resume') {
        const result = await resume(options);
        outputIo.stdout(JSON.stringify(result, null, 2));
        return 0;
      }
      throw new Error('unsupported-real-agent-dogfood-command');
    },
  }, argv, io);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = await runRealAgentDogfoodCli();
}
