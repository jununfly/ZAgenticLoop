import { createHash, X509Certificate } from 'node:crypto';
import type { ConnectionOptions, TlsOptions } from 'node:tls';

export const NODE_IDENTITY_SCHEMA = 'zj-loop.node_identity.v1' as const;
export const ENROLLMENT_PROJECTION_SCHEMA = 'zj-loop.enrollment_projection.v1' as const;

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
