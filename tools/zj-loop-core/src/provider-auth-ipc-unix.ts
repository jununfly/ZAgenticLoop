import { chmod, mkdir, unlink } from 'node:fs/promises';
import net, { type Socket } from 'node:net';
import path from 'node:path';
import { encodeProviderAuthIpcFrame, ProviderAuthIpcDecoder, type ProviderAuthIpcFrame } from './provider-auth-ipc-protocol.js';

export type ProviderAuthIpcPeerVerifier = (socket: Socket) => Promise<boolean> | boolean;
export type ProviderAuthIpcConnection = { send(frame: ProviderAuthIpcFrame): Promise<void>; close(): void };

async function removeSocket(socketPath: string): Promise<void> { try { await unlink(socketPath); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }

export function createUnixProviderAuthIpcServer(input: { socket_path: string; correlation_id: string; verify_peer: ProviderAuthIpcPeerVerifier; on_frames: (frames: ProviderAuthIpcFrame[], connection: ProviderAuthIpcConnection) => void | Promise<void> }) {
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
      await chmod(input.socket_path, 0o600);
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

export async function connectUnixProviderAuthIpc(input: { socket_path: string; correlation_id: string; on_frames: (frames: ProviderAuthIpcFrame[]) => void | Promise<void> }): Promise<ProviderAuthIpcConnection> {
  const socket = net.createConnection(input.socket_path);
  const decoder = new ProviderAuthIpcDecoder({ correlation_id: input.correlation_id });
  socket.on('data', async (chunk) => {
    const result = decoder.push(new Uint8Array(chunk));
    if (result.status === 'blocked') socket.destroy();
    else if (result.frames.length > 0) await input.on_frames(result.frames);
  });
  await new Promise<void>((resolve, reject) => { socket.once('connect', () => resolve()); socket.once('error', reject); });
  return {
    async send(frame) { if (socket.destroyed) throw new Error('provider-auth-ipc-socket-closed'); await new Promise<void>((resolve, reject) => { socket.write(encodeProviderAuthIpcFrame(frame), (error) => error ? reject(error) : resolve()); }); },
    close() { socket.destroy(); },
  };
}
