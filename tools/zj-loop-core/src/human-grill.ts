export const HUMAN_GRILL_SCHEMA = 'zj-loop.human_grill.v1' as const;
export const HUMAN_GRILL_DECISION_SCHEMA = 'zj-loop.human_grill_decision.v1' as const;

export type HumanGrillCandidateStrategy = {
  strategy_id: string;
  summary: string;
};

export type HumanGrill = {
  schema: typeof HUMAN_GRILL_SCHEMA;
  grill_id: string;
  event_id: string;
  plan_id: string;
  plan_revision: number;
  reason_code: string;
  known_facts: string[];
  unknowns_or_conflicts: string[];
  affected_tasks: string[];
  affected_resources: string[];
  candidate_strategies: HumanGrillCandidateStrategy[];
  recommended_strategy: string;
  risks_and_tradeoffs: string[];
  requested_human_decision: string;
  decision_options: string[];
  side_effects_executed: false;
  resume_requires_repreflight: true;
};

export type HumanGrillDecisionInput = {
  grill_id: string;
  event_id: string;
  plan_id: string;
  plan_revision: number;
  decision: string;
  decision_digest: string;
  human_id: string;
  device_id: string;
  session_id: string;
  authentication_method: string;
  decided_at: string;
  side_effects_executed: false;
  signature?: unknown;
};

export type HumanGrillDecision = HumanGrillDecisionInput & {
  schema: typeof HUMAN_GRILL_DECISION_SCHEMA;
};

export type HumanGrillDecisionResult = {
  schema: typeof HUMAN_GRILL_DECISION_SCHEMA;
  status: 'accepted' | 'duplicate' | 'conflict' | 'stale-decision';
  lifecycle_status: 'decision-recorded';
  decision?: HumanGrillDecision;
  current_decision?: HumanGrillDecision;
  side_effects_executed: false;
};

function text(value: unknown, error: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(error);
  return value;
}

function strings(value: unknown, error: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) throw new Error(error);
  return [...value];
}

function positiveRevision(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1) throw new Error('human-grill-plan-revision-invalid');
  return value as number;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createHumanGrill(input: Omit<HumanGrill, 'schema' | 'side_effects_executed' | 'resume_requires_repreflight'>): HumanGrill {
  const candidateStrategies = input.candidate_strategies;
  if (!Array.isArray(candidateStrategies) || candidateStrategies.some((candidate) => !candidate || typeof candidate !== 'object')) throw new Error('human-grill-candidate-strategies-invalid');
  for (const candidate of candidateStrategies) {
    text(candidate.strategy_id, 'human-grill-strategy-id-required');
    text(candidate.summary, 'human-grill-strategy-summary-required');
  }
  const result: HumanGrill = {
    schema: HUMAN_GRILL_SCHEMA,
    grill_id: text(input.grill_id, 'human-grill-id-required'),
    event_id: text(input.event_id, 'human-grill-event-id-required'),
    plan_id: text(input.plan_id, 'human-grill-plan-id-required'),
    plan_revision: positiveRevision(input.plan_revision),
    reason_code: text(input.reason_code, 'human-grill-reason-required'),
    known_facts: strings(input.known_facts, 'human-grill-known-facts-invalid'),
    unknowns_or_conflicts: strings(input.unknowns_or_conflicts, 'human-grill-unknowns-invalid'),
    affected_tasks: strings(input.affected_tasks, 'human-grill-affected-tasks-invalid'),
    affected_resources: strings(input.affected_resources, 'human-grill-affected-resources-invalid'),
    candidate_strategies: candidateStrategies.map((candidate) => ({ strategy_id: text(candidate.strategy_id, 'human-grill-strategy-id-required'), summary: text(candidate.summary, 'human-grill-strategy-summary-required') })),
    recommended_strategy: text(input.recommended_strategy, 'human-grill-recommended-strategy-required'),
    risks_and_tradeoffs: strings(input.risks_and_tradeoffs, 'human-grill-risks-invalid'),
    requested_human_decision: text(input.requested_human_decision, 'human-grill-request-required'),
    decision_options: strings(input.decision_options, 'human-grill-decision-options-invalid'),
    side_effects_executed: false,
    resume_requires_repreflight: true,
  };
  if (!result.candidate_strategies.some((candidate) => candidate.strategy_id === result.recommended_strategy)) throw new Error('human-grill-recommended-strategy-unknown');
  return result;
}

function normalizeDecision(input: HumanGrillDecisionInput): HumanGrillDecision {
  if (input.side_effects_executed !== false) throw new Error('human-grill-side-effects-invalid');
  const result: HumanGrillDecision = {
    schema: HUMAN_GRILL_DECISION_SCHEMA,
    grill_id: text(input.grill_id, 'human-grill-decision-grill-id-required'),
    event_id: text(input.event_id, 'human-grill-decision-event-id-required'),
    plan_id: text(input.plan_id, 'human-grill-decision-plan-id-required'),
    plan_revision: positiveRevision(input.plan_revision),
    decision: text(input.decision, 'human-grill-decision-required'),
    decision_digest: text(input.decision_digest, 'human-grill-decision-digest-required'),
    human_id: text(input.human_id, 'human-grill-human-id-required'),
    device_id: text(input.device_id, 'human-grill-device-id-required'),
    session_id: text(input.session_id, 'human-grill-session-id-required'),
    authentication_method: text(input.authentication_method, 'human-grill-authentication-method-required'),
    decided_at: text(input.decided_at, 'human-grill-decided-at-required'),
    side_effects_executed: false,
    ...(input.signature === undefined ? {} : { signature: clone(input.signature) }),
  };
  return result;
}

export function createHumanGrillCoordinator(input: { grill: HumanGrill }): {
  submitDecision(decision: HumanGrillDecisionInput): HumanGrillDecisionResult;
  getDecision(): HumanGrillDecision | null;
} {
  const grill = clone(input.grill);
  let winner: HumanGrillDecision | null = null;
  return {
    submitDecision(rawDecision) {
      const decision = normalizeDecision(rawDecision);
      if (decision.grill_id !== grill.grill_id || decision.event_id !== grill.event_id || decision.plan_id !== grill.plan_id) throw new Error('human-grill-decision-binding-invalid');
      if (decision.plan_revision !== grill.plan_revision) return { schema: HUMAN_GRILL_DECISION_SCHEMA, status: 'stale-decision', lifecycle_status: 'decision-recorded', side_effects_executed: false };
      if (!grill.decision_options.includes(decision.decision)) throw new Error('human-grill-decision-option-invalid');
      if (winner) {
        const status = winner.decision_digest === decision.decision_digest ? 'duplicate' : 'conflict';
        return { schema: HUMAN_GRILL_DECISION_SCHEMA, status, lifecycle_status: 'decision-recorded', current_decision: clone(winner), side_effects_executed: false };
      }
      winner = decision;
      return { schema: HUMAN_GRILL_DECISION_SCHEMA, status: 'accepted', lifecycle_status: 'decision-recorded', decision: clone(decision), side_effects_executed: false };
    },
    getDecision() {
      return winner ? clone(winner) : null;
    },
  };
}
