import net from 'node:net';
import { readProviderRuntimeServiceBinding, type ProviderRuntimeServiceBinding } from './provider-runtime-service-binding.js';
import type { ProviderRuntimeProcessIdentityVerifier } from './provider-runtime-process-identity.js';

export type ProviderRuntimeServiceStatus = {
  status: 'ready' | 'outcome-uncertain';
  service_id: string;
  pid: number;
  socket_path: string;
  reason?: 'provider-runtime-process-identity-unavailable' | 'provider-runtime-process-identity-mismatch' | 'provider-runtime-ipc-unavailable';
};

export type ProviderRuntimeServiceLifecycle = {
  status(input: { binding: ProviderRuntimeServiceBinding }): Promise<ProviderRuntimeServiceStatus>;
  stop(input: { binding: ProviderRuntimeServiceBinding; terminate: (pid: number) => Promise<void>; wait_for_exit?: (binding: ProviderRuntimeServiceBinding) => Promise<boolean> }): Promise<
    | { status: 'stopped'; service_id: string; pid: number }
    | { status: 'blocked'; reason: 'provider-runtime-process-identity-unavailable' | 'provider-runtime-process-identity-mismatch' }
    | { status: 'outcome-uncertain'; reason: 'provider-runtime-stop-timeout' | 'provider-runtime-ipc-still-ready' }
  >;
};

async function socketReady(socketPath: string): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = net.createConnection(socketPath);
    let settled = false;
    const finish = (ready: boolean) => { if (settled) return; settled = true; socket.destroy(); resolve(ready); };
    socket.setTimeout(500, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

export function createProviderRuntimeServiceLifecycle(input: { verifier: ProviderRuntimeProcessIdentityVerifier; probe_socket?: (socketPath: string) => Promise<boolean> }): ProviderRuntimeServiceLifecycle {
  if (!input.verifier || typeof input.verifier.verify !== 'function') throw new Error('provider-runtime-process-identity-verifier-required');
  const probe = input.probe_socket ?? socketReady;
  return {
    async status({ binding }) {
      const identity = await input.verifier.verify({ binding });
      if (identity.status === 'blocked') return { status: 'outcome-uncertain', service_id: binding.service_id, pid: binding.pid, socket_path: binding.socket_path, reason: identity.reason };
      if (!(await probe(binding.socket_path))) return { status: 'outcome-uncertain', service_id: binding.service_id, pid: binding.pid, socket_path: binding.socket_path, reason: 'provider-runtime-ipc-unavailable' };
      return { status: 'ready', service_id: binding.service_id, pid: binding.pid, socket_path: binding.socket_path };
    },
    async stop({ binding, terminate, wait_for_exit }) {
      const identity = await input.verifier.verify({ binding });
      if (identity.status === 'blocked') return { status: 'blocked', reason: identity.reason };
      await terminate(binding.pid);
      const exited = await (wait_for_exit ?? (async () => !(await probe(binding.socket_path))))(binding);
      return exited ? { status: 'stopped', service_id: binding.service_id, pid: binding.pid } : { status: 'outcome-uncertain', reason: 'provider-runtime-ipc-still-ready' };
    },
  };
}

export async function readProviderRuntimeServiceStatus(input: { binding_path: string; lifecycle: ProviderRuntimeServiceLifecycle }): Promise<ProviderRuntimeServiceStatus> {
  return input.lifecycle.status({ binding: await readProviderRuntimeServiceBinding(input.binding_path) });
}
