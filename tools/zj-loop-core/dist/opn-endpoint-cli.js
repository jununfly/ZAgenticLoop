#!/usr/bin/env node
import { runCli } from './cli.js';
import { createOpnEndpointServer, loadOpnEndpointTls } from './opn-endpoint.js';
import { createPairingOwnerAuthenticator, loadPairingOwnerIdentity } from './pairing-owner-authenticator.js';
import { createSqliteStateStore } from './sqlite-state-store.js';
import { createSqliteCredentialIssuance } from './sqlite-credential-issuance.js';
const spec = {
    name: 'zj-loop-opn-endpoint',
    description: 'Start the OPN pairing endpoint.',
    usage: 'zj-loop-opn-endpoint --bind <address> --port <port> --network-id <id> --state-store <path> --server-key <path> --server-cert <path> --client-ca <path>',
    options: [
        { name: 'bind', type: 'string', description: 'Address to listen on', valueName: 'ADDRESS' },
        { name: 'port', type: 'string', description: 'TCP port to listen on', valueName: 'PORT' },
        { name: 'network_id', flag: 'network-id', type: 'string', description: 'Existing OPN network id', valueName: 'ID' },
        { name: 'state_store', flag: 'state-store', type: 'string', description: 'SQLite StateStore path', valueName: 'PATH' },
        { name: 'server_key', flag: 'server-key', type: 'string', description: 'Server private key PEM path', valueName: 'PATH' },
        { name: 'server_cert', flag: 'server-cert', type: 'string', description: 'Server certificate PEM path', valueName: 'PATH' },
        { name: 'client_ca', flag: 'client-ca', type: 'string', description: 'Client CA certificate PEM path', valueName: 'PATH' },
        { name: 'owner_human_id', flag: 'owner-human-id', type: 'string', description: 'Development Human owner id' },
        { name: 'owner_public_key', flag: 'owner-public-key', type: 'string', description: 'Development Human authority public key PEM path', valueName: 'PATH' },
        { name: 'owner_token', flag: 'owner-token', type: 'string', description: 'Development owner authorization token' },
    ],
    async handler({ options, io }) {
        const bind = String(options.bind ?? '');
        const port = Number(options.port ?? '');
        const network_id = String(options.network_id ?? '');
        const tls = await loadOpnEndpointTls({ key_path: String(options.server_key ?? ''), cert_path: String(options.server_cert ?? ''), ca_path: String(options.client_ca ?? '') });
        const stateStore = createSqliteStateStore({ filename: String(options.state_store ?? '') });
        const issuance = createSqliteCredentialIssuance({ filename: String(options.state_store ?? ''), stateStore });
        const ownerValues = [options.owner_human_id, options.owner_public_key, options.owner_token].filter((value) => value !== undefined);
        if (ownerValues.length !== 0 && ownerValues.length !== 3)
            throw new Error('opn-endpoint-owner-config-incomplete');
        const ownerAuthenticator = ownerValues.length === 3
            ? createPairingOwnerAuthenticator({ identity: await loadPairingOwnerIdentity({ human_id: String(options.owner_human_id), public_key_path: String(options.owner_public_key) }), owner_token: String(options.owner_token) })
            : undefined;
        let endpoint;
        try {
            endpoint = await createOpnEndpointServer({ bind, port, network_id, stateStore, tls, ownerAuthenticator, credentialVerifier: { verify: (input) => issuance.verifyCredential({ token: input.token, node_id: input.node_id, network_id: input.network_id ?? network_id, required_capabilities: input.required_capabilities }) }, credentialClaim: { claim: (input) => issuance.claimForPairingSession(input) }, credentialIssue: { issue: async (input) => { const result = await issuance.issuePairingIntent({ ...input, expected_revision: await stateStore.getRevision(input.network_id) }); return { status: result.status, credential_id: result.credential_id }; } } });
        }
        catch (error) {
            await issuance.close();
            await stateStore.close();
            throw error;
        }
        io.stdout(JSON.stringify({ schema: 'zj-loop.opn_endpoint.v1', status: 'listening', bind: endpoint.address.address, port: endpoint.address.port, network_id, side_effects_executed: false }));
        const shutdown = async () => { await endpoint.close(); await issuance.close(); await stateStore.close(); process.exit(0); };
        process.once('SIGINT', shutdown);
        process.once('SIGTERM', shutdown);
        await new Promise(() => { });
    },
};
process.exitCode = await runCli(spec);
