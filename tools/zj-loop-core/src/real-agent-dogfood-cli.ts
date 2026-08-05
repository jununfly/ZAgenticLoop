#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
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
import { acquireRealAgentDogfoodCoordinatorLease, releaseRealAgentDogfoodCoordinatorLease } from './real-agent-dogfood-coordinator-lease.js';
import { prepareRealAgentDogfoodWorktree } from './real-agent-dogfood-worktree.js';
import { buildCodexInvocation, validateCodexExecutionModeBinding, type CodexExecutionMode } from './codex-agent-provider-adapter.js';
import { createRealAgentDogfoodExecutionBinding, createRealAgentDogfoodExecutionBindingDigest } from './real-agent-dogfood-binding.js';
import { trustedRunnerAdmissionBundleDigest, validateAdmissionBoundExecution, type AdmissionBoundExecution } from './trusted-runner-admission-binding.js';
import { admitTrustedRunnerExecution, readTrustedRunnerRegistry } from './trusted-runner-registry-store.js';
import { createProviderRuntimeAdapterContract, providerRuntimeAdapterContractDigest } from './provider-runtime-adapter.js';
import { createRealAgentDogfoodGraphPlan, validateRealAgentDogfoodGraphWorktrees, type RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import { REAL_AGENT_DOGFOOD_GRAPH_PHASES } from './real-agent-dogfood-graph-orchestrator.js';
import { projectRealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
import { evaluateRealAgentDogfoodCoordinatorResumeGate } from './real-agent-dogfood-coordinator-resume-gate.js';

const CLI_NAME = 'zj-loop-real-agent-dogfood';
const DIGEST = /^sha256:[0-9a-f]{64}$/;

type RuntimePaths = { state_store: string; evidence_store: string; worktree_root: string };
type ProviderRuntimeIpcBinding = { socket_path: string; correlation_id?: string; timeout_ms?: number; contract_digest: string; runtime_binding: { runtime_identity_fingerprint: string; runtime_manifest_digest: string; provider_capabilities_digest: string } };

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

async function buildAdapterContractDigest(input: { provider_id: string; adapter: string; executable: string; network_policy: string }): Promise<string> {
  const contract = createProviderRuntimeAdapterContract({
    adapter_id: input.provider_id,
    adapter_version: input.adapter,
    binary_digest: `sha256:${createHash('sha256').update(await readFile(input.executable)).digest('hex')}`,
    argv_policy_digest: digest({ provider_id: input.provider_id, adapter: input.adapter, network_policy: input.network_policy, argv_policy: ['exec', '--json', '--ephemeral', '--sandbox', 'read-only', '--ask-for-approval', 'never', '--cd', '<isolated-worktree>'] }),
  });
  return providerRuntimeAdapterContractDigest(contract);
}

function admissionBindingsEqual(left: AdmissionBoundExecution['binding'], right: AdmissionBoundExecution['binding']): boolean {
  return left.network_id === right.network_id
    && left.runner_id === right.runner_id
    && left.registry_revision === right.registry_revision
    && left.registry_snapshot_digest === right.registry_snapshot_digest
    && JSON.stringify(left.required_capabilities) === JSON.stringify(right.required_capabilities)
    && JSON.stringify(left.capabilities) === JSON.stringify(right.capabilities)
    && left.capabilities_digest === right.capabilities_digest
    && JSON.stringify(left.provider_auth_ref) === JSON.stringify(right.provider_auth_ref)
    && JSON.stringify(left.runtime_binding) === JSON.stringify(right.runtime_binding);
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

function executionMode(options: Record<string, string | boolean | undefined>): CodexExecutionMode {
  const value = options['execution-mode'];
  if (value === undefined) return 'read-only';
  if (value === 'read-only' || value === 'write-enabled') return value;
  throw new Error('execution-mode-invalid');
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
  const mode = executionMode(options);
  const allowedFiles = typeof options['allowed-file'] === 'string' && options['allowed-file'].trim() !== '' ? [options['allowed-file']] : [];
  if (mode === 'write-enabled' && allowedFiles.length === 0) throw new Error('write-scope-allowed-file-required');
  if (!['network-denied', 'network-allowed'].includes(networkPolicy)) throw new Error('network-policy-invalid');
  if (!path.isAbsolute(executable) || executable.includes('\0')) throw new Error('executable-must-be-absolute');
  const defaults = defaultRealAgentDogfoodRuntimePaths();
  const graphPlanPath = typeof options['graph-plan'] === 'string' ? options['graph-plan'] : '';
  let graphPlan: RealAgentDogfoodGraphPlan | undefined;
  if (graphPlanPath) {
    try {
      const candidate = JSON.parse(await readFile(graphPlanPath, 'utf8')) as RealAgentDogfoodGraphPlan;
      const rebound = createRealAgentDogfoodGraphPlan(candidate);
      if (rebound.plan_digest !== candidate.plan_digest || rebound.repo_root !== repoInput || rebound.execution_mode !== mode || rebound.network_policy !== networkPolicy || JSON.stringify(rebound.allowed_files) !== JSON.stringify(allowedFiles)) throw new Error('graph-plan-binding-invalid');
      graphPlan = rebound;
    } catch (error) { throw new Error(error instanceof Error ? error.message : 'graph-plan-invalid'); }
  }
  const paths = await validateRuntimePaths({ repo: repoInput, stateStore: typeof options['state-store'] === 'string' ? options['state-store'] : defaults.state_store, evidenceStore: typeof options['evidence-store'] === 'string' ? options['evidence-store'] : defaults.evidence_store });
  await mkdir(path.dirname(paths.stateStore), { recursive: true });
  await mkdir(paths.evidenceStore, { recursive: true });
  const networkId = `network-${randomUUID()}`;
  const dogfoodId = graphPlan?.dogfood_id ?? `dogfood-${randomUUID()}`;
  const executionId = graphPlan?.execution_id ?? `execution-${randomUUID()}`;
  const now = new Date().toISOString();
  const graphWorktree = graphPlan ? await validateRealAgentDogfoodGraphWorktrees({ plan: graphPlan }) : undefined;
  const worktree = graphPlan
    ? graphWorktree?.status === 'valid'
      ? { status: 'reused' as const, execution_id: executionId, branch: graphWorktree.source_branch as string, worktree_path: graphPlan.source_worktree, base_commit: graphPlan.baseline_commit }
      : { status: 'blocked' as const, reason: graphWorktree?.reason ?? 'graph-worktree-observation-uncertain' }
    : await prepareRealAgentDogfoodWorktree({ repo_root: paths.repo, worktree_root: typeof options['worktree-root'] === 'string' ? options['worktree-root'] : defaults.worktree_root, execution_id: executionId });
  if (worktree.status === 'blocked') throw new Error(`worktree-${worktree.reason}`);
  const stateStore = createSqliteStateStore({ filename: paths.stateStore });
  try {
    await stateStore.createNetwork({ network_id: networkId, owner_id: 'human-local', now });
    const draft = createRealAgentDogfoodDraft({ network_id: networkId, dogfood_id: dogfoodId, execution_id: executionId, attempt: 1, provider_id: providerId, adapter_version: adapter, created_at: now });
    let revision = 1;
    await append(stateStore, networkId, draft.event, revision++);
    const policyDigest = digest({ repo: paths.repo, worktree_path: worktree.worktree_path, base_commit: worktree.base_commit, branch: worktree.branch, executable, network_policy: networkPolicy, execution_mode: mode, allowed_files: allowedFiles });
    const adapterContractDigest = await buildAdapterContractDigest({ provider_id: providerId, adapter, executable, network_policy: networkPolicy });
    const preflight = createRealAgentDogfoodTransition({ lifecycle: draft.lifecycle, to: 'preflight-ready', event_id: `${dogfoodId}:preflight-ready`, occurred_at: now, fact_digest: policyDigest, next_action: 'human-approval' });
    await append(stateStore, networkId, preflight.event, revision++);
    const awaiting = createRealAgentDogfoodTransition({ lifecycle: preflight.lifecycle, to: 'awaiting-human-approval', event_id: `${dogfoodId}:awaiting-human-approval`, occurred_at: now, fact_digest: policyDigest, next_action: 'human-approval' });
    await append(stateStore, networkId, awaiting.event, revision++);
    const summaryBase = { schema: 'zj-loop.real_agent_dogfood_approval_summary.v1', status: awaiting.lifecycle.status, network_id: networkId, dogfood_id: dogfoodId, execution_id: executionId, attempt: 1, goal, repo: paths.repo, worktree_path: worktree.worktree_path, branch: worktree.branch, base_commit: worktree.base_commit, provider_id: providerId, adapter: adapter, adapter_contract_digest: adapterContractDigest, executable, network_policy: networkPolicy, execution_mode: mode, allowed_files: allowedFiles, graph_plan: graphPlan, policy_digest: policyDigest, lifecycle_revision: revision, lifecycle_digest: awaiting.lifecycle.lifecycle_digest, created_at: now };
    const summary = { ...summaryBase, summary_digest: digest(summaryBase) };
    const summaryPath = path.join(paths.evidenceStore, `${dogfoodId}.approval-summary.json`);
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
    return outputLifecycle(awaiting.lifecycle, { provider_invoked: false, approval_summary_path: summaryPath, approval_summary_digest: summary.summary_digest, policy_digest: policyDigest, worktree_path: worktree.worktree_path, branch: worktree.branch, base_commit: worktree.base_commit, state_store: paths.stateStore });
  } finally {
    await stateStore.close();
  }
}

async function bindAdmission(options: Record<string, string | boolean | undefined>) {
  const dogfoodId = required(options, 'dogfood-id');
  const networkId = required(options, 'network-id');
  const admissionPath = required(options, 'admission-context');
  const defaults = defaultRealAgentDogfoodRuntimePaths();
  const evidenceStore = await canonicalPath(typeof options['evidence-store'] === 'string' ? options['evidence-store'] : defaults.evidence_store);
  const statePath = typeof options['state-store'] === 'string' ? options['state-store'] : defaults.state_store;
  const stateStore = createSqliteStateStore({ filename: statePath });
  try {
    const snapshot = await stateStore.readEvents({ network_id: networkId, aggregate_type: 'real-agent-dogfood', aggregate_id: dogfoodId });
    const lifecycle = projectRealAgentDogfoodLifecycle(snapshot.events as unknown as RealAgentDogfoodEvent[]);
    if (lifecycle.status !== 'awaiting-human-approval' || lifecycle.dogfood_id !== dogfoodId) throw new Error('admission-bind-lifecycle-invalid');
    const admission = JSON.parse(await readFile(admissionPath, 'utf8')) as AdmissionBoundExecution;
    const checked = validateAdmissionBoundExecution(admission);
    if (checked.status === 'blocked' || admission.execution.execution_id !== lifecycle.execution_id || admission.execution.attempt !== lifecycle.attempt) throw new Error(checked.status === 'blocked' ? checked.reason : 'trusted-runner-admission-execution-binding-invalid');
    let currentRegistry;
    try {
      currentRegistry = await readTrustedRunnerRegistry({ stateStore, network_id: networkId });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'trusted-runner-admission-registry-unavailable');
    }
    const replayed = admitTrustedRunnerExecution({
      snapshot: currentRegistry.snapshot,
      runner_id: admission.binding.runner_id,
      required_capabilities: admission.binding.required_capabilities,
      expected_registry_revision: admission.binding.registry_revision,
      expected_registry_snapshot_digest: admission.binding.registry_snapshot_digest,
    });
    if (replayed.status === 'blocked') throw new Error(`trusted-runner-admission-${replayed.reason}`);
    const replayedBinding = { ...replayed.binding, provider_auth_ref: admission.binding.provider_auth_ref, runtime_binding: admission.binding.runtime_binding };
    if (!admissionBindingsEqual(replayedBinding, admission.binding)) throw new Error('trusted-runner-admission-binding-provenance-mismatch');
    const summaryPath = path.join(evidenceStore, `${dogfoodId}.approval-summary.json`);
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Record<string, unknown>;
    if (summary.network_id !== networkId || summary.execution_id !== lifecycle.execution_id || summary.attempt !== lifecycle.attempt) throw new Error('admission-bind-summary-mismatch');
    const { summary_digest: _, ...summaryBase } = summary;
    const boundSummaryBase = { ...summaryBase, admission_digest: trustedRunnerAdmissionBundleDigest(admission), provider_auth_ref: admission.binding.provider_auth_ref, runtime_binding: admission.binding.runtime_binding };
    const boundSummary = { ...boundSummaryBase, summary_digest: digest(boundSummaryBase) };
    await writeFile(summaryPath, `${JSON.stringify(boundSummary, null, 2)}\n`, { mode: 0o600 });
    return outputLifecycle(lifecycle, { provider_invoked: false, approval_summary_path: summaryPath, approval_summary_digest: boundSummary.summary_digest, admission_digest: boundSummary.admission_digest });
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
    let envelope: { schema?: unknown; dogfood_id?: unknown; execution_id?: unknown; attempt?: unknown; lifecycle_revision?: unknown; policy_digest?: unknown; approval_summary_digest?: unknown; admission_digest?: unknown; provider_auth_ref?: unknown; runtime_binding?: unknown; approval?: HumanApprovalContext; identity?: HumanPublicIdentity };
    try {
      envelope = JSON.parse(await readFile(path.join(evidenceStore, `${approvalId}.json`), 'utf8')) as typeof envelope;
    } catch {
      return outputLifecycle(lifecycle, { provider_invoked: false, reason_code: 'human-approval-required', next_action: 'human-approval' });
    }
    if (envelope.schema !== 'zj-loop.real_agent_dogfood_approval_envelope.v1' || envelope.dogfood_id !== dogfoodId || envelope.execution_id !== lifecycle.execution_id || envelope.attempt !== lifecycle.attempt || typeof envelope.policy_digest !== 'string' || typeof envelope.approval_summary_digest !== 'string' || !envelope.approval || !envelope.identity) throw new Error('human-approval-binding-invalid');
    const summaryPath = path.join(evidenceStore, `${dogfoodId}.approval-summary.json`);
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as { summary_digest?: unknown; admission_digest?: unknown; provider_auth_ref?: unknown; runtime_binding?: unknown; policy_digest?: unknown; lifecycle_revision?: unknown; goal?: unknown; executable?: unknown; worktree_path?: unknown; adapter_contract_digest?: unknown; execution_mode?: unknown; repo?: unknown; base_commit?: unknown; allowed_files?: unknown; graph_plan?: unknown };
    if (summary.summary_digest !== envelope.approval_summary_digest || summary.policy_digest !== envelope.policy_digest || summary.lifecycle_revision !== envelope.lifecycle_revision || typeof summary.adapter_contract_digest !== 'string' || !DIGEST.test(summary.adapter_contract_digest)) throw new Error('human-approval-summary-mismatch');
    if (envelope.approval.action !== 'real-agent-dogfood.approve' || envelope.approval.request_id !== dogfoodId || envelope.approval.request_digest !== summary.summary_digest || envelope.approval.network_id !== networkId || envelope.approval.schema !== 'zj-loop.human_authority.v2') throw new Error('human-approval-context-mismatch');
    if (verifyHumanApprovalContextDetailed({ identity: envelope.identity, context: envelope.approval, require_v2: true }).status !== 'current-v2-accepted') throw new Error('human-approval-signature-invalid');
    let admissionBoundExecution: AdmissionBoundExecution | undefined;
    let providerRuntimeIpc: ProviderRuntimeIpcBinding | undefined;
    if (lifecycle.provider_id === 'codex') {
      const admissionContextPath = typeof options['admission-context'] === 'string' ? options['admission-context'] : '';
      if (!admissionContextPath) {
        const blocked = createRealAgentDogfoodTransition({ lifecycle, to: 'blocked', event_id: `${dogfoodId}:attempt-${lifecycle.attempt}:admission-required`, occurred_at: new Date().toISOString(), fact_digest: digest({ reason_code: 'trusted-runner-admission-required' }), reason_code: 'trusted-runner-admission-required', next_action: 'prepare-trusted-runner-admission' });
        const blockedResult = await append(stateStore, networkId, blocked.event, snapshot.snapshot_revision);
        if (blockedResult.status === 'conflict') throw new Error('admission-required-record-conflict');
        return outputLifecycle(blocked.lifecycle, { provider_invoked: false });
      }
      try {
        admissionBoundExecution = JSON.parse(await readFile(admissionContextPath, 'utf8')) as AdmissionBoundExecution;
      } catch {
        throw new Error('trusted-runner-admission-context-invalid');
      }
      const admissionCheck = validateAdmissionBoundExecution(admissionBoundExecution);
      const admissionDigest = admissionCheck.status === 'valid' ? trustedRunnerAdmissionBundleDigest(admissionBoundExecution) : null;
      if (admissionCheck.status === 'blocked' || admissionBoundExecution.execution.execution_id !== lifecycle.execution_id || admissionBoundExecution.execution.attempt !== lifecycle.attempt || summary.admission_digest !== admissionDigest || envelope.admission_digest !== admissionDigest || JSON.stringify(summary.provider_auth_ref) !== JSON.stringify(admissionBoundExecution.binding.provider_auth_ref) || JSON.stringify(envelope.provider_auth_ref) !== JSON.stringify(admissionBoundExecution.binding.provider_auth_ref) || JSON.stringify(summary.runtime_binding) !== JSON.stringify(admissionBoundExecution.binding.runtime_binding) || JSON.stringify(envelope.runtime_binding) !== JSON.stringify(admissionBoundExecution.binding.runtime_binding)) {
        const reason = admissionCheck.status === 'blocked' ? admissionCheck.reason : summary.admission_digest !== admissionDigest || envelope.admission_digest !== admissionDigest ? 'trusted-runner-admission-digest-mismatch' : JSON.stringify(summary.provider_auth_ref) !== JSON.stringify(admissionBoundExecution.binding.provider_auth_ref) || JSON.stringify(envelope.provider_auth_ref) !== JSON.stringify(admissionBoundExecution.binding.provider_auth_ref) ? 'provider-auth-ref-binding-mismatch' : JSON.stringify(summary.runtime_binding) !== JSON.stringify(admissionBoundExecution.binding.runtime_binding) || JSON.stringify(envelope.runtime_binding) !== JSON.stringify(admissionBoundExecution.binding.runtime_binding) ? 'provider-runtime-identity-binding-mismatch' : 'trusted-runner-admission-execution-binding-invalid';
        const blocked = createRealAgentDogfoodTransition({ lifecycle, to: 'blocked', event_id: `${dogfoodId}:attempt-${lifecycle.attempt}:admission-invalid`, occurred_at: new Date().toISOString(), fact_digest: digest({ reason_code: reason }), reason_code: reason, next_action: 'prepare-trusted-runner-admission' });
        const blockedResult = await append(stateStore, networkId, blocked.event, snapshot.snapshot_revision);
        if (blockedResult.status === 'conflict') throw new Error('admission-invalid-record-conflict');
        return outputLifecycle(blocked.lifecycle, { provider_invoked: false });
      }
      const providerRuntimeIpcPath = typeof options['provider-runtime-ipc'] === 'string' ? options['provider-runtime-ipc'] : '';
      if (!providerRuntimeIpcPath) {
        const blocked = createRealAgentDogfoodTransition({ lifecycle, to: 'blocked', event_id: `${dogfoodId}:attempt-${lifecycle.attempt}:provider-runtime-ipc-required`, occurred_at: new Date().toISOString(), fact_digest: digest({ reason_code: 'provider-runtime-ipc-required' }), reason_code: 'provider-runtime-ipc-required', next_action: 'configure-provider-runtime-ipc' });
        const blockedResult = await append(stateStore, networkId, blocked.event, snapshot.snapshot_revision);
        if (blockedResult.status === 'conflict') throw new Error('provider-runtime-ipc-required-record-conflict');
        return outputLifecycle(blocked.lifecycle, { provider_invoked: false });
      }
      try {
        providerRuntimeIpc = JSON.parse(await readFile(providerRuntimeIpcPath, 'utf8')) as ProviderRuntimeIpcBinding;
      } catch {
        const blocked = createRealAgentDogfoodTransition({ lifecycle, to: 'blocked', event_id: `${dogfoodId}:attempt-${lifecycle.attempt}:provider-runtime-ipc-invalid`, occurred_at: new Date().toISOString(), fact_digest: digest({ reason_code: 'provider-runtime-ipc-invalid' }), reason_code: 'provider-runtime-ipc-invalid', next_action: 'configure-provider-runtime-ipc' });
        const blockedResult = await append(stateStore, networkId, blocked.event, snapshot.snapshot_revision);
        if (blockedResult.status === 'conflict') throw new Error('provider-runtime-ipc-invalid-record-conflict');
        return outputLifecycle(blocked.lifecycle, { provider_invoked: false });
      }
      if (!providerRuntimeIpc || typeof providerRuntimeIpc.socket_path !== 'string' || !providerRuntimeIpc.socket_path.trim() || typeof providerRuntimeIpc.contract_digest !== 'string' || !DIGEST.test(providerRuntimeIpc.contract_digest) || !providerRuntimeIpc.runtime_binding || JSON.stringify(providerRuntimeIpc.runtime_binding) !== JSON.stringify(admissionBoundExecution.binding.runtime_binding)) {
        const blocked = createRealAgentDogfoodTransition({ lifecycle, to: 'blocked', event_id: `${dogfoodId}:attempt-${lifecycle.attempt}:provider-runtime-ipc-binding-invalid`, occurred_at: new Date().toISOString(), fact_digest: digest({ reason_code: 'provider-runtime-ipc-binding-invalid' }), reason_code: 'provider-runtime-ipc-binding-invalid', next_action: 'configure-provider-runtime-ipc' });
        const blockedResult = await append(stateStore, networkId, blocked.event, snapshot.snapshot_revision);
        if (blockedResult.status === 'conflict') throw new Error('provider-runtime-ipc-binding-invalid-record-conflict');
        return outputLifecycle(blocked.lifecycle, { provider_invoked: false });
      }
    }
    let executionBindingDigest: string;
    let codexInvocation: ReturnType<typeof buildCodexInvocation> | undefined;
    if (lifecycle.provider_id === 'codex') {
      if (typeof summary.goal !== 'string' || typeof summary.executable !== 'string' || typeof summary.worktree_path !== 'string') throw new Error('worker-context-source-missing');
      if (summary.execution_mode !== 'read-only' && summary.execution_mode !== 'write-enabled') throw new Error('execution-mode-binding-invalid');
      if (summary.execution_mode === 'write-enabled' && (!Array.isArray(summary.allowed_files) || summary.allowed_files.length === 0 || typeof summary.repo !== 'string' || typeof summary.base_commit !== 'string')) throw new Error('write-scope-summary-binding-invalid');
      codexInvocation = buildCodexInvocation({ executable: summary.executable, cwd: summary.worktree_path, mode: summary.execution_mode });
      const modeBinding = validateCodexExecutionModeBinding({ mode: summary.execution_mode, admitted_args: admissionBoundExecution?.preflight.args ?? [], invocation_args: codexInvocation.args });
      if (modeBinding.status === 'blocked') throw new Error(modeBinding.reason);
      executionBindingDigest = await createRealAgentDogfoodExecutionBindingDigest({ executable: codexInvocation.executable, args: codexInvocation.args, cwd: codexInvocation.cwd, worktree_path: summary.worktree_path });
    } else {
      executionBindingDigest = digest({ schema: 'zj-loop.real_agent_dogfood_execution_binding.v1', execution_id: lifecycle.execution_id, attempt: lifecycle.attempt, provider_id: lifecycle.provider_id, adapter_contract_digest: summary.adapter_contract_digest, worktree_path: summary.worktree_path });
    }
    let coordinatorLease: Awaited<ReturnType<typeof acquireRealAgentDogfoodCoordinatorLease>> | undefined;
    if (summary.graph_plan && typeof summary.graph_plan === 'object') {
      const humanId = required(options, 'human-id');
      const coordinatorId = required(options, 'coordinator-id');
      const sessionId = required(options, 'session-id');
      const graphPlan = createRealAgentDogfoodGraphPlan(summary.graph_plan as RealAgentDogfoodGraphPlan);
      if (graphPlan.dogfood_id !== dogfoodId || graphPlan.execution_id !== lifecycle.execution_id || graphPlan.plan_digest !== (summary.graph_plan as { plan_digest?: unknown }).plan_digest) throw new Error('graph-plan-resume-binding-invalid');
      const graphSnapshot = await stateStore.readEvents({ network_id: networkId, aggregate_type: 'real-agent-dogfood-graph', aggregate_id: dogfoodId });
      const phase = projectRealAgentDogfoodGraphPhaseRecord({ plan: graphPlan, events: graphSnapshot.events });
      const nextPhase = REAL_AGENT_DOGFOOD_GRAPH_PHASES[phase?.completed_phases.length ?? 0];
      if (!nextPhase || phase?.status === 'blocked' || phase?.status === 'outcome-uncertain' || phase && (!phase.actor_kind || !phase.actor_identity)) {
        const gate = evaluateRealAgentDogfoodCoordinatorResumeGate({ execution_id: lifecycle.execution_id, execution_binding_digest: executionBindingDigest, lease: { status: 'blocked', reason: 'graph-phase-not-ready' }, phase, next_phase: nextPhase ?? 'cleanup' });
        return outputLifecycle(lifecycle, { provider_invoked: false, graph_resume_gate: gate });
      }
      coordinatorLease = await acquireRealAgentDogfoodCoordinatorLease({ stateStore, network_id: networkId, execution_id: lifecycle.execution_id, human_id: humanId, coordinator_id: coordinatorId, session_id: sessionId, execution_binding_digest: executionBindingDigest });
      const activeCoordinatorLease = coordinatorLease.status === 'acquired' || coordinatorLease.status === 'reused' || coordinatorLease.status === 'renewed'
        ? { ...coordinatorLease, execution_id: lifecycle.execution_id, execution_binding_digest: executionBindingDigest }
        : null;
      const gate = evaluateRealAgentDogfoodCoordinatorResumeGate({ execution_id: lifecycle.execution_id, execution_binding_digest: executionBindingDigest, lease: activeCoordinatorLease ?? { status: 'blocked', reason: 'coordinator-lease-unavailable' }, phase, next_phase: nextPhase });
      if (gate.status === 'blocked') {
        if (activeCoordinatorLease) await releaseRealAgentDogfoodCoordinatorLease({ stateStore, network_id: networkId, execution_id: lifecycle.execution_id, lease_id: activeCoordinatorLease.lease_id, human_id: humanId, coordinator_id: coordinatorId, expected_revision: activeCoordinatorLease.revision });
        return outputLifecycle(lifecycle, { provider_invoked: false, graph_resume_gate: gate });
      }
    }
    const workerId = `worker-${randomUUID()}`;
    const lease = await acquireRealAgentDogfoodWorkerLease({ stateStore, network_id: networkId, execution_id: lifecycle.execution_id, worker_id: workerId, execution_binding_digest: executionBindingDigest });
    if (lease.status === 'blocked') throw new Error(lease.reason);
    if (lease.status !== 'acquired' && lease.status !== 'reused' && lease.status !== 'renewed') throw new Error('worker-lease-terminal');
    let workerContext: { path: string; binding: Awaited<ReturnType<typeof createRealAgentDogfoodExecutionBinding>> } | undefined;
    if (lifecycle.provider_id === 'codex') {
      if (!codexInvocation || typeof summary.worktree_path !== 'string') throw new Error('worker-context-source-missing');
      const binding = await createRealAgentDogfoodExecutionBinding({ executable: codexInvocation.executable, args: codexInvocation.args, cwd: codexInvocation.cwd, worktree_path: summary.worktree_path, lease_id: lease.lease_id });
      if (binding.execution_binding_digest !== executionBindingDigest) throw new Error('worker-execution-binding-digest-mismatch');
      workerContext = { path: path.join(evidenceStore, `${dogfoodId}.worker-context.json`), binding };
    }
    const running = createRealAgentDogfoodTransition({ lifecycle, to: 'running', event_id: `${dogfoodId}:attempt-${lifecycle.attempt}:running`, occurred_at: new Date().toISOString(), approval_digest: digest(envelope.approval), next_action: 'provider-execution' });
    const result = await append(stateStore, networkId, running.event, lease.revision);
    if (result.status === 'conflict') throw new Error('lifecycle-revision-conflict');
    if (!workerContext) return outputLifecycle(running.lifecycle, { provider_invoked: false, worker_id: lease.worker_id, worker_lease_id: lease.lease_id, worker_lease_expires_at: lease.expires_at, approval_digest: running.lifecycle.approval_digest });
    try {
      await writeFile(workerContext.path, `${JSON.stringify({ schema: 'zj-loop.real_agent_dogfood_worker_context.v1', provider_id: lifecycle.provider_id, provider_auth_ref: admissionBoundExecution?.binding.provider_auth_ref, runtime_binding: admissionBoundExecution?.binding.runtime_binding, adapter_contract_digest: summary.adapter_contract_digest, graph_mode: Boolean(summary.graph_plan), graph_plan: summary.graph_plan, execution_mode: summary.execution_mode, git_scope: summary.execution_mode === 'write-enabled' ? { repo_root: summary.repo, baseline_commit: summary.base_commit, allowed_files: summary.allowed_files } : undefined, state_store: statePath, evidence_store: evidenceStore, network_id: networkId, dogfood_id: dogfoodId, execution_id: lifecycle.execution_id, worker_id: lease.worker_id, lease_id: lease.lease_id, execution_binding_digest: executionBindingDigest, binding: workerContext.binding, admission_bound_execution: admissionBoundExecution, worktree_path: workerContext.binding.worktree_path, executable: workerContext.binding.executable, goal: summary.goal, expected_revision: result.revision }, null, 2)}\n`, { mode: 0o600 });
      const workerContextPayload = JSON.parse(await readFile(workerContext.path, 'utf8')) as Record<string, unknown>;
      workerContextPayload.provider_runtime_ipc = providerRuntimeIpc;
      await writeFile(workerContext.path, `${JSON.stringify(workerContextPayload, null, 2)}\n`, { mode: 0o600 });
      const workerCli = path.join(path.dirname(fileURLToPath(import.meta.url)), 'real-agent-dogfood-worker-cli.js');
      const child = spawn(process.execPath, [workerCli, 'worker', '--provider-id', 'codex', '--context', workerContext.path], { detached: true, stdio: 'ignore', shell: false, windowsHide: true });
      child.unref();
      return outputLifecycle(running.lifecycle, { provider_invoked: false, worker_started: true, worker_context_path: workerContext.path, worker_id: lease.worker_id, worker_lease_id: lease.lease_id, worker_lease_expires_at: lease.expires_at, approval_digest: running.lifecycle.approval_digest });
    } catch (error) {
      const blocked = createRealAgentDogfoodTransition({ lifecycle: running.lifecycle, to: 'blocked', event_id: `${dogfoodId}:attempt-${lifecycle.attempt}:worker-start-blocked`, occurred_at: new Date().toISOString(), fact_digest: digest({ error: error instanceof Error ? error.message : String(error), worker_context_path: workerContext.path }), reason_code: 'worker-start-failed', next_action: 'human-reconciliation' });
      const blockedResult = await append(stateStore, networkId, blocked.event, result.revision as number);
      if (blockedResult.status === 'conflict') throw new Error('worker-start-failure-record-conflict');
      return outputLifecycle(blocked.lifecycle, { provider_invoked: false, worker_started: false, worker_context_path: workerContext.path });
    }
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
      { name: 'execution-mode', flag: 'execution-mode', type: 'enum', values: ['read-only', 'write-enabled'], description: 'Explicit provider execution mode' },
      { name: 'allowed-file', flag: 'allowed-file', type: 'string', description: 'Exact repository-relative file allowed for write-enabled execution' },
      { name: 'state-store', flag: 'state-store', type: 'string', description: 'SQLite StateStore path' },
      { name: 'evidence-store', flag: 'evidence-store', type: 'string', description: 'Evidence directory path' },
      { name: 'dogfood-id', flag: 'dogfood-id', type: 'string', description: 'Dogfood id for status' },
      { name: 'network-id', flag: 'network-id', type: 'string', description: 'Network id for status' },
      { name: 'approval-id', flag: 'approval-id', type: 'string', description: 'Persisted approval envelope id for resume' },
      { name: 'admission-context', flag: 'admission-context', type: 'string', description: 'Persisted AdmissionBoundExecution artifact for resume' },
      { name: 'provider-runtime-ipc', flag: 'provider-runtime-ipc', type: 'string', description: 'Persisted Provider Runtime IPC binding JSON for Codex resume' },
      { name: 'worktree-root', flag: 'worktree-root', type: 'string', description: 'Directory for isolated execution worktrees' },
      { name: 'graph-plan', flag: 'graph-plan', type: 'string', description: 'Persisted Graph dogfood plan using prepared target/source/verifier worktrees' },
      { name: 'human-id', flag: 'human-id', type: 'string', description: 'Final responsibility Human id for Graph resume' },
      { name: 'coordinator-id', flag: 'coordinator-id', type: 'string', description: 'Coordinator identity for Graph resume' },
      { name: 'session-id', flag: 'session-id', type: 'string', description: 'Coordinator session identity for Graph resume' },
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
      if (command === 'bind-admission') {
        const result = await bindAdmission(options);
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
