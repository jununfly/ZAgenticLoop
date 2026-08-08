#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { runCli, type CliSpec } from './cli.js';
import { createContentAddressedEvidenceStore, type ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
import { createOpnArtifactStore, type OpnArtifactMetadata, type OpnArtifactStore } from './opn-artifact-store.js';
import { createTlsOpnArtifactDownloader, createTlsOpnArtifactPublisher } from './opn-artifact-client.js';
import { createTlsTransportAdapter } from './tls-transport-adapter.js';
import { createRealAgentDogfoodGraphOpnIndependentVerificationAdapter } from './real-agent-dogfood-graph-opn-independent-verification-adapter.js';
import { createRealAgentDogfoodGraphScopeObservationAdapter } from './real-agent-dogfood-graph-scope-observation-adapter.js';
import { createRealAgentDogfoodGraphPlan, type RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import { appendRealAgentDogfoodGraphPhaseRecord, projectRealAgentDogfoodGraphPhaseRecord, type RealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
import { createSqliteStateStore, type SqliteStateStore } from './sqlite-state-store.js';
import type { TransportAdapter } from './transport-contract.js';

export const OPN_GRAPH_DOGFOOD_CLI_SCHEMA = 'zj-loop.opn_graph_dogfood_cli.v1' as const;

type RunInput = {
  plan: RealAgentDogfoodGraphPlan;
  network_id: string;
  coordinator_id: string;
  verifier_id: string;
  source_bytes: Buffer;
  state_store: SqliteStateStore;
  artifact_store: OpnArtifactStore;
  evidence_store: ContentAddressedEvidenceStore;
  transport: Pick<TransportAdapter, 'openSession' | 'send' | 'receive' | 'acknowledge' | 'closeSession'>;
  publish_artifact?: (input: { bytes: Buffer; metadata: OpnArtifactMetadata; transfer_id: string; target_node_id: string }) => Promise<void>;
  download_artifact?: Parameters<typeof createRealAgentDogfoodGraphOpnIndependentVerificationAdapter>[0]['download_artifact'];
};

type ScopeInput = {
  plan: RealAgentDogfoodGraphPlan;
  network_id: string;
  coordinator_id: string;
  state_store: SqliteStateStore;
  evidence_store: ContentAddressedEvidenceStore;
  observe?: Parameters<typeof createRealAgentDogfoodGraphScopeObservationAdapter>[0]['observe'];
};

export async function runOpnGraphDogfoodScopeObservation(input: ScopeInput): Promise<Record<string, unknown>> {
  const snapshot = await input.state_store.readEvents({ network_id: input.network_id, aggregate_type: 'real-agent-dogfood-graph', aggregate_id: input.plan.dogfood_id });
  const source = [...snapshot.events].reverse().map((event) => event.payload as RealAgentDogfoodGraphPhaseRecord).find((record) => record.phase === 'source_execution');
  if (!source) return { schema: OPN_GRAPH_DOGFOOD_CLI_SCHEMA, status: 'blocked', reason: 'opn-graph-dogfood-source-phase-required', side_effects_executed: false };
  const result = await createRealAgentDogfoodGraphScopeObservationAdapter({ plan: input.plan, network_id: input.network_id, coordinator_id: input.coordinator_id, evidence_store: input.evidence_store, source_phase: source, observe: input.observe })();
  if (!result.record) return { schema: OPN_GRAPH_DOGFOOD_CLI_SCHEMA, status: result.status, ...(result.reason ? { reason: result.reason } : {}), side_effects_executed: false };
  const appended = await appendRealAgentDogfoodGraphPhaseRecord({ stateStore: input.state_store, plan: input.plan, network_id: input.network_id, record: result.record, expected_revision: await input.state_store.getRevision(input.network_id) });
  if (appended.status === 'conflict' || appended.revision === undefined) return { schema: OPN_GRAPH_DOGFOOD_CLI_SCHEMA, status: 'outcome-uncertain', reason: 'opn-graph-dogfood-scope-phase-append-conflict', phase_status: result.status, side_effects_executed: false };
  return { schema: OPN_GRAPH_DOGFOOD_CLI_SCHEMA, status: result.status, phase: result.record.phase, phase_status: result.record.status, evidence_digest: result.evidence_digest, state_revision: appended.revision, side_effects_executed: false };
}

export async function runOpnGraphDogfoodVerification(input: RunInput): Promise<Record<string, unknown>> {
  const snapshot = await input.state_store.readEvents({ network_id: input.network_id, aggregate_type: 'real-agent-dogfood-graph', aggregate_id: input.plan.dogfood_id });
  const current = projectRealAgentDogfoodGraphPhaseRecord({ plan: input.plan, events: snapshot.events });
  if (!current || current.phase !== 'scope_observation' || current.status !== 'passed' || !current.completed_phases.includes('scope_observation')) return { schema: OPN_GRAPH_DOGFOOD_CLI_SCHEMA, status: 'blocked', reason: 'opn-graph-dogfood-scope-phase-required', side_effects_executed: false };
  const result = await createRealAgentDogfoodGraphOpnIndependentVerificationAdapter({ plan: input.plan, network_id: input.network_id, coordinator_id: input.coordinator_id, verifier_id: input.verifier_id, transport: input.transport, artifact_store: input.artifact_store, evidence_store: input.evidence_store, source_phase: snapshot.events.map((event) => event.payload as RealAgentDogfoodGraphPhaseRecord).find((record) => record.phase === 'source_execution' && record.status === 'passed') as RealAgentDogfoodGraphPhaseRecord, scope_phase: current, source_evidence: async () => input.source_bytes, publish_artifact: input.publish_artifact, download_artifact: input.download_artifact })();
  if (!result.record) return { schema: OPN_GRAPH_DOGFOOD_CLI_SCHEMA, status: result.status, ...(result.reason ? { reason: result.reason } : {}), side_effects_executed: false };
  const appended = await appendRealAgentDogfoodGraphPhaseRecord({ stateStore: input.state_store, plan: input.plan, network_id: input.network_id, record: result.record, expected_revision: await input.state_store.getRevision(input.network_id) });
  if (appended.status === 'conflict' || appended.revision === undefined) return { schema: OPN_GRAPH_DOGFOOD_CLI_SCHEMA, status: 'outcome-uncertain', reason: 'opn-graph-dogfood-phase-append-conflict', phase_status: result.status, side_effects_executed: false };
  return { schema: OPN_GRAPH_DOGFOOD_CLI_SCHEMA, status: result.status, phase: result.record.phase, phase_status: result.record.status, evidence_digest: result.evidence_digest, state_revision: appended.revision, side_effects_executed: false };
}

const spec: CliSpec = {
  name: 'zj-loop-opn-graph-dogfood',
  description: 'Run the phase-native OPN independent-verification slice for a real Graph dogfood.',
  usage: 'zj-loop-opn-graph-dogfood run ...',
  options: [
    { name: 'command', type: 'positional', description: 'run or observe-scope' },
    { name: 'endpoint', type: 'string', description: 'OPN HTTPS endpoint' },
    { name: 'network_id', flag: 'network-id', type: 'string', description: 'OPN network id' },
    { name: 'coordinator_id', flag: 'coordinator-id', type: 'string', description: 'Mac Coordinator node id' },
    { name: 'verifier_id', flag: 'verifier-id', type: 'string', description: 'Windows verifier node id' },
    { name: 'ca', type: 'string', description: 'CA PEM path' },
    { name: 'cert', type: 'string', description: 'Coordinator client certificate PEM path' },
    { name: 'key', type: 'string', description: 'Coordinator private key PEM path' },
    { name: 'credential_token_file', flag: 'credential-token-file', type: 'string', description: 'Claimed credential token path' },
    { name: 'graph_plan', flag: 'graph-plan', type: 'string', description: 'Real Graph plan JSON path' },
    { name: 'source_evidence', flag: 'source-evidence', type: 'string', description: 'Bound OPN source evidence JSON path' },
    { name: 'state_store', flag: 'state-store', type: 'string', description: 'Coordinator SQLite StateStore path' },
    { name: 'artifact_store', flag: 'artifact-store', type: 'string', description: 'Local OPN artifact store directory' },
    { name: 'evidence_store', flag: 'evidence-store', type: 'string', description: 'Coordinator EvidenceStore directory' },
  ],
  async handler({ options, io }) {
    const command = String(options.command ?? '');
    if (command !== 'run' && command !== 'observe-scope') throw new Error('opn-graph-dogfood-command-invalid');
    const value = (name: string, error: string): string => { const result = String(options[name] ?? '').trim(); if (!result) throw new Error(error); return result; };
    const plan = createRealAgentDogfoodGraphPlan(JSON.parse(await readFile(value('graph_plan', 'opn-graph-dogfood-graph-plan-required'), 'utf8')) as RealAgentDogfoodGraphPlan);
    const network_id = value('network_id', 'opn-graph-dogfood-network-id-required');
    const stateStore = createSqliteStateStore({ filename: value('state_store', 'opn-graph-dogfood-state-store-required') });
    const evidenceStore = await createContentAddressedEvidenceStore({ root: value('evidence_store', 'opn-graph-dogfood-evidence-store-required') });
    if (command === 'observe-scope') {
      try {
        const output = await runOpnGraphDogfoodScopeObservation({ plan, network_id, coordinator_id: value('coordinator_id', 'opn-graph-dogfood-coordinator-id-required'), state_store: stateStore, evidence_store: evidenceStore });
        io.stdout(JSON.stringify(output));
      } finally { await stateStore.close(); }
      return;
    }
    const artifactStore = createOpnArtifactStore({ root: value('artifact_store', 'opn-graph-dogfood-artifact-store-required') });
    const ca = await readFile(value('ca', 'opn-graph-dogfood-ca-required'), 'utf8');
    const cert = await readFile(value('cert', 'opn-graph-dogfood-cert-required'), 'utf8');
    const key = await readFile(value('key', 'opn-graph-dogfood-key-required'), 'utf8');
    const bearer_token = (await readFile(value('credential_token_file', 'opn-graph-dogfood-token-required'), 'utf8')).trim();
    const transport = createTlsTransportAdapter({ endpoint: value('endpoint', 'opn-graph-dogfood-endpoint-required'), ca, cert, key, bearer_token });
    const publisher = createTlsOpnArtifactPublisher({ endpoint: value('endpoint', 'opn-graph-dogfood-endpoint-required'), ca, cert, key, bearer_token });
    const downloader = createTlsOpnArtifactDownloader({ endpoint: value('endpoint', 'opn-graph-dogfood-endpoint-required'), ca, cert, key, bearer_token });
    try {
      const output = await runOpnGraphDogfoodVerification({ plan, network_id, coordinator_id: value('coordinator_id', 'opn-graph-dogfood-coordinator-id-required'), verifier_id: value('verifier_id', 'opn-graph-dogfood-verifier-id-required'), source_bytes: await readFile(value('source_evidence', 'opn-graph-dogfood-source-evidence-required')), state_store: stateStore, artifact_store: artifactStore, evidence_store: evidenceStore, transport, publish_artifact: publisher.publish, download_artifact: downloader.download });
      io.stdout(JSON.stringify(output));
    } finally { await stateStore.close(); }
  },
};

export async function runOpnGraphDogfoodCli(argv: readonly string[] = process.argv.slice(2)): Promise<number> { return runCli(spec, argv); }
if (process.argv[1]?.endsWith('opn-graph-dogfood-cli.js')) process.exitCode = await runOpnGraphDogfoodCli();
