import type { TransportAdapter } from './transport-contract.js';

export type OpnAgentWorkerProcessResult = {
  status: 'empty' | 'processed' | 'skipped' | 'blocked';
  message_id?: string;
  reason?: string;
  side_effects_executed: false;
};

export type OpnAgentWorkerSessionEvidence = {
  session_id: string;
  expires_at?: string;
  refreshed: boolean;
  refresh_count: number;
};

export type OpnAgentWorker = {
  runOnce(): Promise<OpnAgentWorkerProcessResult>;
  run(input?: { max_iterations?: number; idle_delay_ms?: number; signal?: AbortSignal }): Promise<{ iterations: number; stopped: true }>;
  stop(): Promise<void>;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createOpnAgentWorker(input: {
  network_id: string;
  node_id: string;
  transport: Pick<TransportAdapter, 'openSession' | 'closeSession'>;
  processNext(input: { session_id: string; receive_wait_ms?: number; session_evidence?: OpnAgentWorkerSessionEvidence }): Promise<OpnAgentWorkerProcessResult>;
  on_error?: (error: unknown) => void;
  now?: () => string;
  session_refresh_margin_ms?: number;
  receive_wait_ms?: number;
}): OpnAgentWorker {
  if (!input.network_id.trim() || !input.node_id.trim()) throw new Error('opn-agent-worker-identity-required');
  if (!input.transport || typeof input.transport.openSession !== 'function' || typeof input.transport.closeSession !== 'function') throw new Error('opn-agent-worker-transport-required');
  if (typeof input.processNext !== 'function') throw new Error('opn-agent-worker-processor-required');

  let session_id: string | undefined;
  let session_expires_at: string | undefined;
  let refresh_count = 0;
  let stopped = false;
  const now = input.now ?? (() => new Date().toISOString());
  const refreshMargin = input.session_refresh_margin_ms ?? 60_000;
  const receiveWait = input.receive_wait_ms ?? 25_000;
  if (!Number.isInteger(refreshMargin) || refreshMargin < 0 || refreshMargin > 60 * 60 * 1000) throw new Error('opn-agent-worker-session-refresh-margin-invalid');
  if (!Number.isInteger(receiveWait) || receiveWait < 0 || receiveWait > 30_000) throw new Error('opn-agent-worker-receive-wait-invalid');

  async function closeCurrentSession(): Promise<void> {
    const current = session_id;
    session_id = undefined;
    session_expires_at = undefined;
    if (current) await input.transport.closeSession({ session_id: current });
  }

  async function ensureSession(): Promise<string> {
    if (stopped) throw new Error('opn-agent-worker-stopped');
    if (session_id && session_expires_at) {
      const expiry = Date.parse(session_expires_at);
      const current = Date.parse(now());
      if (!Number.isFinite(expiry) || !Number.isFinite(current)) throw new Error('opn-agent-worker-session-expiry-invalid');
      if (expiry <= current + refreshMargin) {
        await closeCurrentSession();
        refresh_count += 1;
      }
    }
    if (!session_id) {
      const opened = await input.transport.openSession({ network_id: input.network_id, node_id: input.node_id });
      session_id = opened.session_id;
      session_expires_at = opened.expires_at;
    }
    if (!session_id || !session_id.trim()) throw new Error('opn-agent-worker-session-invalid');
    return session_id;
  }

  const worker: OpnAgentWorker = {
    async runOnce() {
      const current = await ensureSession();
      const sessionEvidence = { session_id: current, expires_at: session_expires_at, refreshed: refresh_count > 0, refresh_count };
      try {
        return await input.processNext({ session_id: current, receive_wait_ms: receiveWait, ...(session_expires_at ? { session_evidence: sessionEvidence } : {}) });
      } catch (error) {
        await closeCurrentSession();
        throw error;
      }
    },
    async run(options = {}) {
      const maxIterations = options.max_iterations;
      if (maxIterations !== undefined && (!Number.isInteger(maxIterations) || maxIterations < 1)) throw new Error('opn-agent-worker-iterations-invalid');
      const idleDelay = options.idle_delay_ms ?? 0;
      if (!Number.isInteger(idleDelay) || idleDelay < 0 || idleDelay > 60_000) throw new Error('opn-agent-worker-idle-delay-invalid');
      let iterations = 0;
      try {
        while (!stopped && !options.signal?.aborted && (maxIterations === undefined || iterations < maxIterations)) {
          let result: OpnAgentWorkerProcessResult;
          try {
            result = await worker.runOnce();
          } catch (error) {
            input.on_error?.(error);
            iterations += 1;
            if (idleDelay > 0 && !stopped && !options.signal?.aborted) await delay(idleDelay);
            continue;
          }
          iterations += 1;
          if (result.status === 'empty' && idleDelay > 0 && !stopped && !options.signal?.aborted) await delay(idleDelay);
        }
        return { iterations, stopped: true as const };
      } finally {
        await closeCurrentSession();
      }
    },
    async stop() {
      stopped = true;
      await closeCurrentSession();
    },
  };
  return worker;
}
