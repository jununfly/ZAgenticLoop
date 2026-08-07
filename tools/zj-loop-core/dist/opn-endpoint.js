import { readFile } from 'node:fs/promises';
import { createPairingHttpServer } from './pairing-http-server.js';
import { createSqlitePairingRecordStore } from './sqlite-pairing-record-store.js';
import { projectPairingRequests } from './pairing-projection.js';
import { createOpnConnectionReadModel } from './opn-connection-read-model.js';
import { createOpnTransportHttpService } from './opn-transport-http-server.js';
import { createLocalOpnTransportAdapter } from './opn-center-transport.js';
import { projectOpnInbox } from './opn-transport-inbox.js';
export const OPN_ENDPOINT_SCHEMA = 'zj-loop.opn_endpoint.v1';
function requireText(value, error) {
    if (typeof value !== 'string' || !value.trim())
        throw new Error(error);
    return value;
}
export async function createOpnEndpointServer(input) {
    requireText(input.bind, 'opn-endpoint-bind-required');
    requireText(input.network_id, 'opn-endpoint-network-id-required');
    if (!Number.isInteger(input.port) || input.port < 0 || input.port > 65535)
        throw new Error('opn-endpoint-port-invalid');
    if (!input.stateStore)
        throw new Error('opn-endpoint-state-store-required');
    if (!input.tls.key || !input.tls.cert || !input.tls.ca)
        throw new Error('opn-endpoint-tls-material-required');
    await input.stateStore.getRevision(input.network_id);
    const recordStore = createSqlitePairingRecordStore({ stateStore: input.stateStore });
    const localNodeId = input.local_node?.node_id ?? `endpoint:${input.network_id}`;
    const connectionReadModel = input.connectionReadModel ?? {
        async read() {
            const records = await recordStore.list(input.network_id);
            const projections = projectPairingRequests({ network_id: input.network_id, records });
            return createOpnConnectionReadModel({
                network_id: input.network_id,
                local_node: input.local_node ?? { node_id: `endpoint:${input.network_id}`, display_name: 'OPN Endpoint', agent_kind: 'endpoint', agent_version: 'dev' },
                peers: projections.map((projection) => {
                    const base = records.find((record) => record.type === 'pairing-requested' && record.request.request_id === projection.request_id);
                    return { ...projection, endpoint: base?.type === 'pairing-requested' ? base.request.endpoint : undefined };
                }),
            });
        },
    };
    const server = createPairingHttpServer({
        tls: input.tls,
        recordStore,
        ownerAuthenticator: input.ownerAuthenticator,
        credentialClaim: input.credentialClaim,
        credentialIssue: input.credentialIssue,
        connectionReadModel,
        inboxReadModel: {
            async read({ network_id }) {
                return projectOpnInbox({ stateStore: input.stateStore, network_id, node_id: localNodeId });
            },
        },
        transport: input.transport ?? (input.credentialVerifier ? createOpnTransportHttpService({ network_id: input.network_id, stateStore: input.stateStore, credentialVerifier: input.credentialVerifier }) : null),
        readinessCheck: {
            check: async () => {
                try {
                    await input.stateStore.getRevision(input.network_id);
                    return { status: 'ready' };
                }
                catch {
                    return { status: 'not-ready', reason: 'state-store-unavailable' };
                }
            },
        },
    });
    const localTransport = createLocalOpnTransportAdapter({ stateStore: input.stateStore, network_id: input.network_id, node_id: localNodeId });
    await new Promise((resolve, reject) => {
        const onError = (error) => {
            server.off('listening', onListening);
            reject(error);
        };
        const onListening = () => {
            server.off('error', onError);
            resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(input.port, input.bind);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
        await new Promise((resolve) => server.close(() => resolve()));
        throw new Error('opn-endpoint-address-unavailable');
    }
    return {
        address,
        localTransport,
        close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    };
}
export async function loadOpnEndpointTls(input) {
    requireText(input.key_path, 'opn-endpoint-key-path-required');
    requireText(input.cert_path, 'opn-endpoint-cert-path-required');
    requireText(input.ca_path, 'opn-endpoint-ca-path-required');
    return { key: await readFile(input.key_path), cert: await readFile(input.cert_path), ca: await readFile(input.ca_path) };
}
