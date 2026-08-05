import net from 'node:net';
import { readProviderRuntimeServiceBinding } from './provider-runtime-service-binding.js';
async function socketReady(socketPath) {
    return await new Promise((resolve) => {
        const socket = net.createConnection(socketPath);
        let settled = false;
        const finish = (ready) => { if (settled)
            return; settled = true; socket.destroy(); resolve(ready); };
        socket.setTimeout(500, () => finish(false));
        socket.once('connect', () => finish(true));
        socket.once('error', () => finish(false));
    });
}
export function createProviderRuntimeServiceLifecycle(input) {
    if (!input.verifier || typeof input.verifier.verify !== 'function')
        throw new Error('provider-runtime-process-identity-verifier-required');
    const probe = input.probe_socket ?? socketReady;
    return {
        async status({ binding }) {
            const identity = await input.verifier.verify({ binding });
            if (identity.status === 'blocked')
                return { status: 'outcome-uncertain', service_id: binding.service_id, pid: binding.pid, socket_path: binding.socket_path, reason: identity.reason };
            if (!(await probe(binding.socket_path)))
                return { status: 'outcome-uncertain', service_id: binding.service_id, pid: binding.pid, socket_path: binding.socket_path, reason: 'provider-runtime-ipc-unavailable' };
            return { status: 'ready', service_id: binding.service_id, pid: binding.pid, socket_path: binding.socket_path };
        },
        async stop({ binding, terminate, wait_for_exit }) {
            const identity = await input.verifier.verify({ binding });
            if (identity.status === 'blocked')
                return { status: 'blocked', reason: identity.reason };
            await terminate(binding.pid);
            const exited = await (wait_for_exit ?? (async () => !(await probe(binding.socket_path))))(binding);
            return exited ? { status: 'stopped', service_id: binding.service_id, pid: binding.pid } : { status: 'outcome-uncertain', reason: 'provider-runtime-ipc-still-ready' };
        },
    };
}
export async function readProviderRuntimeServiceStatus(input) {
    return input.lifecycle.status({ binding: await readProviderRuntimeServiceBinding(input.binding_path) });
}
