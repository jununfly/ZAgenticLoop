import { sha256CanonicalJson } from './sqlite-state-store.js';

export const DUAL_AGENT_ENROLLMENT_EVIDENCE_SCHEMA = 'zj-loop.dual_agent_enrollment_evidence.v1' as const;

export type DualAgentEnrollmentEvidence = {
  schema: typeof DUAL_AGENT_ENROLLMENT_EVIDENCE_SCHEMA;
  fixture_version: string;
  network_id: string;
  status: 'passed' | 'blocked';
  side_effects_executed: false;
  nodes: Array<{ role: 'codex' | 'workbuddy'; node_id: string; certificate_sha256: string; agent_kind: string; status: string }>;
  scenarios: Array<{ name: string; status: 'passed' | 'blocked'; reason?: string }>;
  state_store: { revision: number; event_count: number; event_digests: string[] };
  created_at: string;
};

export function buildDualAgentEnrollmentEvidence(input: {
  network_id: string;
  fixture_version: string;
  nodes: DualAgentEnrollmentEvidence['nodes'];
  scenarios: DualAgentEnrollmentEvidence['scenarios'];
  state_store: { revision: number; event_count: number; event_digests: string[] };
  created_at: string;
}): DualAgentEnrollmentEvidence {
  if (!input.network_id.trim()) throw new Error('evidence-network-id-required');
  if (!input.fixture_version.trim()) throw new Error('evidence-fixture-version-required');
  if (!Number.isInteger(input.state_store.revision) || input.state_store.revision < 1) throw new Error('evidence-revision-invalid');
  if (!Number.isInteger(input.state_store.event_count) || input.state_store.event_count < 1) throw new Error('evidence-event-count-invalid');
  const status = input.scenarios.every((scenario) => scenario.status === 'passed') ? 'passed' : 'blocked';
  return {
    schema: DUAL_AGENT_ENROLLMENT_EVIDENCE_SCHEMA,
    fixture_version: input.fixture_version,
    network_id: input.network_id,
    status,
    side_effects_executed: false,
    nodes: input.nodes.map((node) => ({ ...node })),
    scenarios: input.scenarios.map((scenario) => ({ ...scenario })),
    state_store: { revision: input.state_store.revision, event_count: input.state_store.event_count, event_digests: [...input.state_store.event_digests] },
    created_at: input.created_at,
  };
}

export function dualAgentEnrollmentEvidenceDigest(evidence: DualAgentEnrollmentEvidence): string {
  return sha256CanonicalJson(evidence);
}
