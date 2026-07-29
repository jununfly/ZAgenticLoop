import { createHash, X509Certificate } from 'node:crypto';
import type { ConnectionOptions, TlsOptions } from 'node:tls';

export const NODE_IDENTITY_SCHEMA = 'zj-loop.node_identity.v1' as const;
export const ENROLLMENT_PROJECTION_SCHEMA = 'zj-loop.enrollment_projection.v1' as const;
export const PAIRING_REQUEST_SCHEMA = 'zj-loop.pairing_request.v1' as const;
export const PAIRING_APPROVAL_SCHEMA = 'zj-loop.pairing_approval.v1' as const;
export const ENROLLMENT_RECORD_SCHEMA = 'zj-loop.enrollment_record.v1' as const;

export type NodeIdentity = {
  schema: typeof NODE_IDENTITY_SCHEMA;
  node_id: string;
  certificate_sha256: string;
  certificate_pem: string;
  display_name: string;
  agent_kind: string;
  agent_version: string;
};

export type EnrollmentEvent = {
  type: 'identity-generated' | 'pairing-requested' | 'human-approved' | 'capability-ceiling-granted' | 'credential-issued' | 'revoked' | 're-enrolled';
  event_id: string;
  node_id: string;
  occurred_at: string;
  capabilities?: string[];
};

export type EnrollmentRecord = {
  schema: typeof ENROLLMENT_RECORD_SCHEMA;
  type: EnrollmentEvent['type'];
  event_id: string;
  network_id: string;
  node_id: string;
  occurred_at: string;
  capabilities?: string[];
};

export type EnrollmentRecordStore = {
  append(record: EnrollmentRecord): Promise<{ status: 'recorded' | 'duplicate'; record: EnrollmentRecord }>;
  list(networkId: string, nodeId: string): Promise<EnrollmentRecord[]>;
};

function cloneRecord(record: EnrollmentRecord): EnrollmentRecord {
  return { ...record, ...(record.capabilities ? { capabilities: [...record.capabilities] } : {}) };
}

export function createInMemoryEnrollmentRecordStore(): EnrollmentRecordStore {
  const records = new Map<string, EnrollmentRecord>();
  return {
    async append(record) {
      if (!record.event_id.trim()) throw new Error('enrollment-event-id-required');
      if (!record.network_id.trim()) throw new Error('network-id-required');
      if (!record.node_id.trim()) throw new Error('node-id-required');
      const key = `${record.network_id}:${record.node_id}:${record.event_id}`;
      const existing = records.get(key);
      if (existing) {
        if (JSON.stringify(existing) !== JSON.stringify(record)) throw new Error('enrollment-event-conflict');
        return { status: 'duplicate', record: cloneRecord(existing) };
      }
      const stored = cloneRecord(record);
      records.set(key, stored);
      return { status: 'recorded', record: cloneRecord(stored) };
    },
    async list(networkId, nodeId) {
      return [...records.values()]
        .filter((record) => record.network_id === networkId && record.node_id === nodeId)
        .map(cloneRecord);
    },
  };
}

export type EnrollmentProjection = {
  schema: typeof ENROLLMENT_PROJECTION_SCHEMA;
  identity: NodeIdentity;
  status: 'pending' | 'approved' | 'revoked';
  capability_ceiling: string[];
  events: EnrollmentEvent[];
};

export type CapabilityGrant = {
  node_id: string;
  event_id: string;
  task_id: string;
  capabilities: string[];
};

export type PairingRequest = {
  schema: typeof PAIRING_REQUEST_SCHEMA;
  request_id: string;
  network_id: string;
  node_id: string;
  identity: NodeIdentity;
  endpoint: string;
  requested_capabilities: string[];
  expires_at: string;
};

export type PairingApproval = {
  schema: typeof PAIRING_APPROVAL_SCHEMA;
  approval_id: string;
  request_id: string;
  network_id: string;
  node_id: string;
  human_id: string;
  approved_capabilities: string[];
  approved_at: string;
  request_expires_at: string;
};

function requireNonEmpty(value: string, error: string): string {
  if (!value.trim()) throw new Error(error);
  return value;
}

function requireTimestamp(value: string, error: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(error);
  return timestamp;
}

export function createPairingRequest(input: {
  request_id: string;
  network_id: string;
  identity: NodeIdentity;
  endpoint: string;
  requested_capabilities: string[];
  expires_at: string;
}): PairingRequest {
  requireNonEmpty(input.request_id, 'pairing-request-id-required');
  requireNonEmpty(input.network_id, 'network-id-required');
  requireNonEmpty(input.endpoint, 'pairing-endpoint-required');
  requireTimestamp(input.expires_at, 'pairing-expiry-invalid');
  const capabilities = [...new Set(input.requested_capabilities)];
  if (capabilities.some((capability) => !capability.trim())) throw new Error('pairing-capability-invalid');
  const rebuiltIdentity = buildNodeIdentity({
    certificate_pem: input.identity.certificate_pem,
    display_name: input.identity.display_name,
    agent_kind: input.identity.agent_kind,
    agent_version: input.identity.agent_version,
  });
  if (input.identity.node_id !== rebuiltIdentity.node_id || input.identity.certificate_sha256 !== rebuiltIdentity.certificate_sha256) {
    throw new Error('pairing-node-identity-invalid');
  }
  return {
    schema: PAIRING_REQUEST_SCHEMA,
    request_id: input.request_id,
    network_id: input.network_id,
    node_id: input.identity.node_id,
    identity: input.identity,
    endpoint: input.endpoint,
    requested_capabilities: capabilities,
    expires_at: input.expires_at,
  };
}

export function approvePairingRequest(input: {
  request: PairingRequest;
  human_id: string;
  approved_at: string;
  approved_capabilities: string[];
}): PairingApproval {
  requireNonEmpty(input.human_id, 'human-id-required');
  const approvedAt = requireTimestamp(input.approved_at, 'pairing-approval-time-invalid');
  const requestExpiry = requireTimestamp(input.request.expires_at, 'pairing-expiry-invalid');
  if (approvedAt > requestExpiry) throw new Error('pairing-request-expired');
  const requested = new Set(input.request.requested_capabilities);
  const approved = [...new Set(input.approved_capabilities)];
  if (approved.some((capability) => !capability.trim())) throw new Error('pairing-capability-invalid');
  if (approved.some((capability) => !requested.has(capability))) throw new Error('pairing-capability-exceeded');
  return {
    schema: PAIRING_APPROVAL_SCHEMA,
    approval_id: `${input.request.request_id}:${input.human_id}:${input.approved_at}`,
    request_id: input.request.request_id,
    network_id: input.request.network_id,
    node_id: input.request.node_id,
    human_id: input.human_id,
    approved_capabilities: approved,
    approved_at: input.approved_at,
    request_expires_at: input.request.expires_at,
  };
}

export function buildMutualTlsServerOptions(input: {
  identity: NodeIdentity;
  private_key_pem: string;
  trusted_certificates_pem: string[];
}): TlsOptions {
  return {
    key: input.private_key_pem,
    cert: input.identity.certificate_pem,
    ca: input.trusted_certificates_pem,
    requestCert: true,
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
  };
}

export function buildMutualTlsClientOptions(input: {
  identity: NodeIdentity;
  private_key_pem: string;
  trusted_certificates_pem: string[];
  host: string;
  port: number;
  server_name?: string;
}): ConnectionOptions {
  return {
    host: input.host,
    port: input.port,
    servername: input.server_name ?? input.host,
    key: input.private_key_pem,
    cert: input.identity.certificate_pem,
    ca: input.trusted_certificates_pem,
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
  };
}

export function buildNodeIdentity(input: {
  certificate_pem: string;
  display_name: string;
  agent_kind: string;
  agent_version: string;
}): NodeIdentity {
  if (!input.certificate_pem.trim()) throw new Error('certificate-pem-required');
  if (!input.display_name.trim()) throw new Error('display-name-required');
  if (!input.agent_kind.trim()) throw new Error('agent-kind-required');
  if (!input.agent_version.trim()) throw new Error('agent-version-required');
  let certificate: X509Certificate;
  try {
    certificate = new X509Certificate(input.certificate_pem);
  } catch {
    throw new Error('certificate-invalid');
  }
  const fingerprint = createHash('sha256').update(certificate.raw).digest('hex');
  return {
    schema: NODE_IDENTITY_SCHEMA,
    node_id: fingerprint,
    certificate_sha256: fingerprint,
    certificate_pem: input.certificate_pem,
    display_name: input.display_name,
    agent_kind: input.agent_kind,
    agent_version: input.agent_version,
  };
}

export function projectEnrollment(input: { identity: NodeIdentity; events: EnrollmentEvent[] }): EnrollmentProjection {
  const seen = new Set<string>();
  let status: EnrollmentProjection['status'] = 'pending';
  let capabilityCeiling: string[] = [];
  const events = input.events.map((event) => {
    if (seen.has(event.event_id)) throw new Error('enrollment-event-duplicate');
    if (event.node_id !== input.identity.node_id) throw new Error('enrollment-node-binding-mismatch');
    seen.add(event.event_id);
    if (event.type === 'human-approved') status = 'approved';
    if (event.type === 'revoked') status = 'revoked';
    if (event.type === 're-enrolled') status = 'pending';
    if (event.type === 'capability-ceiling-granted') capabilityCeiling = [...new Set(event.capabilities ?? [])];
    return { ...event, ...(event.capabilities ? { capabilities: [...event.capabilities] } : {}) };
  });
  return { schema: ENROLLMENT_PROJECTION_SCHEMA, identity: input.identity, status, capability_ceiling: capabilityCeiling, events };
}

export function evaluateCapabilityGrant(projection: EnrollmentProjection, grant: CapabilityGrant): { status: 'allowed' | 'blocked'; reason?: string; capabilities?: string[] } {
  if (grant.node_id !== projection.identity.node_id) return { status: 'blocked', reason: 'node-identity-mismatch' };
  if (projection.status === 'revoked') return { status: 'blocked', reason: 'node-revoked' };
  if (projection.status !== 'approved') return { status: 'blocked', reason: 'enrollment-not-approved' };
  const ceiling = new Set(projection.capability_ceiling);
  const unauthorized = grant.capabilities.find((capability) => !ceiling.has(capability));
  if (unauthorized) return { status: 'blocked', reason: 'capability-ceiling-exceeded' };
  return { status: 'allowed', capabilities: [...grant.capabilities] };
}
