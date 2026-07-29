import { pairingRequestDigest, type PairingApproval, type PairingRequest } from './node-enrollment.js';
import type { PairingLifecycleRecord } from './pairing-projection.js';

function requireText(value: string, error: string): string {
  if (!value.trim()) throw new Error(error);
  return value;
}

function bind(request: { request_id: string; network_id: string; node_id: string; request_digest: string }, input: { request_id: string; network_id: string; node_id: string }): void {
  if (request.request_id !== input.request_id || request.network_id !== input.network_id || request.node_id !== input.node_id) throw new Error('pairing-record-binding-mismatch');
}

export function createPairingRequestedRecord(input: { request: PairingRequest }): Extract<PairingLifecycleRecord, { type: 'pairing-requested' }> {
  const digest = pairingRequestDigest(input.request);
  return { type: 'pairing-requested', event_id: `pairing-requested:${input.request.request_id}`, occurred_at: new Date().toISOString(), network_id: input.request.network_id, request_digest: digest, request: input.request };
}

export function createPairingApprovedRecord(input: { request: { request_id: string; network_id: string; node_id: string; request_digest: string }; approval: Pick<PairingApproval, 'request_id' | 'network_id' | 'node_id' | 'human_id' | 'approved_capabilities' | 'approved_at'> }): Extract<PairingLifecycleRecord, { type: 'human-approved' }> {
  bind(input.request, input.approval);
  requireText(input.approval.human_id, 'human-id-required');
  return { type: 'human-approved', event_id: `pairing-approved:${input.request.request_id}:${input.approval.human_id}`, occurred_at: input.approval.approved_at, network_id: input.request.network_id, request_id: input.request.request_id, request_digest: input.request.request_digest, human_id: input.approval.human_id, approved_capabilities: [...new Set(input.approval.approved_capabilities)] };
}

export function createPairingRejectedRecord(input: { request: { request_id: string; network_id: string; node_id: string; request_digest: string }; human_id: string; rejected_at: string; reason: string }): Extract<PairingLifecycleRecord, { type: 'pairing-rejected' }> {
  requireText(input.human_id, 'human-id-required');
  requireText(input.reason, 'pairing-rejection-reason-required');
  return { type: 'pairing-rejected', event_id: `pairing-rejected:${input.request.request_id}:${input.human_id}`, occurred_at: input.rejected_at, network_id: input.request.network_id, request_id: input.request.request_id, request_digest: input.request.request_digest, reason: input.reason };
}

export function createPairingExpiredRecord(input: { request: { request_id: string; network_id: string; node_id: string; request_digest: string }; expired_at: string }): Extract<PairingLifecycleRecord, { type: 'pairing-expired' }> {
  return { type: 'pairing-expired', event_id: `pairing-expired:${input.request.request_id}`, occurred_at: input.expired_at, network_id: input.request.network_id, request_id: input.request.request_id, request_digest: input.request.request_digest };
}
