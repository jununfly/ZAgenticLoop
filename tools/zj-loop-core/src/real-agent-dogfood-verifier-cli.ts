#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultCliIo, runCli, type CliIo } from './cli.js';
import { createContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
import { projectRealAgentDogfoodLifecycle, type RealAgentDogfoodEvent } from './real-agent-dogfood-lifecycle.js';
import { createSqliteStateStore } from './sqlite-state-store.js';
import { verifyRealAgentDogfoodExecution } from './real-agent-dogfood-verifier.js';

const SCHEMA = 'zj-loop.real_agent_dogfood_verifier_cli.v1';

type VerifierContext = {
  schema: 'zj-loop.real_agent_dogfood_verifier_context.v1';
  state_store: string;
  evidence_store: string;
  network_id: string;
  dogfood_id: string;
  execution_id: string;
  attempt: number;
  verifier_id: string;
  provider_fact_digest: string;
  stdout_digest: string;
  stderr_digest: string;
  expected_revision: number;
};

async function verifyContext(contextPath: string) {
  const context = JSON.parse(await readFile(contextPath, 'utf8')) as Partial<VerifierContext>;
  const required = ['state_store', 'evidence_store', 'network_id', 'dogfood_id', 'execution_id', 'verifier_id', 'provider_fact_digest', 'stdout_digest', 'stderr_digest'] as const;
  if (context.schema !== 'zj-loop.real_agent_dogfood_verifier_context.v1' || required.some((key) => typeof context[key] !== 'string' || context[key] === '') || !Number.isInteger(context.attempt) || !Number.isInteger(context.expected_revision)) throw new Error('verifier-context-invalid');
  const stateStore = createSqliteStateStore({ filename: context.state_store as string });
  try {
    const snapshot = await stateStore.readEvents({ network_id: context.network_id as string, aggregate_type: 'real-agent-dogfood', aggregate_id: context.dogfood_id as string });
    const lifecycle = projectRealAgentDogfoodLifecycle(snapshot.events as unknown as RealAgentDogfoodEvent[]);
    if (lifecycle.execution_id !== context.execution_id || lifecycle.attempt !== context.attempt) throw new Error('verifier-context-binding-invalid');
    const evidenceStore = await createContentAddressedEvidenceStore({ root: context.evidence_store as string });
    return await verifyRealAgentDogfoodExecution({ stateStore, evidenceStore, lifecycle, verifier_id: context.verifier_id as string, provider_fact_digest: context.provider_fact_digest as string, stdout_digest: context.stdout_digest as string, stderr_digest: context.stderr_digest as string, expected_revision: context.expected_revision as number });
  } finally {
    await stateStore.close();
  }
}

export function runRealAgentDogfoodVerifierCli(argv: readonly string[] = process.argv.slice(2), io?: CliIo): Promise<number> {
  const outputIo = io ?? defaultCliIo;
  return runCli({
    name: 'zj-loop-real-agent-dogfood-verifier',
    usage: 'zj-loop-real-agent-dogfood-verifier verify --context <path>',
    options: [
      { name: 'command', type: 'positional', description: 'verify' },
      { name: 'context', flag: 'context', type: 'string', description: 'Persisted verifier context JSON' },
    ],
    async handler({ options }) {
      if (String(options.command) !== 'verify') throw new Error('unsupported-verifier-command');
      if (typeof options.context !== 'string' || options.context.trim() === '') throw new Error('verifier-context-required');
      const result = await verifyContext(options.context);
      outputIo.stdout(JSON.stringify({ schema: SCHEMA, ...result }));
      return result.status === 'review-pending' ? 0 : 2;
    },
  }, argv, io);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) process.exitCode = await runRealAgentDogfoodVerifierCli();
