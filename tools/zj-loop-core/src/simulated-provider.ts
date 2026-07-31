import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { createProviderOutcome, type ProviderOutcome, type ProviderOutcomeKind } from './provider-outcome.js';

export const SIMULATED_PROVIDER_RESULT_SCHEMA = 'zj-loop.simulated_provider_result.v1' as const;
export type SimulatedProviderScenario =
  | { outcome: 'confirmed-success'; virtual_side_effects: string[] }
  | { outcome: 'confirmed-failure-no-side-effect'; failure_reason: string }
  | { outcome: 'partial-success'; completed_resource_scope: string[]; incomplete_resource_scope: string[] }
  | { outcome: 'outcome-uncertain'; reason: string; allowed_queries?: string[]; forbidden_actions?: string[]; max_queries?: number; max_cost?: number; deadline: string };
export type SimulatedProviderRequest = {
  network_id: string;
  event_id: string;
  plan_id: string;
  plan_revision: number;
  execution_id: string;
  task_id: string;
  provider_request_id: string;
  request_digest: string;
  resource_scope: string[];
  observed_at: string;
  scenario: SimulatedProviderScenario;
};
export type SimulatedProviderResult = {
  schema: typeof SIMULATED_PROVIDER_RESULT_SCHEMA;
  status: 'recorded' | 'duplicate' | 'blocked';
  outcome?: ProviderOutcome;
  provider_kind: 'simulated';
  provider_id: string;
  fixture_state_digest: string;
  virtual_side_effects: string[];
  real_provider_calls: 0;
  side_effects_executed: false;
  reason?: string;
};

function digest(value: unknown): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('simulated-provider-canonicalization-invalid');
  return `sha256:${createHash('sha256').update(json).digest('hex')}`;
}
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function scope(value: unknown): value is string[] { return Array.isArray(value) && value.every(text); }
function requestScope(input: SimulatedProviderRequest): string { return `${input.network_id}:${input.event_id}:${input.plan_id}:${input.plan_revision}:${input.execution_id}:${input.task_id}:${input.provider_request_id}`; }

export function createSimulatedProvider(input: { provider_id: string; namespace: string }): { execute(request: SimulatedProviderRequest): Promise<SimulatedProviderResult>; reset(): void } {
  if (!text(input.provider_id) || !text(input.namespace)) throw new Error('simulated-provider-identity-invalid');
  const requests = new Map<string, { request_digest: string; outcome: ProviderOutcome; virtual_side_effects: string[] }>();
  const fixtureState = new Map<string, string[]>();
  const stateDigest = (): string => digest([...fixtureState.entries()].sort(([left], [right]) => left.localeCompare(right)));
  const blocked = (reason: string): SimulatedProviderResult => ({ schema: SIMULATED_PROVIDER_RESULT_SCHEMA, status: 'blocked', provider_kind: 'simulated', provider_id: input.provider_id, fixture_state_digest: stateDigest(), virtual_side_effects: [], real_provider_calls: 0, side_effects_executed: false, reason });

  return {
    async execute(request) {
      if (!text(request.network_id) || !text(request.event_id) || !text(request.plan_id) || !Number.isInteger(request.plan_revision) || request.plan_revision < 1 || !text(request.execution_id) || !text(request.task_id) || !text(request.provider_request_id) || !text(request.request_digest) || !scope(request.resource_scope) || !text(request.observed_at)) return blocked('request-invalid');
      const key = requestScope(request);
      const existing = requests.get(key);
      if (existing) {
        if (existing.request_digest !== request.request_digest) return blocked('provider-request-conflict');
        return { schema: SIMULATED_PROVIDER_RESULT_SCHEMA, status: 'duplicate', outcome: existing.outcome, provider_kind: 'simulated', provider_id: input.provider_id, fixture_state_digest: stateDigest(), virtual_side_effects: [...existing.virtual_side_effects], real_provider_calls: 0, side_effects_executed: false };
      }
      const response_digest = digest({ namespace: input.namespace, request_digest: request.request_digest, scenario: request.scenario });
      const scenario = request.scenario;
      let kind: ProviderOutcomeKind;
      let evidence: ProviderOutcome['evidence'];
      let virtualSideEffects: string[] = [];
      let sideEffectsExecuted = false;
      if (scenario.outcome === 'confirmed-success') {
        kind = scenario.outcome;
        virtualSideEffects = [...new Set(scenario.virtual_side_effects)].sort();
        evidence = { kind: 'receipt', receipt_id: `sim-receipt:${key}`, receipt_digest: digest({ response_digest, virtual_side_effects: virtualSideEffects }) };
        sideEffectsExecuted = virtualSideEffects.length > 0;
      } else if (scenario.outcome === 'confirmed-failure-no-side-effect') {
        kind = scenario.outcome;
        evidence = { kind: 'no-side-effect-proof', proof_id: `sim-proof:${key}`, proof_digest: digest({ response_digest, failure_reason: scenario.failure_reason, virtual_side_effects: [] }) };
      } else if (scenario.outcome === 'partial-success') {
        kind = scenario.outcome;
        const completed = [...new Set(scenario.completed_resource_scope)].sort();
        const incomplete = [...new Set(scenario.incomplete_resource_scope)].sort();
        virtualSideEffects = completed.map((resource) => `virtual:${resource}`);
        evidence = { kind: 'partial-observation', completed_resource_scope: completed, incomplete_resource_scope: incomplete, observation_digest: digest({ response_digest, completed, incomplete }) };
        sideEffectsExecuted = completed.length > 0;
      } else {
        kind = scenario.outcome;
        evidence = { kind: 'uncertainty', reason: scenario.reason, last_known_fact_digest: digest({ response_digest, fixture_state: [...fixtureState.entries()] }), frozen_resource_scope: [...request.resource_scope].sort(), allowed_queries: [...new Set(scenario.allowed_queries ?? ['provider.read'])].sort(), forbidden_actions: [...new Set(scenario.forbidden_actions ?? ['provider.write', 'retry-with-new-request-id'])].sort(), reconciliation_budget: { max_queries: scenario.max_queries ?? 3, deadline: scenario.deadline, query_scope: [...request.resource_scope].sort(), max_cost: scenario.max_cost ?? 1 } };
      }
      const outcome = createProviderOutcome({ network_id: request.network_id, event_id: request.event_id, plan_id: request.plan_id, plan_revision: request.plan_revision, execution_id: request.execution_id, task_id: request.task_id, provider_id: input.provider_id, provider_kind: 'simulated', provider_request_id: request.provider_request_id, request_digest: request.request_digest, response_digest, resource_scope: [...request.resource_scope].sort(), observed_at: request.observed_at, side_effects_executed: sideEffectsExecuted, outcome: kind, evidence });
      if (virtualSideEffects.length > 0) fixtureState.set(key, virtualSideEffects);
      requests.set(key, { request_digest: request.request_digest, outcome, virtual_side_effects: virtualSideEffects });
      return { schema: SIMULATED_PROVIDER_RESULT_SCHEMA, status: 'recorded', outcome, provider_kind: 'simulated', provider_id: input.provider_id, fixture_state_digest: stateDigest(), virtual_side_effects: [...virtualSideEffects], real_provider_calls: 0, side_effects_executed: false };
    },
    reset() { requests.clear(); fixtureState.clear(); },
  };
}
