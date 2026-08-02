import { mkdir, unlink, chmod, access } from 'node:fs/promises';
import net, { type Socket } from 'node:net';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { RealAgentDogfoodPostRunProof, RealAgentDogfoodPostRunProofFactory } from './real-agent-dogfood-post-run-proof.js';
import { validateTrustedRunnerPeerIdentity, type TrustedRunnerPeerIdentityVerifier } from './trusted-runner-peer-identity.js';

const REQUEST_SCHEMA = 'zj-loop.trusted_runner_post_run_proof_request.v1';
const RESPONSE_SCHEMA = 'zj-loop.trusted_runner_post_run_proof_response.v1';
const MAX_BYTES = 64 * 1024;

type ProofRequest = Parameters<RealAgentDogfoodPostRunProofFactory>[0];
type WireRequest = { schema: typeof REQUEST_SCHEMA; correlation_id: string; request_id: string; input: ProofRequest };
type WireResponse = { schema: typeof RESPONSE_SCHEMA; correlation_id: string; request_id: string; status: 'issued' | 'blocked'; proof?: RealAgentDogfoodPostRunProof; reason?: string };

function encode(value: unknown): Buffer {
  const bytes = Buffer.from(JSON.stringify(value), 'utf8');
  if (bytes.byteLength > MAX_BYTES) throw new Error('trusted-runner-post-run-ipc-frame-too-large');
  const frame = Buffer.allocUnsafe(bytes.byteLength + 4);
  frame.writeUInt32BE(bytes.byteLength, 0);
  bytes.copy(frame, 4);
  return frame;
}

async function removeSocket(socketPath: string): Promise<void> {
  try { await unlink(socketPath); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}

function readFrame(socket: Socket, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('trusted-runner-post-run-ipc-timeout')); }, timeoutMs);
    const fail = (error: Error) => { clearTimeout(timer); socket.destroy(); reject(error); };
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 4) return;
      const size = buffer.readUInt32BE(0);
      if (size < 2 || size > MAX_BYTES) return fail(new Error('trusted-runner-post-run-ipc-frame-invalid'));
      if (buffer.length < size + 4) return;
      clearTimeout(timer);
      try { resolve(JSON.parse(buffer.subarray(4, size + 4).toString('utf8'))); } catch { socket.destroy(); reject(new Error('trusted-runner-post-run-ipc-json-invalid')); }
    });
    socket.once('error', fail);
  });
}

function validInput(value: unknown): value is ProofRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.execution_id === 'string' && item.execution_id.trim() !== '' && Number.isInteger(item.attempt) && (item.attempt as number) >= 1
    && typeof item.worktree_path === 'string' && item.worktree_path.trim() !== '' && typeof item.executable_digest === 'string'
    && /^sha256:[0-9a-f]{64}$/.test(item.executable_digest) && typeof item.stdout_digest === 'string' && /^sha256:[0-9a-f]{64}$/.test(item.stdout_digest)
    && typeof item.stderr_digest === 'string' && /^sha256:[0-9a-f]{64}$/.test(item.stderr_digest) && !!item.provider_result;
}

export function createTrustedRunnerPostRunProofServer(input: {
  socket_path: string;
  correlation_id: string;
  expected_peer_identity_digest: string;
  issue: (request: ProofRequest) => Promise<RealAgentDogfoodPostRunProof>;
  verify_peer: TrustedRunnerPeerIdentityVerifier;
}) {
  let server: net.Server | undefined;
  return {
    async start() {
      await mkdir(path.dirname(input.socket_path), { recursive: true, mode: 0o700 });
      await removeSocket(input.socket_path);
      server = net.createServer(async (socket) => {
        try {
          const peer = await input.verify_peer({ socket, correlation_id: input.correlation_id, expected_identity_digest: input.expected_peer_identity_digest });
          if (peer.status !== 'verified' || !validateTrustedRunnerPeerIdentity(peer.identity) || peer.identity.identity_digest !== input.expected_peer_identity_digest) { socket.destroy(); return; }
          const request = await readFrame(socket, 5_000) as Partial<WireRequest>;
          const response: WireResponse = request.schema === REQUEST_SCHEMA && request.correlation_id === input.correlation_id && typeof request.request_id === 'string' && validInput(request.input)
            ? await input.issue(request.input).then((proof) => ({ schema: RESPONSE_SCHEMA as typeof RESPONSE_SCHEMA, correlation_id: input.correlation_id, request_id: request.request_id as string, status: 'issued' as const, proof })).catch((error) => ({ schema: RESPONSE_SCHEMA as typeof RESPONSE_SCHEMA, correlation_id: input.correlation_id, request_id: request.request_id as string, status: 'blocked' as const, reason: error instanceof Error ? error.message : 'trusted-runner-post-run-proof-blocked' }))
            : { schema: RESPONSE_SCHEMA, correlation_id: input.correlation_id, request_id: typeof request.request_id === 'string' ? request.request_id : 'invalid', status: 'blocked', reason: 'trusted-runner-post-run-request-invalid' };
          socket.end(encode(response));
        } catch { socket.destroy(); }
      });
      await new Promise<void>((resolve, reject) => { server?.once('error', reject).listen(input.socket_path, resolve); });
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try { await access(input.socket_path); await chmod(input.socket_path, 0o600); break; }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || attempt === 19) throw error;
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      }
    },
    async close() {
      if (!server) { await removeSocket(input.socket_path); return; }
      const current = server;
      server = undefined;
      await new Promise<void>((resolve) => current.close(() => resolve()));
      await removeSocket(input.socket_path);
    },
  };
}

export function createTrustedRunnerPostRunProofFactory(input: { socket_path: string; correlation_id: string; timeout_ms?: number }): RealAgentDogfoodPostRunProofFactory {
  const timeout = input.timeout_ms ?? 5_000;
  return async (request) => {
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60_000) throw new Error('trusted-runner-post-run-ipc-timeout-invalid');
    const requestId = randomUUID();
    const socket = net.createConnection(input.socket_path);
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { socket.destroy(); reject(new Error('trusted-runner-post-run-ipc-connect-timeout')); }, timeout);
        socket.once('connect', () => { clearTimeout(timer); resolve(); });
        socket.once('error', reject);
      });
      socket.write(encode({ schema: REQUEST_SCHEMA, correlation_id: input.correlation_id, request_id: requestId, input: request } satisfies WireRequest));
      const response = await readFrame(socket, timeout) as Partial<WireResponse>;
      if (response.schema !== RESPONSE_SCHEMA || response.correlation_id !== input.correlation_id || response.request_id !== requestId) throw new Error('trusted-runner-post-run-response-binding-invalid');
      if (response.status !== 'issued' || !response.proof) throw new Error(typeof response.reason === 'string' && response.reason ? response.reason : 'trusted-runner-post-run-proof-blocked');
      return response.proof;
    } finally { socket.destroy(); }
  };
}
