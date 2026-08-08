import { chmod, mkdir, unlink } from 'node:fs/promises';
import net, { type Socket } from 'node:net';
import path from 'node:path';
import { encodeProviderAuthIpcFrame, ProviderAuthIpcDecoder, type ProviderAuthIpcFrame } from './provider-auth-ipc-protocol.js';

export type ProviderAuthIpcPeerVerifier = (socket: Socket) => Promise<boolean> | boolean;
export type ProviderAuthIpcConnection = { send(frame: ProviderAuthIpcFrame): Promise<void>; close(): void };

async function removeSocket(socketPath: string): Promise<void> { try { await unlink(socketPath); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }

export function createUnixProviderAuthIpcServer(input: { socket_path: string; correlation_id: string; verify_peer: ProviderAuthIpcPeerVerifier; on_connection?: (socket: Socket, connection: ProviderAuthIpcConnection) => void | Promise<void>; on_frames: (frames: ProviderAuthIpcFrame[], connection: ProviderAuthIpcConnection) => void | Promise<void> }) {
  let server: net.Server | undefined;
  const connections = new Set<Socket>();
  const connectionFor = (socket: Socket): ProviderAuthIpcConnection => ({
    async send(frame) { if (socket.destroyed) throw new Error('provider-auth-ipc-socket-closed'); await new Promise<void>((resolve, reject) => { socket.write(encodeProviderAuthIpcFrame(frame), (error) => error ? reject(error) : resolve()); }); },
    close() { socket.destroy(); },
  });
  return {
    async start(): Promise<void> {
      if (server) throw new Error('provider-auth-ipc-server-already-started');
      await mkdir(path.dirname(input.socket_path), { recursive: true, mode: 0o700 });
      await removeSocket(input.socket_path);
      server = net.createServer(async (socket) => {
        connections.add(socket);
        const connection = connectionFor(socket);
        try { await input.on_connection?.(socket, connection); } catch { socket.destroy(); connections.delete(socket); return; }
        let accepted = false;
        try { accepted = await input.verify_peer(socket); } catch { accepted = false; }
        if (!accepted) { socket.destroy(); connections.delete(socket); return; }
        const decoder = new ProviderAuthIpcDecoder({ correlation_id: input.correlation_id });
        socket.on('data', async (chunk) => {
          const result = decoder.push(new Uint8Array(chunk));
          if (result.status === 'blocked') { socket.destroy(); return; }
          if (result.frames.length > 0) await input.on_frames(result.frames, connection);
        });
        socket.on('close', () => connections.delete(socket));
        socket.on('error', () => connections.delete(socket));
      });
      await new Promise<void>((resolve, reject) => { server?.once('error', reject).listen(input.socket_path, resolve); });
      // macOS can expose a connected Unix socket before its directory entry is
      // visible to chmod. The socket is still live; retry briefly and tolerate
      // only that platform race so startup does not leak a listening server.
      for (let attempt = 0; attempt < 10; attempt += 1) {
        try { await chmod(input.socket_path, 0o600); break; }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || attempt === 9) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      }
    },
    async close(): Promise<void> {
      for (const socket of connections) socket.destroy();
      if (!server) { await removeSocket(input.socket_path); return; }
      const current = server;
      server = undefined;
      await new Promise<void>((resolve) => current.close(() => resolve()));
      await removeSocket(input.socket_path);
    },
  };
}

export async function connectUnixProviderAuthIpc(input: { socket_path: string; correlation_id: string; on_frames: (frames: ProviderAuthIpcFrame[]) => void | Promise<void>; timeout_ms?: number }): Promise<ProviderAuthIpcConnection> {
  const socket = net.createConnection(input.socket_path);
  const decoder = new ProviderAuthIpcDecoder({ correlation_id: input.correlation_id });
  const timeout = input.timeout_ms ?? 5_000;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60_000) { socket.destroy(); throw new Error('provider-auth-ipc-timeout-invalid'); }
  socket.on('data', async (chunk) => {
    const result = decoder.push(new Uint8Array(chunk));
    if (result.status === 'blocked') socket.destroy();
    else if (result.frames.length > 0) await input.on_frames(result.frames);
  });
  await new Promise<void>((resolve, reject) => {
    socket.setTimeout(timeout, () => { socket.destroy(); reject(new Error('provider-auth-ipc-connect-timeout')); });
    socket.once('connect', () => { socket.setTimeout(0); resolve(); });
    socket.once('error', reject);
  });
  return {
    async send(frame) { if (socket.destroyed) throw new Error('provider-auth-ipc-socket-closed'); await new Promise<void>((resolve, reject) => { socket.write(encodeProviderAuthIpcFrame(frame), (error) => error ? reject(error) : resolve()); }); },
    close() { socket.destroy(); },
  };
}
