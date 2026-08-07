#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { runCli, type CliSpec } from './cli.js';
import { createTlsTransportAdapter } from './tls-transport-adapter.js';
import { createTlsOpnArtifactDownloader } from './opn-artifact-client.js';
import { createOpnArtifactStore } from './opn-artifact-store.js';
import { createSqliteStateStore } from './sqlite-state-store.js';
import { receiveOpnReadOnlyGraphVerificationResult } from './opn-readonly-graph-coordinator.js';

const spec: CliSpec = {
  name: 'zj-loop-opn-graph-coordinator',
  description: 'Receive and persist one OPN read-only Graph verification result on the Coordinator.',
  usage: 'zj-loop-opn-graph-coordinator receive ...',
  options: [
    { name: 'command', type: 'positional', description: 'receive' },
    { name: 'endpoint', type: 'string', description: 'OPN HTTPS endpoint' },
    { name: 'network_id', flag: 'network-id', type: 'string', description: 'OPN network id' },
    { name: 'node_id', flag: 'node-id', type: 'string', description: 'Coordinator node id' },
    { name: 'ca', type: 'string', description: 'CA PEM path' },
    { name: 'cert', type: 'string', description: 'Coordinator certificate PEM path' },
    { name: 'key', type: 'string', description: 'Coordinator private key PEM path' },
    { name: 'credential_token_file', flag: 'credential-token-file', type: 'string', description: 'Claimed credential token path' },
    { name: 'state_store', flag: 'state-store', type: 'string', description: 'Coordinator SQLite StateStore path' },
    { name: 'artifact_store', flag: 'artifact-store', type: 'string', description: 'Local ArtifactStore directory' },
    { name: 'plan_file', flag: 'plan-file', type: 'string', description: 'Graph Atom plan JSON path' },
  ],
  async handler({ options, io }) {
    if (String(options.command ?? '') !== 'receive') throw new Error('opn-graph-coordinator-command-invalid');
    const value = (name: string, error: string): string => { const result = String(options[name] ?? '').trim(); if (!result) throw new Error(error); return result; };
    const network_id = value('network_id', 'opn-graph-coordinator-network-id-required');
    const node_id = value('node_id', 'opn-graph-coordinator-node-id-required');
    const endpoint = value('endpoint', 'opn-graph-coordinator-endpoint-required');
    const ca = await readFile(value('ca', 'opn-graph-coordinator-ca-required'), 'utf8');
    const cert = await readFile(value('cert', 'opn-graph-coordinator-cert-required'), 'utf8');
    const key = await readFile(value('key', 'opn-graph-coordinator-key-required'), 'utf8');
    const bearer_token = (await readFile(value('credential_token_file', 'opn-graph-coordinator-token-required'), 'utf8')).trim();
    const plan = JSON.parse(await readFile(value('plan_file', 'opn-graph-coordinator-plan-required'), 'utf8')) as Record<string, unknown>;
    const stateStore = createSqliteStateStore({ filename: value('state_store', 'opn-graph-coordinator-state-store-required') });
    try {
      await stateStore.createNetwork({ network_id, owner_id: typeof plan.human_id === 'string' ? plan.human_id : 'human-1' });
      const transport = createTlsTransportAdapter({ endpoint, ca, cert, key, bearer_token });
      const downloader = createTlsOpnArtifactDownloader({ endpoint, ca, cert, key, bearer_token });
      const artifactStore = createOpnArtifactStore({ root: value('artifact_store', 'opn-graph-coordinator-artifact-store-required') });
      const session = await transport.openSession({ network_id, node_id });
      try {
        const result = await receiveOpnReadOnlyGraphVerificationResult({
          transport, session_id: session.session_id, coordinator_id: node_id,
          expected: { graph_id: String(plan.graph_id), network_id, plan_id: String(plan.plan_id), plan_revision: Number(plan.plan_revision), task_id: String(plan.task_id), plan_digest: String(plan.plan_digest), source_evidence_ref: String(plan.source_evidence_ref), verifier_node_id: String(plan.verifier_node_id) },
          state_store: stateStore, artifact_store: artifactStore, downloadArtifact: downloader.download,
        });
        io.stdout(JSON.stringify({ schema: 'zj-loop.opn_graph_coordinator.v1', ...result }));
      } finally { await transport.closeSession({ session_id: session.session_id }); }
    } finally { await stateStore.close(); }
  },
};

if (process.argv[1]?.endsWith('opn-graph-coordinator-cli.js')) process.exitCode = await runCli(spec);
