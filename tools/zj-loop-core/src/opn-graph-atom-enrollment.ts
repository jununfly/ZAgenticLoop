import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { agentRegistrationDigest, validateAgentRegistration, type AgentRegistration } from './agent-registration.js';

export const OPN_GRAPH_ATOM_ENROLLMENT_SCHEMA = 'zj-loop.opn_graph_atom_enrollment.v1' as const;

export type GraphAtomCenter = { responsibility_unit: 'human' | 'human+agent'; human_id: string; center_agent_id?: string };
export type GraphAtomAgentEnrollment = { node_id: string; device_id: string; network_id: string; status: 'approved'; capability_ceiling: string[]; registration: AgentRegistration; registration_digest: string };
export type OpnGraphAtomEnrollmentSnapshot = {
  schema: typeof OPN_GRAPH_ATOM_ENROLLMENT_SCHEMA;
  graph_id: string;
  network_id: string;
  device_id: string;
  center: GraphAtomCenter;
  agents: GraphAtomAgentEnrollment[];
  status: 'ready';
  snapshot_digest: string;
};

function text(value: unknown): value is string { return typeof value === 'string' && value.trim() !== '' && !value.includes('\0'); }
function canonical(value: unknown): string { const result = canonicalize(value); if (typeof result !== 'string') throw new Error('graph-atom-enrollment-canonicalization-invalid'); return result; }
function digest(value: unknown): string { return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`; }
function unsigned(value: OpnGraphAtomEnrollmentSnapshot): Omit<OpnGraphAtomEnrollmentSnapshot, 'snapshot_digest'> { const { snapshot_digest: _, ...rest } = value; return rest; }

function validateCore(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'graph-atom-enrollment-object-invalid';
  const item = value as Record<string, unknown>;
  if (item.schema !== OPN_GRAPH_ATOM_ENROLLMENT_SCHEMA || !text(item.graph_id) || !text(item.network_id) || !text(item.device_id) || item.status !== 'ready' || !item.center || typeof item.center !== 'object' || !Array.isArray(item.agents) || item.agents.length < 2) return 'graph-atom-enrollment-shape-invalid';
  const center = item.center as Record<string, unknown>;
  if ((center.responsibility_unit !== 'human' && center.responsibility_unit !== 'human+agent') || !text(center.human_id) || (center.responsibility_unit === 'human+agent' && !text(center.center_agent_id)) || (center.responsibility_unit === 'human' && center.center_agent_id !== undefined)) return 'center-responsibility-invalid';
  const ids = new Set<string>();
  for (const candidate of item.agents) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return 'agent-enrollment-shape-invalid';
    const agent = candidate as Record<string, unknown>;
    if (!text(agent.node_id) || !text(agent.device_id) || !text(agent.network_id) || agent.status !== 'approved' || !Array.isArray(agent.capability_ceiling) || !agent.capability_ceiling.every(text) || !agent.registration || typeof agent.registration !== 'object' || !text(agent.registration_digest)) return 'agent-enrollment-shape-invalid';
    if (agent.network_id !== item.network_id) return 'agent-network-mismatch';
    if (agent.device_id !== item.device_id) return 'agent-device-mismatch';
    if (ids.has(agent.node_id)) return 'agent-node-duplicate';
    ids.add(agent.node_id);
    const registration = agent.registration as AgentRegistration;
    if (validateAgentRegistration(registration).status === 'blocked') return 'agent-registration-invalid';
    if (registration.identity_ref !== agent.node_id) return 'agent-registration-identity-mismatch';
    if (agent.registration_digest !== agentRegistrationDigest(registration)) return 'agent-registration-digest-mismatch';
  }
  if (center.responsibility_unit === 'human+agent' && !ids.has(center.center_agent_id as string)) return 'center-agent-not-enrolled';
  if (typeof item.snapshot_digest !== 'string' || item.snapshot_digest !== digest(unsigned(item as OpnGraphAtomEnrollmentSnapshot))) return 'graph-atom-enrollment-digest-invalid';
  return null;
}

export function createOpnGraphAtomEnrollmentSnapshot(input: { graph_id: string; network_id: string; device_id: string; center: GraphAtomCenter; agents: Array<{ node_id: string; device_id: string; network_id: string; status: 'approved' | 'pending' | 'revoked'; capability_ceiling: string[]; registration: AgentRegistration }> }): OpnGraphAtomEnrollmentSnapshot {
  if (input.agents.some((agent) => agent.status !== 'approved')) throw new Error('agent-enrollment-not-approved');
  const agents = input.agents.map((agent) => ({ ...agent, status: 'approved' as const, registration_digest: agentRegistrationDigest(agent.registration) }));
  const snapshot = { schema: OPN_GRAPH_ATOM_ENROLLMENT_SCHEMA, graph_id: input.graph_id, network_id: input.network_id, device_id: input.device_id, center: { ...input.center }, agents, status: 'ready' as const };
  const reason = validateCore({ ...snapshot, snapshot_digest: digest(snapshot) });
  if (reason) throw new Error(reason);
  return Object.freeze({ ...snapshot, snapshot_digest: digest(snapshot) });
}

export function validateOpnGraphAtomEnrollmentSnapshot(value: unknown): { status: 'valid'; snapshot: OpnGraphAtomEnrollmentSnapshot } | { status: 'blocked'; reason: string } {
  const reason = validateCore(value);
  return reason ? { status: 'blocked', reason } : { status: 'valid', snapshot: structuredClone(value) as OpnGraphAtomEnrollmentSnapshot };
}
