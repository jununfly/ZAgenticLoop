import { chmod, mkdir, unlink } from 'node:fs/promises';
import net, { type Socket } from 'node:net';
import path from 'node:path';
import { createFramedJsonCodec, FramedJsonDecoder, type FramedJsonFrame, type FramedJsonValidation } from './framed-json-transport.js';

export type FramedJsonConnection = { send(frame: FramedJsonFrame): Promise<void>; close(): void };
export type FramedJsonPeerVerifier = (socket: Socket) => Promise<boolean> | boolean;

async function removeSocket(socketPath: string): Promise<void> { try { await unlink(socketPath); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }

function connectionFor(socket: Socket, codec: ReturnType<typeof createFramedJsonCodec>): FramedJsonConnection {
  return {
    async send(frame) { if (socket.destroyed) throw new Error('framed-json-socket-closed'); await new Promise<void>((resolve, reject) => { socket.write(codec.encode(frame), (error) => error ? reject(error) : resolve()); }); },
    close() { socket.destroy(); },
  };
}

export function createUnixFramedJsonServer(input: { socket_path: string; correlation_id: string; verify_peer: FramedJsonPeerVerifier; validate?: (value: unknown) => FramedJsonValidation; on_connection?: (socket: Socket, connection: FramedJsonConnection) => void | Promise<void>; on_frames: (frames: FramedJsonFrame[], connection: FramedJsonConnection) => void | Promise<void>; max_frame_bytes?: number }) {
  let server: net.Server | undefined;
  const connections = new Set<Socket>();
  const codec = createFramedJsonCodec({ max_frame_bytes: input.max_frame_bytes });
  return {
    async start() {
      if (server) throw new Error('framed-json-server-already-started');
      await mkdir(path.dirname(input.socket_path), { recursive: true, mode: 0o700 });
      await removeSocket(input.socket_path);
      server = net.createServer(async (socket) => {
        connections.add(socket);
        const connection = connectionFor(socket, codec);
        try { await input.on_connection?.(socket, connection); } catch { socket.destroy(); connections.delete(socket); return; }
        let accepted = false;
        try { accepted = await input.verify_peer(socket); } catch { accepted = false; }
        if (!accepted) { socket.destroy(); connections.delete(socket); return; }
        const decoder = new FramedJsonDecoder({ correlation_id: input.correlation_id, validate: input.validate, max_frame_bytes: input.max_frame_bytes });
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
    async close() {
      for (const socket of connections) socket.destroy();
      if (!server) { await removeSocket(input.socket_path); return; }
      const current = server;
      server = undefined;
      await new Promise<void>((resolve) => current.close(() => resolve()));
      await removeSocket(input.socket_path);
    },
  };
}

export async function connectUnixFramedJson(input: { socket_path: string; correlation_id: string; on_frames: (frames: FramedJsonFrame[]) => void | Promise<void>; validate?: (value: unknown) => FramedJsonValidation; timeout_ms?: number; max_frame_bytes?: number }): Promise<FramedJsonConnection> {
  const socket = net.createConnection(input.socket_path);
  const codec = createFramedJsonCodec({ max_frame_bytes: input.max_frame_bytes });
  const decoder = new FramedJsonDecoder({ correlation_id: input.correlation_id, validate: input.validate, max_frame_bytes: input.max_frame_bytes });
  const timeout = input.timeout_ms ?? 5_000;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60_000) { socket.destroy(); throw new Error('framed-json-connect-timeout-invalid'); }
  socket.on('data', async (chunk) => {
    const result = decoder.push(new Uint8Array(chunk));
    if (result.status === 'blocked') socket.destroy();
    else if (result.frames.length > 0) await input.on_frames(result.frames);
  });
  await new Promise<void>((resolve, reject) => {
    socket.setTimeout(timeout, () => { socket.destroy(); reject(new Error('framed-json-connect-timeout')); });
    socket.once('connect', () => { socket.setTimeout(0); resolve(); });
    socket.once('error', reject);
  });
  return connectionFor(socket, codec);
}
