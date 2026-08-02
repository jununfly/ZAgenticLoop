import { type ProviderAuthRef, type ProviderAuthRuntime, type ProviderLaunchHandle, type ProviderRuntimeIdentityBinding } from './provider-auth-runtime.js';
import { validateProviderResult, type ProviderResult } from './provider-runtime-adapter.js';
import { createProviderAuthIpcFrame, type ProviderAuthIpcFrame } from './provider-auth-ipc-protocol.js';
import { createUnixProviderAuthIpcServer } from './provider-auth-ipc-unix.js';
import { validateTrustedRunnerPeerIdentity, type TrustedRunnerPeerIdentityVerifier } from './trusted-runner-peer-identity.js';

const LAUNCH_REQUEST_SCHEMA = 'zj-loop.provider_launch_request.v1';
const LAUNCH_RESPONSE_SCHEMA = 'zj-loop.provider_launch_response.v1';
const RESULT_SCHEMA = 'zj-loop.provider_ipc_result.v1';
const CLEANUP_RESPONSE_SCHEMA = 'zj-loop.provider_cleanup_response.v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/;

export type ProviderRuntimeSidecarInvocation = {
  status: ProviderResult['status'];
  success: boolean;
  pid: number;
  exit_code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  provider_result: ProviderResult;
};

export function createProviderAuthRuntimeIpcSidecar(input: {
  socket_path: string;
  correlation_id: string;
  expected_peer_identity_digest: string;
  verify_peer: TrustedRunnerPeerIdentityVerifier;
  runtime_binding: ProviderRuntimeIdentityBinding;
  challenge_ttl_ms?: number;
  runtime: ProviderAuthRuntime;
  auth_ref: ProviderAuthRef;
  contract_digest: string;
  adapter_contract_digest: string;
  invoke: (input: { task: Record<string, unknown>; handle: ProviderLaunchHandle }) => Promise<ProviderRuntimeSidecarInvocation>;
  now?: () => string;
}) {
  const now = input.now ?? (() => new Date().toISOString());
  const challengeTtlMs = input.challenge_ttl_ms ?? 30_000;
  if (!Number.isInteger(challengeTtlMs) || challengeTtlMs < 1 || challengeTtlMs > 60_000) throw new Error('provider-auth-ipc-challenge-ttl-invalid');
  const states = new WeakMap<object, { activeHandle?: ProviderLaunchHandle; sequence: number; challenge_consumed: boolean }>();
  const handles = new Map<string, ProviderLaunchHandle>();
  const consumedChallenges = new Set<string>();
  const connectionStartedAt = new WeakMap<object, number>();
  const error = async (connection: { send(frame: ProviderAuthIpcFrame): Promise<void> }, frame: ProviderAuthIpcFrame, code: string, sequence: number, launchHandleDigest?: string) => {
    await connection.send(createProviderAuthIpcFrame({ correlation_id: input.correlation_id, sequence, network_id: frame.network_id, node_id: frame.node_id, provider_runtime_id: frame.provider_runtime_id, provider_id: frame.provider_id, execution_id: frame.execution_id, attempt: frame.attempt, kind: 'error', ...(launchHandleDigest ? { launch_handle_digest: launchHandleDigest } : {}), payload: { code } }));
  };
  const server = createUnixProviderAuthIpcServer({ socket_path: input.socket_path, correlation_id: input.correlation_id, verify_peer: async (socket) => {
    const peer = await input.verify_peer({ socket, correlation_id: input.correlation_id, expected_identity_digest: input.expected_peer_identity_digest });
    return peer.status === 'verified' && validateTrustedRunnerPeerIdentity(peer.identity) && peer.identity.identity_digest === input.expected_peer_identity_digest;
  }, on_connection: (_socket, connection) => { connectionStartedAt.set(connection, Date.parse(now())); }, on_frames: async (frames, connection) => {
    const frame = frames[0];
    if (!frame) return;
    const state = states.get(connection) ?? { sequence: 1, challenge_consumed: false };
    states.set(connection, state);
    if (frame.kind === 'challenge') {
      if (state.challenge_consumed || !frame.nonce || consumedChallenges.has(frame.nonce)) { await error(connection, frame, 'provider-auth-ipc-challenge-replay', state.sequence++); return; }
      if (!Number.isFinite(connectionStartedAt.get(connection)) || Date.parse(now()) - (connectionStartedAt.get(connection) as number) > challengeTtlMs) { await error(connection, frame, 'provider-auth-ipc-challenge-expired', state.sequence++); return; }
      state.challenge_consumed = true;
      consumedChallenges.add(frame.nonce);
      const payload = frame.payload;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) { await error(connection, frame, 'provider-auth-ipc-launch-request-invalid', state.sequence++); return; }
      const value = payload as Record<string, unknown>;
      if (Object.keys(value).some((key) => !['schema', 'auth_ref_digest', 'contract_digest', 'adapter_contract_digest', 'runtime_identity_fingerprint', 'runtime_manifest_digest', 'provider_capabilities_digest', 'task'].includes(key)) || value.schema !== LAUNCH_REQUEST_SCHEMA || value.auth_ref_digest !== input.auth_ref.ref_digest || value.contract_digest !== input.contract_digest || value.adapter_contract_digest !== input.adapter_contract_digest || value.runtime_identity_fingerprint !== input.runtime_binding.runtime_identity_fingerprint || value.runtime_manifest_digest !== input.runtime_binding.runtime_manifest_digest || value.provider_capabilities_digest !== input.runtime_binding.provider_capabilities_digest || !value.task || typeof value.task !== 'object' || Array.isArray(value.task)) { await error(connection, frame, 'provider-auth-ipc-launch-request-invalid', state.sequence++); return; }
      let launch: Awaited<ReturnType<ProviderAuthRuntime['launch']>>;
      try { launch = await input.runtime.launch({ ref: input.auth_ref, network_id: frame.network_id, node_id: frame.node_id, provider_id: frame.provider_id, execution_id: frame.execution_id, attempt: frame.attempt, contract_digest: input.contract_digest, adapter_contract_digest: input.adapter_contract_digest, runtime_binding: input.runtime_binding, issued_at: now(), expires_at: input.auth_ref.expires_at }); } catch { await error(connection, frame, 'provider-auth-ipc-launch-failed', state.sequence++); return; }
      if (launch.status === 'blocked') { await error(connection, frame, launch.reason, state.sequence++); return; }
      const handle = launch.handle;
      state.activeHandle = handle;
      handles.set(handle.handle_digest, handle);
      await connection.send(createProviderAuthIpcFrame({ correlation_id: input.correlation_id, sequence: state.sequence++, network_id: frame.network_id, node_id: frame.node_id, provider_runtime_id: handle.provider_runtime_id, provider_id: handle.provider_id, execution_id: handle.execution_id, attempt: handle.attempt, kind: 'launch-accepted', launch_handle_digest: handle.handle_digest, payload: { schema: LAUNCH_RESPONSE_SCHEMA, status: 'accepted', handle } }));
      try {
        const result = await input.invoke({ task: value.task as Record<string, unknown>, handle });
        const validation = validateProviderResult(result.provider_result);
        if (validation.status === 'blocked' || validation.result.status !== result.status || validation.result.success !== result.success) throw new Error('provider-auth-ipc-sidecar-provider-result-invalid');
        await connection.send(createProviderAuthIpcFrame({ correlation_id: input.correlation_id, sequence: state.sequence++, network_id: handle.network_id, node_id: handle.node_id, provider_runtime_id: handle.provider_runtime_id, provider_id: handle.provider_id, execution_id: handle.execution_id, attempt: handle.attempt, kind: 'stdout', launch_handle_digest: handle.handle_digest, payload: result.stdout }));
        await connection.send(createProviderAuthIpcFrame({ correlation_id: input.correlation_id, sequence: state.sequence++, network_id: handle.network_id, node_id: handle.node_id, provider_runtime_id: handle.provider_runtime_id, provider_id: handle.provider_id, execution_id: handle.execution_id, attempt: handle.attempt, kind: 'stderr', launch_handle_digest: handle.handle_digest, payload: result.stderr }));
        await connection.send(createProviderAuthIpcFrame({ correlation_id: input.correlation_id, sequence: state.sequence++, network_id: handle.network_id, node_id: handle.node_id, provider_runtime_id: handle.provider_runtime_id, provider_id: handle.provider_id, execution_id: handle.execution_id, attempt: handle.attempt, kind: 'result', launch_handle_digest: handle.handle_digest, payload: { schema: RESULT_SCHEMA, status: result.status, success: result.success, pid: result.pid, exit_code: result.exit_code, signal: result.signal, provider_result: validation.result } }));
      } catch {
        await error(connection, frame, 'provider-auth-ipc-sidecar-invocation-failed', state.sequence++, handle.handle_digest);
      }
    } else if (frame.kind === 'cleanup' && frame.launch_handle_digest && DIGEST.test(frame.launch_handle_digest)) {
      const handle = handles.get(frame.launch_handle_digest);
      if (!handle || handle.handle_digest !== frame.launch_handle_digest) { await error(connection, frame, 'provider-auth-ipc-cleanup-handle-mismatch', 1, frame.launch_handle_digest); return; }
      const cleanupPayload = frame.payload;
      if (!cleanupPayload || typeof cleanupPayload !== 'object' || Array.isArray(cleanupPayload)) { await error(connection, frame, 'provider-auth-ipc-cleanup-request-invalid', 1, handle.handle_digest); return; }
      const cleanupValue = cleanupPayload as Record<string, unknown>;
      if (Object.keys(cleanupValue).some((key) => !['schema', 'handle_id', 'cleaned_at', 'runtime_identity_fingerprint', 'runtime_manifest_digest', 'provider_capabilities_digest'].includes(key)) || cleanupValue.schema !== 'zj-loop.provider_cleanup_request.v1' || cleanupValue.handle_id !== handle.handle_id || cleanupValue.runtime_identity_fingerprint !== handle.runtime_identity_fingerprint || cleanupValue.runtime_manifest_digest !== handle.runtime_manifest_digest || cleanupValue.provider_capabilities_digest !== handle.provider_capabilities_digest || typeof cleanupValue.cleaned_at !== 'string') { await error(connection, frame, 'provider-auth-ipc-cleanup-request-invalid', 1, handle.handle_digest); return; }
      let cleanup: Awaited<ReturnType<ProviderAuthRuntime['cleanup']>>;
      try { cleanup = await input.runtime.cleanup({ handle, network_id: frame.network_id, node_id: frame.node_id, provider_id: frame.provider_id, execution_id: frame.execution_id, attempt: frame.attempt, cleaned_at: now() }); } catch { await error(connection, frame, 'provider-auth-ipc-cleanup-failed', 1, handle.handle_digest); return; }
      if (cleanup.status === 'blocked') { await error(connection, frame, cleanup.reason, 1, handle.handle_digest); return; }
      await connection.send(createProviderAuthIpcFrame({ correlation_id: input.correlation_id, sequence: 1, network_id: handle.network_id, node_id: handle.node_id, provider_runtime_id: handle.provider_runtime_id, provider_id: handle.provider_id, execution_id: handle.execution_id, attempt: handle.attempt, kind: 'cleanup', launch_handle_digest: handle.handle_digest, payload: { schema: CLEANUP_RESPONSE_SCHEMA, status: 'cleaned', cleanup_digest: cleanup.proof.cleanup_digest, runtime_identity_fingerprint: cleanup.proof.runtime_identity_fingerprint, runtime_manifest_digest: cleanup.proof.runtime_manifest_digest, provider_capabilities_digest: cleanup.proof.provider_capabilities_digest } }));
      state.activeHandle = undefined;
      handles.delete(handle.handle_digest);
    }
  }});
  return server;
}
