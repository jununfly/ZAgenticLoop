import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import type { ServerOptions } from 'node:https';
import { createPairingHttpServer } from './pairing-http-server.js';
import type { CredentialClaimService, CredentialIssueService, PairingConnectionReadModelService, PairingOwnerAuthenticator } from './pairing-http-server.js';
import { createSqlitePairingRecordStore } from './sqlite-pairing-record-store.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
import { projectPairingRequests } from './pairing-projection.js';
import { createOpnConnectionReadModel } from './opn-connection-read-model.js';
import { createOpnTransportHttpService } from './opn-transport-http-server.js';
import type { CredentialVerifier } from './sqlite-state-store-server.js';
import type { OpnTransportHttpService } from './opn-transport-http-server.js';
import { createLocalOpnTransportAdapter } from './opn-center-transport.js';
import type { TransportAdapter } from './transport-contract.js';
import { projectOpnInbox } from './opn-transport-inbox.js';
import { createOpnArtifactStore } from './opn-artifact-store.js';
import { createOpnArtifactTransferHttpService } from './opn-artifact-transfer-http-server.js';
import { projectOpnHumanActions } from './human-action-opn-projection.js';
import { createTransportEnvelope } from './transport-contract.js';

export const OPN_ENDPOINT_SCHEMA = 'zj-loop.opn_endpoint.v1' as const;

export type OpnEndpoint = {
  address: AddressInfo;
  localTransport: TransportAdapter;
  close(): Promise<void>;
};

function requireText(value: string, error: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(error);
  return value;
}

export async function createOpnEndpointServer(input: {
  bind: string;
  port: number;
  network_id: string;
  stateStore: SqliteStateStore;
  tls: Pick<ServerOptions, 'key' | 'cert' | 'ca'>;
  ownerAuthenticator?: PairingOwnerAuthenticator | null;
  credentialClaim?: CredentialClaimService | null;
  credentialIssue?: CredentialIssueService | null;
  connectionReadModel?: PairingConnectionReadModelService | null;
  local_node?: { node_id: string; display_name: string; agent_kind: string; agent_version: string };
  credentialVerifier?: CredentialVerifier | null;
  transport?: OpnTransportHttpService | null;
  artifact_store?: import('./opn-artifact-store.js').OpnArtifactStore | null;
}): Promise<OpnEndpoint> {
  requireText(input.bind, 'opn-endpoint-bind-required');
  requireText(input.network_id, 'opn-endpoint-network-id-required');
  if (!Number.isInteger(input.port) || input.port < 0 || input.port > 65535) throw new Error('opn-endpoint-port-invalid');
  if (!input.stateStore) throw new Error('opn-endpoint-state-store-required');
  if (!input.tls.key || !input.tls.cert || !input.tls.ca) throw new Error('opn-endpoint-tls-material-required');

  await input.stateStore.getRevision(input.network_id);
  const recordStore = createSqlitePairingRecordStore({ stateStore: input.stateStore });
  const localNodeId = input.local_node?.node_id ?? `endpoint:${input.network_id}`;
  const localTransport = createLocalOpnTransportAdapter({ stateStore: input.stateStore, network_id: input.network_id, node_id: localNodeId });
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
    humanActionReadModel: input.artifact_store ? {
      async read({ network_id, node_id }) {
        return projectOpnHumanActions({ stateStore: input.stateStore, artifactStore: input.artifact_store!, network_id, node_id });
      },
    } : null,
    humanActionCommand: input.artifact_store ? {
      async decide({ network_id, request, decision }) {
        const targetNodeId = request.target_node_id;
        if (!targetNodeId?.trim() || targetNodeId === localNodeId) throw new Error('human-action-target-node-invalid');
        const bytes = Buffer.from(JSON.stringify(decision));
        const artifact = await input.artifact_store!.put({ bytes, file_name: `${decision.request_id}.decision.json`, media_type: 'application/json' });
        const taskId = typeof request.context.task_id === 'string' ? request.context.task_id : request.request_id;
        const envelope = createTransportEnvelope({ message_id: `human-action-decision:${decision.request_id}:${decision.decision_digest}`, network_id, event_id: `human-action-decision-event:${decision.decision_digest}`, plan_id: 'opn-human-action', plan_revision: 1, task_id: taskId, from_node_id: localNodeId, target_node_id: targetNodeId, notification_kind: 'human.action.decision', state: 'available', artifact_refs: [{ artifact_id: artifact.metadata.artifact_id, content_sha256: artifact.metadata.content_sha256, kind: 'artifact' }], created_at: decision.decided_at, expires_at: request.expires_at });
        const session = await localTransport.openSession({ network_id, node_id: localNodeId });
        try { const sent = await localTransport.send({ session_id: session.session_id, envelope }); return { status: sent.status, artifact_id: artifact.metadata.artifact_id, message_id: envelope.message_id, target_node_id: targetNodeId }; } finally { await localTransport.closeSession({ session_id: session.session_id }); }
      },
    } : null,
    transport: input.transport ?? (input.credentialVerifier ? createOpnTransportHttpService({ network_id: input.network_id, stateStore: input.stateStore, credentialVerifier: input.credentialVerifier }) : null),
    artifactTransfer: input.artifact_store && input.credentialVerifier ? createOpnArtifactTransferHttpService({ network_id: input.network_id, stateStore: input.stateStore, artifactStore: input.artifact_store, credentialVerifier: input.credentialVerifier }) : null,
    readinessCheck: {
      check: async () => {
        try {
          await input.stateStore.getRevision(input.network_id);
          return { status: 'ready' as const };
        } catch {
          return { status: 'not-ready' as const, reason: 'state-store-unavailable' };
        }
      },
    },
  });
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
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
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error('opn-endpoint-address-unavailable');
  }
  return {
    address,
    localTransport,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

export async function loadOpnEndpointTls(input: { key_path: string; cert_path: string; ca_path: string }): Promise<Pick<ServerOptions, 'key' | 'cert' | 'ca'>> {
  requireText(input.key_path, 'opn-endpoint-key-path-required');
  requireText(input.cert_path, 'opn-endpoint-cert-path-required');
  requireText(input.ca_path, 'opn-endpoint-ca-path-required');
  return { key: await readFile(input.key_path), cert: await readFile(input.cert_path), ca: await readFile(input.ca_path) };
}
