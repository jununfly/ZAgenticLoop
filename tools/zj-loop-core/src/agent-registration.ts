import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';

export const AGENT_REGISTRATION_SCHEMA = 'zj-loop.agent_registration.v1' as const;
export const AGENT_REGISTRATION_PROFILE = 'opn-agent-registration-v1-2026-08' as const;

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ID = /^[^\s]{1,256}$/;

export type AgentRegistration = {
  schema: typeof AGENT_REGISTRATION_SCHEMA;
  agent_id: string;
  display_name: string;
  capabilities: string[];
  accepted_task_kinds: string[];
  evidence_kinds: string[];
  protocol_version: string;
  identity_ref: string;
  registration_digest: string;
};

type AgentRegistrationInput = Omit<AgentRegistration, 'schema' | 'registration_digest'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredId(value: unknown, error: string): value is string {
  return typeof value === 'string' && ID.test(value) || (() => { throw new Error(error); })();
}

function requiredText(value: unknown, error: string): value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) throw new Error(error);
  return true;
}

function normalizeList(value: unknown, error: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || !ID.test(item))) throw new Error(error);
  return [...new Set(value)].sort();
}

function unsigned(value: AgentRegistration): Omit<AgentRegistration, 'registration_digest'> {
  const { registration_digest: _, ...rest } = value;
  return rest;
}

function canonical(value: unknown): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('agent-registration-canonicalization-invalid');
  return json;
}

function digest(value: Omit<AgentRegistration, 'registration_digest'>): string {
  return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`;
}

export function createAgentRegistration(input: AgentRegistrationInput): AgentRegistration {
  if (!isRecord(input)) throw new Error('agent-registration-object-invalid');
  const allowed = new Set(['agent_id', 'display_name', 'capabilities', 'accepted_task_kinds', 'evidence_kinds', 'protocol_version', 'identity_ref']);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new Error('agent-registration-field-invalid');
  requiredId(input.agent_id, 'agent-id-invalid');
  requiredText(input.display_name, 'agent-display-name-invalid');
  requiredId(input.protocol_version, 'agent-protocol-version-invalid');
  requiredId(input.identity_ref, 'agent-identity-ref-invalid');
  const candidate = {
    schema: AGENT_REGISTRATION_SCHEMA,
    agent_id: input.agent_id,
    display_name: input.display_name,
    capabilities: normalizeList(input.capabilities, 'agent-capabilities-invalid'),
    accepted_task_kinds: normalizeList(input.accepted_task_kinds, 'agent-task-kinds-invalid'),
    evidence_kinds: normalizeList(input.evidence_kinds, 'agent-evidence-kinds-invalid'),
    protocol_version: input.protocol_version,
    identity_ref: input.identity_ref,
  } satisfies Omit<AgentRegistration, 'registration_digest'>;
  return { ...candidate, registration_digest: digest(candidate) };
}

export function agentRegistrationDigest(value: AgentRegistration): string {
  return digest(unsigned(value));
}

export function validateAgentRegistration(value: unknown): { status: 'valid' } | { status: 'blocked'; reason: string } {
  if (!isRecord(value)) return { status: 'blocked', reason: 'agent-registration-object-invalid' };
  const allowed = new Set(['schema', 'agent_id', 'display_name', 'capabilities', 'accepted_task_kinds', 'evidence_kinds', 'protocol_version', 'identity_ref', 'registration_digest']);
  if (Object.keys(value).some((key) => !allowed.has(key))) return { status: 'blocked', reason: 'agent-registration-field-invalid' };
  if (value.schema !== AGENT_REGISTRATION_SCHEMA) return { status: 'blocked', reason: 'agent-registration-schema-invalid' };
  try {
    const item = value as AgentRegistration;
    requiredId(item.agent_id, 'agent-id-invalid');
    requiredText(item.display_name, 'agent-display-name-invalid');
    requiredId(item.protocol_version, 'agent-protocol-version-invalid');
    requiredId(item.identity_ref, 'agent-identity-ref-invalid');
    const capabilities = normalizeList(item.capabilities, 'agent-capabilities-invalid');
    const taskKinds = normalizeList(item.accepted_task_kinds, 'agent-task-kinds-invalid');
    const evidenceKinds = normalizeList(item.evidence_kinds, 'agent-evidence-kinds-invalid');
    if (JSON.stringify(capabilities) !== JSON.stringify(item.capabilities) || JSON.stringify(taskKinds) !== JSON.stringify(item.accepted_task_kinds) || JSON.stringify(evidenceKinds) !== JSON.stringify(item.evidence_kinds)) return { status: 'blocked', reason: 'agent-registration-normalization-invalid' };
    if (typeof item.registration_digest !== 'string' || !DIGEST.test(item.registration_digest) || item.registration_digest !== agentRegistrationDigest(item)) return { status: 'blocked', reason: 'agent-registration-digest-invalid' };
    return { status: 'valid' };
  } catch (error) {
    return { status: 'blocked', reason: error instanceof Error ? error.message : 'agent-registration-invalid' };
  }
}
