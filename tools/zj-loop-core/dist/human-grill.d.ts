export declare const HUMAN_GRILL_SCHEMA: "zj-loop.human_grill.v1";
export declare const HUMAN_GRILL_DECISION_SCHEMA: "zj-loop.human_grill_decision.v1";
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
export declare function createHumanGrill(input: Omit<HumanGrill, 'schema' | 'side_effects_executed' | 'resume_requires_repreflight'>): HumanGrill;
export declare function createHumanGrillCoordinator(input: {
    grill: HumanGrill;
}): {
    submitDecision(decision: HumanGrillDecisionInput): HumanGrillDecisionResult;
    getDecision(): HumanGrillDecision | null;
};
