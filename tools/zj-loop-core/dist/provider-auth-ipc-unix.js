import { chmod, mkdir, unlink } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { encodeProviderAuthIpcFrame, ProviderAuthIpcDecoder } from './provider-auth-ipc-protocol.js';
async function removeSocket(socketPath) { try {
    await unlink(socketPath);
}
catch (error) {
    if (error.code !== 'ENOENT')
        throw error;
} }
export function createUnixProviderAuthIpcServer(input) {
    let server;
    const connections = new Set();
    const connectionFor = (socket) => ({
        async send(frame) { if (socket.destroyed)
            throw new Error('provider-auth-ipc-socket-closed'); await new Promise((resolve, reject) => { socket.write(encodeProviderAuthIpcFrame(frame), (error) => error ? reject(error) : resolve()); }); },
        close() { socket.destroy(); },
    });
    return {
        async start() {
            if (server)
                throw new Error('provider-auth-ipc-server-already-started');
            await mkdir(path.dirname(input.socket_path), { recursive: true, mode: 0o700 });
            await removeSocket(input.socket_path);
            server = net.createServer(async (socket) => {
                connections.add(socket);
                const connection = connectionFor(socket);
                try {
                    await input.on_connection?.(socket, connection);
                }
                catch {
                    socket.destroy();
                    connections.delete(socket);
                    return;
                }
                let accepted = false;
                try {
                    accepted = await input.verify_peer(socket);
                }
                catch {
                    accepted = false;
                }
                if (!accepted) {
                    socket.destroy();
                    connections.delete(socket);
                    return;
                }
                const decoder = new ProviderAuthIpcDecoder({ correlation_id: input.correlation_id });
                socket.on('data', async (chunk) => {
                    const result = decoder.push(new Uint8Array(chunk));
                    if (result.status === 'blocked') {
                        socket.destroy();
                        return;
                    }
                    if (result.frames.length > 0)
                        await input.on_frames(result.frames, connection);
                });
                socket.on('close', () => connections.delete(socket));
                socket.on('error', () => connections.delete(socket));
            });
            await new Promise((resolve, reject) => { server?.once('error', reject).listen(input.socket_path, resolve); });
            // macOS can expose a connected Unix socket before its directory entry is
            // visible to chmod. The socket is still live; retry briefly and tolerate
            // only that platform race so startup does not leak a listening server.
            for (let attempt = 0; attempt < 10; attempt += 1) {
                try {
                    await chmod(input.socket_path, 0o600);
                    break;
                }
                catch (error) {
                    if (error.code !== 'ENOENT' || attempt === 9) {
                        if (error.code !== 'ENOENT')
                            throw error;
                        break;
                    }
                    await new Promise((resolve) => setTimeout(resolve, 5));
                }
            }
        },
        async close() {
            for (const socket of connections)
                socket.destroy();
            if (!server) {
                await removeSocket(input.socket_path);
                return;
            }
            const current = server;
            server = undefined;
            await new Promise((resolve) => current.close(() => resolve()));
            await removeSocket(input.socket_path);
        },
    };
}
export async function connectUnixProviderAuthIpc(input) {
    const socket = net.createConnection(input.socket_path);
    const decoder = new ProviderAuthIpcDecoder({ correlation_id: input.correlation_id });
    const timeout = input.timeout_ms ?? 5_000;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60_000) {
        socket.destroy();
        throw new Error('provider-auth-ipc-timeout-invalid');
    }
    socket.on('data', async (chunk) => {
        const result = decoder.push(new Uint8Array(chunk));
        if (result.status === 'blocked')
            socket.destroy();
        else if (result.frames.length > 0)
            await input.on_frames(result.frames);
    });
    await new Promise((resolve, reject) => {
        socket.setTimeout(timeout, () => { socket.destroy(); reject(new Error('provider-auth-ipc-connect-timeout')); });
        socket.once('connect', () => { socket.setTimeout(0); resolve(); });
        socket.once('error', reject);
    });
    return {
        async send(frame) { if (socket.destroyed)
            throw new Error('provider-auth-ipc-socket-closed'); await new Promise((resolve, reject) => { socket.write(encodeProviderAuthIpcFrame(frame), (error) => error ? reject(error) : resolve()); }); },
        close() { socket.destroy(); },
    };
}
