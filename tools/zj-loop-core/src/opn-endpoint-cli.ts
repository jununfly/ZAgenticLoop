#!/usr/bin/env node
import { runCli, type CliSpec } from './cli.js';
import { createOpnEndpointServer, loadOpnEndpointTls } from './opn-endpoint.js';
import { createSqliteStateStore } from './sqlite-state-store.js';

const spec: CliSpec = {
  name: 'zj-loop-opn-endpoint',
  description: 'Start the OPN pairing endpoint.',
  usage: 'zj-loop-opn-endpoint --bind <address> --port <port> --network-id <id> --state-store <path> --server-key <path> --server-cert <path> --client-ca <path>',
  options: [
    { name: 'bind', type: 'string' as const, description: 'Address to listen on', valueName: 'ADDRESS' },
    { name: 'port', type: 'string' as const, description: 'TCP port to listen on', valueName: 'PORT' },
    { name: 'network_id', flag: 'network-id', type: 'string' as const, description: 'Existing OPN network id', valueName: 'ID' },
    { name: 'state_store', flag: 'state-store', type: 'string' as const, description: 'SQLite StateStore path', valueName: 'PATH' },
    { name: 'server_key', flag: 'server-key', type: 'string' as const, description: 'Server private key PEM path', valueName: 'PATH' },
    { name: 'server_cert', flag: 'server-cert', type: 'string' as const, description: 'Server certificate PEM path', valueName: 'PATH' },
    { name: 'client_ca', flag: 'client-ca', type: 'string' as const, description: 'Client CA certificate PEM path', valueName: 'PATH' },
  ],
  async handler({ options, io }) {
    const bind = String(options.bind ?? '');
    const port = Number(options.port ?? '');
    const network_id = String(options.network_id ?? '');
    const tls = await loadOpnEndpointTls({ key_path: String(options.server_key ?? ''), cert_path: String(options.server_cert ?? ''), ca_path: String(options.client_ca ?? '') });
    const stateStore = createSqliteStateStore({ filename: String(options.state_store ?? '') });
    let endpoint;
    try {
      endpoint = await createOpnEndpointServer({ bind, port, network_id, stateStore, tls });
    } catch (error) {
      await stateStore.close();
      throw error;
    }
    io.stdout(JSON.stringify({ schema: 'zj-loop.opn_endpoint.v1', status: 'listening', bind: endpoint.address.address, port: endpoint.address.port, network_id, side_effects_executed: false }));
    const shutdown = async () => { await endpoint.close(); await stateStore.close(); process.exit(0); };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    await new Promise<void>(() => {});
  },
};

process.exitCode = await runCli(spec);
