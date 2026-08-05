import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { projectRealAgentDogfoodLifecycle } from './real-agent-dogfood-lifecycle.js';
import { projectRealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
import { REAL_AGENT_DOGFOOD_GRAPH_PHASES } from './real-agent-dogfood-graph-orchestrator.js';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const FAILURE_CLASSES = new Set(['known-rejection', 'unverifiable-cleanup', 'unverifiable-evidence', 'provider-timeout']);
function canonical(value) {
    const json = canonicalize(value);
    if (typeof json !== 'string')
        throw new Error('real-agent-dogfood-replay-canonicalization-invalid');
    return json;
}
function modelDigest(value) {
    return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`;
}
function scopeFailure(parsed, input) {
    if (!parsed || typeof parsed !== 'object')
        return null;
    const value = parsed;
    const checks = [
        ['network-id', value.network_id, input.network_id],
        ['dogfood-id', value.dogfood_id, input.dogfood_id],
        ['execution-id', value.execution_id, input.execution_id],
        ['attempt', value.attempt, input.attempt],
        ['plan-digest', value.plan_digest, input.plan_digest],
    ];
    for (const [name, observed, expected] of checks)
        if (observed !== undefined && observed !== expected)
            return `evidence-${name}-mismatch`;
    return null;
}
export async function replayRealAgentDogfoodGraphReadModel(input) {
    if (!input.network_id.trim())
        throw new Error('real-agent-dogfood-replay-network-id-required');
    const plan = input.plan;
    if (plan.dogfood_id === '' || plan.execution_id === '')
        throw new Error('real-agent-dogfood-replay-plan-invalid');
    const lifecycle = projectRealAgentDogfoodLifecycle([...input.lifecycle_events]);
    if (lifecycle.network_id !== input.network_id || lifecycle.dogfood_id !== plan.dogfood_id || lifecycle.execution_id !== plan.execution_id || lifecycle.attempt !== plan.attempt) {
        throw new Error('real-agent-dogfood-replay-scope-mismatch');
    }
    const phase = projectRealAgentDogfoodGraphPhaseRecord({ plan, events: input.graph_events });
    const failures = [];
    if (!phase)
        failures.push('graph-phase-missing');
    const refs = [...new Set(phase?.evidence_refs ?? [])].sort();
    if (phase?.status === 'passed' && refs.length === 0)
        failures.push('phase-evidence-missing');
    for (const ref of refs) {
        try {
            const content = await input.evidenceStore.readOnly({ digest: ref });
            let parsed;
            try {
                parsed = JSON.parse(content.toString('utf8'));
            }
            catch {
                parsed = null;
            }
            const failure = scopeFailure(parsed, { network_id: input.network_id, dogfood_id: plan.dogfood_id, execution_id: plan.execution_id, attempt: plan.attempt, plan_digest: plan.plan_digest });
            if (failure)
                failures.push(failure);
        }
        catch (error) {
            failures.push(error instanceof Error && error.message === 'evidence-digest-drift' ? `evidence-digest-drift:${ref}` : `evidence-missing:${ref}`);
        }
    }
    const status = failures.length > 0 ? 'outcome-uncertain' : phase?.status === 'blocked' ? 'blocked' : phase?.status === 'outcome-uncertain' ? 'outcome-uncertain' : lifecycle.status === 'accepted' && phase?.completed_phases.at(-1) === 'cleanup' ? 'passed' : 'in-progress';
    const unsigned = {
        schema: 'zj-loop.real_agent_dogfood_graph_replay.v1',
        status,
        integrity_status: failures.length > 0 ? 'incomplete' : 'complete',
        network_id: input.network_id,
        dogfood_id: plan.dogfood_id,
        execution_id: plan.execution_id,
        attempt: plan.attempt,
        plan_digest: plan.plan_digest,
        plan_definition_digest: plan.plan_definition_digest,
        lifecycle: { status: lifecycle.status, reason_code: lifecycle.reason_code, next_action: lifecycle.next_action, lifecycle_digest: lifecycle.lifecycle_digest },
        graph: { current_phase: phase?.phase ?? null, phase_status: phase?.status ?? null, completed_phases: phase?.completed_phases ?? [], next_phase: REAL_AGENT_DOGFOOD_GRAPH_PHASES[phase?.completed_phases.length ?? 0] ?? null, evidence_refs: refs },
        integrity_failures: [...new Set(failures)].sort(),
    };
    return Object.freeze({ ...unsigned, read_model_digest: modelDigest(unsigned) });
}
export function classifyRealAgentDogfoodFailure(failure) {
    if (!FAILURE_CLASSES.has(failure))
        throw new Error('real-agent-dogfood-failure-class-invalid');
    return { status: failure.startsWith('unverifiable-') ? 'outcome-uncertain' : 'blocked', reason_code: failure };
}
export function replayRealAgentDogfoodAttempt(input) {
    if (!input || !input.execution_id.trim() || !Number.isInteger(input.attempt) || input.attempt < 1 || !DIGEST.test(input.result_digest))
        throw new Error('real-agent-dogfood-replay-input-invalid');
    if (!input.prior)
        return { status: 'recorded', execution_id: input.execution_id, attempt: input.attempt, result_digest: input.result_digest };
    if (input.attempt === input.prior.attempt && input.execution_id === input.prior.execution_id) {
        return input.result_digest === input.prior.result_digest ? { status: 'idempotent', execution_id: input.execution_id, attempt: input.attempt } : { status: 'conflict', reason_code: 'attempt-digest-conflict' };
    }
    if (input.attempt <= input.prior.attempt)
        throw new Error('real-agent-dogfood-retry-attempt-invalid');
    if (input.execution_id === input.prior.execution_id)
        throw new Error('real-agent-dogfood-retry-execution-binding-invalid');
    return { status: 'new-attempt', execution_id: input.execution_id, attempt: input.attempt };
}
