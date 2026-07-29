import type { PairingRequest } from './node-enrollment.js';

export type PairingLifecycleRecord =
  | { type: 'pairing-requested'; event_id: string; occurred_at: string; network_id: string; request: PairingRequest; request_digest: string }
  | { type: 'human-approved'; event_id: string; occurred_at: string; network_id: string; request_id: string; request_digest: string; human_id: string; approved_capabilities: string[] }
  | { type: 'pairing-rejected'; event_id: string; occurred_at: string; network_id: string; request_id: string; request_digest: string; reason: string }
  | { type: 'pairing-expired'; event_id: string; occurred_at: string; network_id: string; request_id: string; request_digest: string };

export type PairingRequestProjection = {
  request_id: string;
  network_id: string;
  node_id: string;
  request_digest: string;
  expires_at: string;
  requested_capabilities: string[];
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'projection-conflict';
  human_id: string | null;
  approved_capabilities: string[];
  reason: string | null;
};

function conflict(): never {
  throw new Error('pairing-projection-conflict');
}

function clone(request: PairingRequest, requestDigest: string): PairingRequestProjection {
  return { request_id: request.request_id, network_id: request.network_id, node_id: request.node_id, request_digest: requestDigest, expires_at: request.expires_at, requested_capabilities: [...request.requested_capabilities], status: 'pending', human_id: null, approved_capabilities: [], reason: null };
}

export function projectPairingRequests(input: { network_id: string; records: PairingLifecycleRecord[]; now?: string }): PairingRequestProjection[] {
  const projections = new Map<string, PairingRequestProjection>();
  const eventIds = new Set<string>();
  for (const record of input.records) {
    if (!record.event_id || eventIds.has(record.event_id)) conflict();
    eventIds.add(record.event_id);
    if (record.type === 'pairing-requested') {
      if (record.network_id !== input.network_id || record.request.network_id !== input.network_id || projections.has(record.request.request_id)) conflict();
      const projection = clone(record.request, record.request_digest);
      projections.set(record.request.request_id, projection);
      continue;
    }
    const projection = projections.get(record.request_id);
    if (!projection || record.network_id !== input.network_id || projection.network_id !== input.network_id || projection.request_digest !== record.request_digest) continue;
    if (projection.status !== 'pending') conflict();
    if (Date.parse(record.occurred_at) > Date.parse(projection.expires_at)) conflict();
    if (record.type === 'human-approved') {
      projection.status = 'approved';
      projection.human_id = record.human_id;
      projection.approved_capabilities = [...record.approved_capabilities];
    } else if (record.type === 'pairing-rejected') {
      projection.status = 'rejected';
      projection.reason = record.reason;
    } else if (record.type === 'pairing-expired') {
      projection.status = 'expired';
    }
  }
  const now = Date.parse(input.now ?? new Date().toISOString());
  if (!Number.isFinite(now)) throw new Error('pairing-projection-time-invalid');
  for (const projection of projections.values()) if (projection.status === 'pending' && now >= Date.parse(projection.expires_at)) projection.status = 'expired';
  return [...projections.values()];
}
