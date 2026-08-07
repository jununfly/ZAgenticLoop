#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { runCli } from './cli.js';
import { createCodexAgentProviderAdapter } from './codex-agent-provider-adapter.js';
import { createWorkBuddyCodeProviderAdapter } from './workbuddy-code-provider-adapter.js';
import { createLocalProcessAdapter } from './local-process-adapter.js';
import { discoverProviderExecutable } from './provider-executable-discovery.js';
import { createTlsTransportAdapter } from './tls-transport-adapter.js';
import { createTlsOpnArtifactDownloader, createTlsOpnArtifactPublisher } from './opn-artifact-client.js';
import { createOpnArtifactStore } from './opn-artifact-store.js';
import { processOpnReadOnlyGraphVerificationRequest } from './opn-readonly-graph-verifier.js';
const spec = {
    name: 'zj-loop-opn-graph-verifier',
    description: 'Consume one OPN read-only Graph verification request and return a provider-neutral result.',
    usage: 'zj-loop-opn-graph-verifier run ...',
    options: [
        { name: 'command', type: 'positional', description: 'run' },
        { name: 'endpoint', type: 'string', description: 'OPN HTTPS endpoint' },
        { name: 'network_id', flag: 'network-id', type: 'string', description: 'OPN network id' },
        { name: 'node_id', flag: 'node-id', type: 'string', description: 'Agent2 node id' },
        { name: 'ca', type: 'string', description: 'CA PEM path' },
        { name: 'cert', type: 'string', description: 'Agent certificate PEM path' },
        { name: 'key', type: 'string', description: 'Agent private key PEM path' },
        { name: 'credential_token_file', flag: 'credential-token-file', type: 'string', description: 'Claimed credential token path' },
        { name: 'artifact_store', flag: 'artifact-store', type: 'string', description: 'Local ArtifactStore directory' },
        { name: 'provider', type: 'string', description: 'codex or workbuddy-code' },
        { name: 'executable', type: 'string', description: 'Optional provider executable path' },
        { name: 'cwd', type: 'string', description: 'Provider working directory' },
        { name: 'session_id', flag: 'session-id', type: 'string', description: 'WorkBuddy session id' },
    ],
    async handler({ options, io }) {
        if (String(options.command ?? '') !== 'run')
            throw new Error('opn-graph-verifier-command-invalid');
        const value = (name, error) => { const result = String(options[name] ?? '').trim(); if (!result)
            throw new Error(error); return result; };
        const endpoint = value('endpoint', 'opn-graph-verifier-endpoint-required');
        const network_id = value('network_id', 'opn-graph-verifier-network-id-required');
        const node_id = value('node_id', 'opn-graph-verifier-node-id-required');
        const artifact_root = value('artifact_store', 'opn-graph-verifier-artifact-store-required');
        const providerKind = value('provider', 'opn-graph-verifier-provider-required');
        if (providerKind !== 'codex' && providerKind !== 'workbuddy-code')
            throw new Error('opn-graph-verifier-provider-invalid');
        const ca = await readFile(value('ca', 'opn-graph-verifier-ca-required'), 'utf8');
        const cert = await readFile(value('cert', 'opn-graph-verifier-cert-required'), 'utf8');
        const key = await readFile(value('key', 'opn-graph-verifier-key-required'), 'utf8');
        const bearer_token = (await readFile(value('credential_token_file', 'opn-graph-verifier-token-required'), 'utf8')).trim();
        const processAdapter = createLocalProcessAdapter();
        const discovery = await discoverProviderExecutable({ provider: providerKind, explicit: String(options.executable ?? '') });
        if (discovery.status !== 'found' || !discovery.executable)
            throw new Error(`opn-graph-verifier-provider-unavailable:${JSON.stringify(discovery)}`);
        const provider = providerKind === 'codex'
            ? createCodexAgentProviderAdapter({ process_adapter: processAdapter, executable: discovery.executable })
            : createWorkBuddyCodeProviderAdapter({ process_adapter: processAdapter, executable: discovery.executable, session_id: value('session_id', 'opn-graph-verifier-session-id-required') });
        const transport = createTlsTransportAdapter({ endpoint, ca, cert, key, bearer_token });
        const publisher = createTlsOpnArtifactPublisher({ endpoint, ca, cert, key, bearer_token });
        const downloader = createTlsOpnArtifactDownloader({ endpoint, ca, cert, key, bearer_token });
        const session = await transport.openSession({ network_id, node_id });
        try {
            const envelope = await transport.receive({ session_id: session.session_id });
            if (!envelope) {
                io.stdout(JSON.stringify({ schema: 'zj-loop.opn_graph_verifier.v1', status: 'empty', side_effects_executed: false }));
                return;
            }
            const result = await processOpnReadOnlyGraphVerificationRequest({
                envelope, verifier_node_id: node_id, cwd: value('cwd', 'opn-graph-verifier-cwd-required'), session_id: session.session_id,
                artifact_store: createOpnArtifactStore({ root: artifact_root }), downloadArtifact: downloader.download, publishArtifact: publisher.publish,
                provider: { run: (request) => provider.run(request) }, transport,
            });
            io.stdout(JSON.stringify({ schema: 'zj-loop.opn_graph_verifier.v1', ...result }));
        }
        finally {
            await transport.closeSession({ session_id: session.session_id });
        }
    },
};
if (process.argv[1]?.endsWith('opn-graph-verifier-cli.js'))
    process.exitCode = await runCli(spec);
