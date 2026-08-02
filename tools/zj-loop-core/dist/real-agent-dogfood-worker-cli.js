#!/usr/bin/env node
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defaultCliIo, runCli } from './cli.js';
import { readFile, writeFile } from 'node:fs/promises';
import { createSqliteStateStore } from './sqlite-state-store.js';
import { createContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
import { projectRealAgentDogfoodLifecycle } from './real-agent-dogfood-lifecycle.js';
import { createLocalProcessAdapter } from './local-process-adapter.js';
import { createRealAgentDogfoodProvider } from './real-agent-dogfood-provider-registry.js';
import { executeRealAgentDogfoodWorker } from './real-agent-dogfood-worker-runner.js';
const WORKER_CLI_SCHEMA = 'zj-loop.real_agent_dogfood_worker_cli.v1';
export function runRealAgentDogfoodWorkerCli(argv = process.argv.slice(2), io) {
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
            if (String(options.command) !== 'worker')
                throw new Error('unsupported-worker-command');
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
async function runWorkerContext(contextPath) {
    const context = JSON.parse(await readFile(contextPath, 'utf8'));
    if (context.schema !== 'zj-loop.real_agent_dogfood_worker_context.v1')
        throw new Error('worker-context-schema-invalid');
    const required = ['state_store', 'evidence_store', 'network_id', 'dogfood_id', 'execution_id', 'worker_id', 'lease_id', 'worktree_path', 'executable', 'goal'];
    if (required.some((key) => typeof context[key] !== 'string' || context[key] === '') || !context.binding || !context.admission_bound_execution || !Number.isInteger(context.expected_revision))
        throw new Error('worker-context-invalid');
    if (context.provider_id !== 'codex')
        throw new Error('provider-not-registered');
    const stateStore = createSqliteStateStore({ filename: context.state_store });
    try {
        const snapshot = await stateStore.readEvents({ network_id: context.network_id, aggregate_type: 'real-agent-dogfood', aggregate_id: context.dogfood_id });
        const lifecycle = projectRealAgentDogfoodLifecycle(snapshot.events);
        if (lifecycle.status !== 'running' || lifecycle.execution_id !== context.execution_id)
            throw new Error('worker-lifecycle-not-running');
        const leaseSnapshot = await stateStore.readEvents({ network_id: context.network_id, aggregate_type: 'real-agent-dogfood-worker', aggregate_id: lifecycle.execution_id });
        const lease = leaseSnapshot.events.at(-1)?.payload;
        if (!lease || lease.lease_id !== context.lease_id || lease.worker_id !== context.worker_id || typeof lease.expires_at !== 'string' || Date.parse(lease.expires_at) <= Date.now())
            throw new Error('worker-lease-invalid');
        const evidenceStore = await createContentAddressedEvidenceStore({ root: context.evidence_store });
        const provider = createRealAgentDogfoodProvider({ provider_id: context.provider_id, executable: context.executable, process_adapter: createLocalProcessAdapter() });
        const result = await executeRealAgentDogfoodWorker({ stateStore, evidenceStore, lifecycle, worker_id: context.worker_id, lease_id: context.lease_id, binding: context.binding, admission_bound_execution: context.admission_bound_execution, worktree_path: context.worktree_path, executable: context.executable, goal: context.goal, provider, post_run_proof_factory: provider.post_run_proof_factory, expected_revision: context.expected_revision });
        if (result.status !== 'verification-pending')
            return result;
        const verifierContextPath = `${contextPath}.verifier.json`;
        await writeFile(verifierContextPath, `${JSON.stringify({ schema: 'zj-loop.real_agent_dogfood_verifier_context.v1', state_store: context.state_store, evidence_store: context.evidence_store, network_id: context.network_id, dogfood_id: context.dogfood_id, execution_id: context.execution_id, attempt: lifecycle.attempt, verifier_id: `verifier-${context.execution_id}`, provider_fact_digest: result.provider_fact_digest, stdout_digest: result.stdout_digest, stderr_digest: result.stderr_digest, expected_revision: result.revision }, null, 2)}\n`, { mode: 0o600 });
        const verifierCli = path.join(path.dirname(fileURLToPath(import.meta.url)), 'real-agent-dogfood-verifier-cli.js');
        const verifierProcess = spawn(process.execPath, [verifierCli, 'verify', '--context', verifierContextPath], { detached: true, stdio: 'ignore', shell: false, windowsHide: true });
        verifierProcess.unref();
        return { ...result, verifier_started: true, verifier_context_path: verifierContextPath };
    }
    finally {
        await stateStore.close();
    }
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)))
    process.exitCode = await runRealAgentDogfoodWorkerCli();
