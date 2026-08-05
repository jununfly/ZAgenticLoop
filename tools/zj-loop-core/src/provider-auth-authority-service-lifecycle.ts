import net from 'node:net';
import { readProviderAuthAuthorityBinding, type ProviderAuthAuthorityBinding } from './provider-auth-authority-binding.js';
import type { ProviderAuthAuthorityProcessIdentityVerifier } from './provider-auth-authority-process-identity.js';

export type ProviderAuthAuthorityServiceStatus = {
  status: 'ready' | 'outcome-uncertain';
  service_id: string;
  pid: number;
  socket_path: string;
  reason?: 'provider-auth-authority-process-identity-unavailable' | 'provider-auth-authority-process-identity-mismatch' | 'provider-auth-authority-ipc-unavailable';
};

export type ProviderAuthAuthorityServiceLifecycle = {
  status(input: { binding: ProviderAuthAuthorityBinding }): Promise<ProviderAuthAuthorityServiceStatus>;
  stop(input: { binding: ProviderAuthAuthorityBinding; terminate: (pid: number) => Promise<void>; wait_for_exit?: (binding: ProviderAuthAuthorityBinding) => Promise<boolean> }): Promise<
    | { status: 'stopped'; service_id: string; pid: number }
    | { status: 'blocked'; reason: 'provider-auth-authority-process-identity-unavailable' | 'provider-auth-authority-process-identity-mismatch' }
    | { status: 'outcome-uncertain'; reason: 'provider-auth-authority-stop-timeout' | 'provider-auth-authority-ipc-still-ready' }
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

export function createProviderAuthAuthorityServiceLifecycle(input: { verifier: ProviderAuthAuthorityProcessIdentityVerifier; probe_socket?: (socketPath: string) => Promise<boolean> }): ProviderAuthAuthorityServiceLifecycle {
  if (!input.verifier || typeof input.verifier.verify !== 'function') throw new Error('provider-auth-authority-process-identity-verifier-required');
  const probe = input.probe_socket ?? socketReady;
  return {
    async status({ binding }) {
      const identity = await input.verifier.verify({ binding });
      if (identity.status === 'blocked') return { status: 'outcome-uncertain', service_id: binding.service_id, pid: binding.pid, socket_path: binding.socket_path, reason: identity.reason };
      if (!(await probe(binding.socket_path))) return { status: 'outcome-uncertain', service_id: binding.service_id, pid: binding.pid, socket_path: binding.socket_path, reason: 'provider-auth-authority-ipc-unavailable' };
      return { status: 'ready', service_id: binding.service_id, pid: binding.pid, socket_path: binding.socket_path };
    },
    async stop({ binding, terminate, wait_for_exit }) {
      const identity = await input.verifier.verify({ binding });
      if (identity.status === 'blocked') return { status: 'blocked', reason: identity.reason };
      await terminate(binding.pid);
      const exited = await (wait_for_exit ?? (async () => !(await probe(binding.socket_path))))(binding);
      return exited ? { status: 'stopped', service_id: binding.service_id, pid: binding.pid } : { status: 'outcome-uncertain', reason: 'provider-auth-authority-ipc-still-ready' };
    },
  };
}

export async function readProviderAuthAuthorityServiceStatus(input: { binding_path: string; lifecycle: ProviderAuthAuthorityServiceLifecycle }): Promise<ProviderAuthAuthorityServiceStatus> {
  return input.lifecycle.status({ binding: await readProviderAuthAuthorityBinding(input.binding_path) });
}
