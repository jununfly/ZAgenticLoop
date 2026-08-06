import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import type { ServerOptions } from 'node:https';
import { createPairingHttpServer } from './pairing-http-server.js';
import { createSqlitePairingRecordStore } from './sqlite-pairing-record-store.js';
import type { SqliteStateStore } from './sqlite-state-store.js';

export const OPN_ENDPOINT_SCHEMA = 'zj-loop.opn_endpoint.v1' as const;

export type OpnEndpoint = {
  address: AddressInfo;
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
}): Promise<OpnEndpoint> {
  requireText(input.bind, 'opn-endpoint-bind-required');
  requireText(input.network_id, 'opn-endpoint-network-id-required');
  if (!Number.isInteger(input.port) || input.port < 0 || input.port > 65535) throw new Error('opn-endpoint-port-invalid');
  if (!input.stateStore) throw new Error('opn-endpoint-state-store-required');
  if (!input.tls.key || !input.tls.cert || !input.tls.ca) throw new Error('opn-endpoint-tls-material-required');

  await input.stateStore.getRevision(input.network_id);
  const recordStore = createSqlitePairingRecordStore({ stateStore: input.stateStore });
  const server = createPairingHttpServer({
    tls: input.tls,
    recordStore,
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
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

export async function loadOpnEndpointTls(input: { key_path: string; cert_path: string; ca_path: string }): Promise<Pick<ServerOptions, 'key' | 'cert' | 'ca'>> {
  requireText(input.key_path, 'opn-endpoint-key-path-required');
  requireText(input.cert_path, 'opn-endpoint-cert-path-required');
  requireText(input.ca_path, 'opn-endpoint-ca-path-required');
  return { key: await readFile(input.key_path), cert: await readFile(input.cert_path), ca: await readFile(input.ca_path) };
}
