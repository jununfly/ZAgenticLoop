import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import type { Socket } from 'node:net';
import type {
  TrustedRunnerPeerIdentity,
  TrustedRunnerPeerIdentityVerifier,
  TrustedRunnerPeerVerification,
} from './trusted-runner-peer-identity.js';

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const RESPONSE_SCHEMA = 'zj-loop.macos_process_audit_peer_identity.v1';

type NativeResponse = {
  schema: typeof RESPONSE_SCHEMA;
  status: 'verified' | 'blocked';
  process_id?: number;
  identity_digest?: string;
  signing_identifier?: string;
  team_identifier?: string | null;
  code_directory_hash?: string;
  reason?: string;
};

type SocketWithHandle = Socket & { _handle?: { fd?: number } | null };

function blocked(reason: string): TrustedRunnerPeerVerification { return { status: 'blocked', reason }; }

function parseResponse(value: unknown): NativeResponse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.schema !== RESPONSE_SCHEMA || (item.status !== 'verified' && item.status !== 'blocked')) return null;
  if (item.status === 'blocked') return typeof item.reason === 'string' && item.reason ? item as NativeResponse : null;
  if (!Number.isInteger(item.process_id) || (item.process_id as number) < 1 || typeof item.identity_digest !== 'string' || !DIGEST.test(item.identity_digest)
    || typeof item.signing_identifier !== 'string' || !item.signing_identifier || (item.team_identifier !== undefined && item.team_identifier !== null && typeof item.team_identifier !== 'string')
    || typeof item.code_directory_hash !== 'string' || !item.code_directory_hash) return null;
  return item as NativeResponse;
}

function identityDigest(value: NativeResponse): string {
  const material = JSON.stringify({
    code_directory_hash: value.code_directory_hash,
    process_id: value.process_id,
    signing_identifier: value.signing_identifier,
    ...(value.team_identifier == null ? {} : { team_identifier: value.team_identifier }),
  });
  return `sha256:${createHash('sha256').update(material, 'utf8').digest('hex')}`;
}

async function invokeHelper(helperPath: string, socketFd: number, timeoutMs: number): Promise<NativeResponse> {
  return await new Promise((resolve, reject) => {
    const child = spawn(helperPath, ['--socket-fd', '3'], { stdio: ['ignore', 'pipe', 'pipe', socketFd] });
    if (!child.stdout || !child.stderr) { child.kill('SIGKILL'); reject(new Error('macos-process-audit-helper-pipes-unavailable')); return; }
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('macos-process-audit-helper-timeout')); }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; if (stdout.length > 16 * 1024) { child.kill('SIGKILL'); reject(new Error('macos-process-audit-helper-output-too-large')); } });
    child.stderr.on('data', (chunk) => { stderr += chunk; if (stderr.length > 4 * 1024) child.kill('SIGKILL'); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) { reject(new Error(stderr.trim() || `macos-process-audit-helper-exit-${code ?? 'unknown'}`)); return; }
      try {
        const parsed = parseResponse(JSON.parse(stdout.trim()));
        if (!parsed) throw new Error('macos-process-audit-helper-response-invalid');
        resolve(parsed);
      } catch (error) { reject(error); }
    });
  });
}

export function createMacOSProcessAuditPeerIdentityVerifier(input: {
  helper_path: string;
  helper_digest: string;
  timeout_ms?: number;
}): TrustedRunnerPeerIdentityVerifier {
  const timeout = input.timeout_ms ?? 2_000;
  return async ({ socket, expected_identity_digest }) => {
    if (process.platform !== 'darwin') return blocked('macos-process-audit-platform-unsupported');
    if (!DIGEST.test(expected_identity_digest)) return blocked('macos-process-audit-expected-digest-invalid');
    if (!DIGEST.test(input.helper_digest)) return blocked('macos-process-audit-helper-digest-invalid');
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60_000) return blocked('macos-process-audit-timeout-invalid');
    const socketFd = (socket as SocketWithHandle)._handle?.fd;
    if (!Number.isInteger(socketFd) || (socketFd as number) < 0) return blocked('macos-process-audit-socket-fd-unavailable');
    try {
      const helperBytes = await readFile(input.helper_path);
      if (helperBytes.byteLength === 0 || `sha256:${createHash('sha256').update(helperBytes).digest('hex')}` !== input.helper_digest) return blocked('macos-process-audit-helper-digest-invalid');
      const response = await invokeHelper(input.helper_path, socketFd as number, timeout);
      if (response.status === 'blocked') return blocked(response.reason ?? 'macos-process-audit-blocked');
      if (response.identity_digest !== identityDigest(response)) return blocked('macos-process-audit-identity-digest-invalid');
      if (response.identity_digest !== expected_identity_digest) return blocked('trusted-runner-peer-identity-mismatch');
      const identity: TrustedRunnerPeerIdentity = {
        schema: 'zj-loop.trusted_runner_peer_identity.v1', platform: 'darwin', kind: 'process-audit',
        identity_digest: response.identity_digest, process_id: response.process_id as number,
      };
      return { status: 'verified', identity };
    } catch (error) { return blocked(error instanceof Error ? error.message : 'macos-process-audit-failed'); }
  };
}
