#!/usr/bin/env node
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defaultCliIo, runCli, type CliIo } from './cli.js';
import { readFile, writeFile } from 'node:fs/promises';
import { createSqliteStateStore } from './sqlite-state-store.js';
import { createContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
import { projectRealAgentDogfoodLifecycle, type RealAgentDogfoodEvent } from './real-agent-dogfood-lifecycle.js';
import { executeRealAgentDogfoodWorker } from './real-agent-dogfood-worker-runner.js';
import type { RealAgentDogfoodExecutionBinding } from './real-agent-dogfood-binding.js';
import type { AdmissionBoundExecution } from './trusted-runner-admission-binding.js';
import { createProviderRuntimeIpcCleanupCoordinator } from './provider-auth-ipc-cleanup-client.js';
import { createProviderRuntimeIpcProvider } from './provider-auth-ipc-provider-client.js';

const WORKER_CLI_SCHEMA = 'zj-loop.real_agent_dogfood_worker_cli.v1';

export function runRealAgentDogfoodWorkerCli(argv: readonly string[] = process.argv.slice(2), io?: CliIo): Promise<number> {
  const outputIo = io ?? defaultCliIo;
  return runCli({
    name: 'zj-loop-real-agent-dogfood-worker',
    usage: 'zj-loop-real-agent-dogfood worker [options]',
      options: [
        { name: 'command', type: 'positional', description: 'worker' },
        { name: 'provider-id', flag: 'provider-id', type: 'string', description: 'Registered provider id' },
        { name: 'context', flag: 'context', type: 'string', description: 'Persisted worker execution context JSON' },
      ],
    async handler({ options }) {
      if (String(options.command) !== 'worker') throw new Error('unsupported-worker-command');
      if (options['provider-id'] !== 'codex') {
        outputIo.stdout(JSON.stringify({ schema: WORKER_CLI_SCHEMA, status: 'blocked', reason_code: 'provider-not-registered', next_action: 'register-supported-provider' }));
        return 2;
      }
      if (typeof options.context !== 'string' || options.context.trim() === '') {
        outputIo.stdout(JSON.stringify({ schema: WORKER_CLI_SCHEMA, status: 'blocked', reason_code: 'execution-context-required', next_action: 'supply-running-execution-context' }));
        return 2;
      }
      const result = await runWorkerContext(options.context);
      outputIo.stdout(JSON.stringify({ schema: WORKER_CLI_SCHEMA, ...result }));
      return result.status === 'blocked' ? 2 : 0;
    },
  }, argv, io);
}

type WorkerContext = {
  schema: 'zj-loop.real_agent_dogfood_worker_context.v1';
  provider_id: string;
  provider_auth_ref: AdmissionBoundExecution['binding']['provider_auth_ref'];
  adapter_contract_digest: string;
  state_store: string;
  evidence_store: string;
  network_id: string;
  dogfood_id: string;
  execution_id: string;
  worker_id: string;
  lease_id: string;
  binding: RealAgentDogfoodExecutionBinding;
  admission_bound_execution: AdmissionBoundExecution;
  worktree_path: string;
  executable: string;
  goal: string;
  expected_revision: number;
  provider_runtime_ipc?: { socket_path: string; correlation_id?: string; timeout_ms?: number; contract_digest: string };
};

async function runWorkerContext(contextPath: string) {
  const context = JSON.parse(await readFile(contextPath, 'utf8')) as Partial<WorkerContext>;
  if (context.schema !== 'zj-loop.real_agent_dogfood_worker_context.v1') throw new Error('worker-context-schema-invalid');
  const required = ['state_store', 'evidence_store', 'network_id', 'dogfood_id', 'execution_id', 'worker_id', 'lease_id', 'worktree_path', 'executable', 'goal'] as const;
  if (required.some((key) => typeof context[key] !== 'string' || context[key] === '') || typeof context.adapter_contract_digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(context.adapter_contract_digest) || !context.binding || !context.admission_bound_execution || !context.provider_auth_ref || !Number.isInteger(context.expected_revision)) throw new Error('worker-context-invalid');
  if (context.provider_id !== 'codex') throw new Error('provider-not-registered');
  if (JSON.stringify(context.provider_auth_ref) !== JSON.stringify(context.admission_bound_execution.binding.provider_auth_ref)) throw new Error('worker-provider-auth-ref-binding-invalid');
  const authRef = context.provider_auth_ref;
  if (!authRef) throw new Error('worker-provider-auth-ref-required');
  if (!context.provider_runtime_ipc || typeof context.provider_runtime_ipc.socket_path !== 'string' || context.provider_runtime_ipc.socket_path.trim() === '' || typeof context.provider_runtime_ipc.contract_digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(context.provider_runtime_ipc.contract_digest)) throw new Error('worker-provider-runtime-ipc-required');
  const runtimeIpc = context.provider_runtime_ipc;
  if (!runtimeIpc) throw new Error('worker-provider-runtime-ipc-required');
  const runtimeProvider = createProviderRuntimeIpcProvider({ socket_path: runtimeIpc.socket_path, correlation_id: runtimeIpc.correlation_id, timeout_ms: runtimeIpc.timeout_ms, network_id: context.network_id as string, node_id: authRef.node_id, provider_runtime_id: authRef.provider_runtime_id, provider_id: context.provider_id as string, execution_id: context.execution_id as string, attempt: authRef.attempt, auth_ref_digest: authRef.ref_digest, contract_digest: runtimeIpc.contract_digest, adapter_contract_digest: context.adapter_contract_digest as string });
  const provider_cleanup = async () => {
    const handle = runtimeProvider.getLaunchHandle();
    if (!handle) return { status: 'uncertain' as const, reason: 'provider-runtime-launch-handle-missing' };
    return createProviderRuntimeIpcCleanupCoordinator({ socket_path: runtimeIpc.socket_path, correlation_id: runtimeIpc.correlation_id, timeout_ms: runtimeIpc.timeout_ms, handle, network_id: context.network_id as string, node_id: handle.node_id, provider_id: context.provider_id as string, execution_id: context.execution_id as string, attempt: handle.attempt })();
  };
  const stateStore = createSqliteStateStore({ filename: context.state_store as string });
  try {
    const snapshot = await stateStore.readEvents({ network_id: context.network_id as string, aggregate_type: 'real-agent-dogfood', aggregate_id: context.dogfood_id as string });
    const lifecycle = projectRealAgentDogfoodLifecycle(snapshot.events as unknown as RealAgentDogfoodEvent[]);
    if (lifecycle.status !== 'running' || lifecycle.execution_id !== context.execution_id) throw new Error('worker-lifecycle-not-running');
    const leaseSnapshot = await stateStore.readEvents({ network_id: context.network_id as string, aggregate_type: 'real-agent-dogfood-worker', aggregate_id: lifecycle.execution_id });
    const lease = leaseSnapshot.events.at(-1)?.payload as { lease_id?: unknown; worker_id?: unknown; expires_at?: unknown } | undefined;
    if (!lease || lease.lease_id !== context.lease_id || lease.worker_id !== context.worker_id || typeof lease.expires_at !== 'string' || Date.parse(lease.expires_at) <= Date.now()) throw new Error('worker-lease-invalid');
    const evidenceStore = await createContentAddressedEvidenceStore({ root: context.evidence_store as string });
    const provider = runtimeProvider;
    const result = await executeRealAgentDogfoodWorker({ stateStore, evidenceStore, lifecycle, worker_id: context.worker_id as string, lease_id: context.lease_id as string, binding: context.binding, admission_bound_execution: context.admission_bound_execution, worktree_path: context.worktree_path as string, executable: context.executable as string, goal: context.goal as string, provider, provider_cleanup, expected_revision: context.expected_revision as number });
    if (result.status !== 'verification-pending') return result;
    const verifierContextPath = `${contextPath}.verifier.json`;
    await writeFile(verifierContextPath, `${JSON.stringify({ schema: 'zj-loop.real_agent_dogfood_verifier_context.v1', state_store: context.state_store, evidence_store: context.evidence_store, network_id: context.network_id, dogfood_id: context.dogfood_id, execution_id: context.execution_id, attempt: lifecycle.attempt, verifier_id: `verifier-${context.execution_id}`, provider_fact_digest: result.provider_fact_digest, stdout_digest: result.stdout_digest, stderr_digest: result.stderr_digest, expected_revision: result.revision }, null, 2)}\n`, { mode: 0o600 });
    const verifierCli = path.join(path.dirname(fileURLToPath(import.meta.url)), 'real-agent-dogfood-verifier-cli.js');
    const verifierProcess = spawn(process.execPath, [verifierCli, 'verify', '--context', verifierContextPath], { detached: true, stdio: 'ignore', shell: false, windowsHide: true });
    verifierProcess.unref();
    return { ...result, verifier_started: true, verifier_context_path: verifierContextPath };
  } finally {
    await stateStore.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) process.exitCode = await runRealAgentDogfoodWorkerCli();
