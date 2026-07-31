import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';

export const AGENT_REVIEW_HANDOFF_SCHEMA = 'zj-loop.agent_review_handoff.v1' as const;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ID = /^[^\s]{1,256}$/;
export type AgentReviewHandoff = { schema: typeof AGENT_REVIEW_HANDOFF_SCHEMA; status: 'review-pending'; execution_id: string; task_id: string; attempt: number; agent_id: string; evidence_refs: string[]; recommendation: 'accept' | 'reject' | 'needs-more-work'; recommendation_reason: string; risks: string[]; side_effects_executed: false; handoff_digest: string };
function id(value: unknown): value is string { return typeof value === 'string' && ID.test(value); }
function digest(value: unknown): value is string { return typeof value === 'string' && DIGEST.test(value); }
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= 4096; }
function calculate(value: Omit<AgentReviewHandoff, 'handoff_digest'>): string { const json = canonicalize(value); if (typeof json !== 'string') throw new Error('agent-review-handoff-canonicalization-invalid'); return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`; }
export function createAgentReviewHandoff(input: Omit<AgentReviewHandoff, 'schema' | 'status' | 'side_effects_executed' | 'handoff_digest'>): AgentReviewHandoff {
  if (!id(input.execution_id) || !id(input.task_id) || !id(input.agent_id) || !Number.isInteger(input.attempt) || input.attempt < 1 || !Array.isArray(input.evidence_refs) || input.evidence_refs.length === 0 || !input.evidence_refs.every(digest) || !['accept', 'reject', 'needs-more-work'].includes(input.recommendation) || !text(input.recommendation_reason) || !Array.isArray(input.risks) || !input.risks.every(text)) throw new Error('agent-review-handoff-input-invalid');
  const value = { schema: AGENT_REVIEW_HANDOFF_SCHEMA, status: 'review-pending' as const, execution_id: input.execution_id, task_id: input.task_id, attempt: input.attempt, agent_id: input.agent_id, evidence_refs: [...new Set(input.evidence_refs)].sort(), recommendation: input.recommendation, recommendation_reason: input.recommendation_reason, risks: [...new Set(input.risks)].sort(), side_effects_executed: false as const } satisfies Omit<AgentReviewHandoff, 'handoff_digest'>;
  return { ...value, handoff_digest: calculate(value) };
}
export function validateAgentReviewHandoff(value: unknown): { status: 'valid' } | { status: 'blocked'; reason: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'blocked', reason: 'agent-review-handoff-object-invalid' };
  const item = value as AgentReviewHandoff;
  if (item.status !== 'review-pending' || item.schema !== AGENT_REVIEW_HANDOFF_SCHEMA || item.side_effects_executed !== false || typeof item.handoff_digest !== 'string' || item.handoff_digest !== calculate({ ...item, handoff_digest: undefined } as Omit<AgentReviewHandoff, 'handoff_digest'>)) return { status: 'blocked', reason: 'agent-review-handoff-invalid' };
  return { status: 'valid' };
}
