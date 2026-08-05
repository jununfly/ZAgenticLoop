import { runRealAgentDogfoodGraphConformance } from './real-agent-dogfood-conformance.js';
import { REAL_AGENT_DOGFOOD_GRAPH_PHASES } from './real-agent-dogfood-graph-orchestrator.js';
import { appendRealAgentDogfoodGraphPhaseRecord, projectRealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
export async function createRealAgentDogfoodGraphConformanceCoordinator(input) {
    if (!input.network_id.trim())
        throw new Error('graph-conformance-coordinator-network-id-required');
    const snapshot = await input.state_store.readEvents({ network_id: input.network_id, aggregate_type: 'real-agent-dogfood-graph', aggregate_id: input.plan.dogfood_id });
    let projected;
    try {
        projected = projectRealAgentDogfoodGraphPhaseRecord({ plan: input.plan, events: snapshot.events });
    }
    catch {
        throw new Error('graph-conformance-coordinator-existing-state-invalid');
    }
    const completed = projected?.completed_phases ?? [];
    const historyEvidence = {};
    for (const event of snapshot.events) {
        const record = event.payload;
        const evidence = record.evidence_refs?.[0] ?? record.evidence_digest;
        if (DIGEST.test(evidence ?? ''))
            historyEvidence[record.phase] = evidence;
    }
    let expectedRevision = snapshot.snapshot_revision;
    return {
        async run() {
            const phaseAdapters = Object.fromEntries(REAL_AGENT_DOGFOOD_GRAPH_PHASES.map((phase) => [phase, async () => {
                    const result = await input.adapters[phase]();
                    if (result.record && (result.record.phase !== phase || result.record.network_id !== input.network_id || result.record.plan_digest !== input.plan.plan_digest))
                        return { status: 'outcome-uncertain', reason: 'graph-phase-record-binding-invalid' };
                    if (result.status === 'passed' && (!result.record || !DIGEST.test(result.evidence_digest ?? result.record.evidence_digest ?? '')))
                        return { status: 'outcome-uncertain', reason: 'phase-evidence-required' };
                    if (result.status !== 'passed' && !result.record)
                        return result;
                    if (!result.record)
                        return { status: 'outcome-uncertain', reason: 'graph-phase-record-required' };
                    const appended = await appendRealAgentDogfoodGraphPhaseRecord({ stateStore: input.state_store, plan: input.plan, network_id: input.network_id, record: result.record, expected_revision: expectedRevision });
                    if (appended.status === 'conflict' || appended.revision === undefined)
                        return { status: 'outcome-uncertain', reason: 'graph-phase-append-conflict' };
                    expectedRevision = appended.revision;
                    historyEvidence[phase] = result.evidence_digest ?? result.record.evidence_digest ?? result.record.evidence_refs?.[0];
                    return { status: result.status, reason: result.reason, evidence_digest: historyEvidence[phase] };
                }]));
            return runRealAgentDogfoodGraphConformance({ plan: input.plan, stages: phaseAdapters, replay: input.replay, completed_phases: completed, phase_evidence: historyEvidence });
        },
    };
}
