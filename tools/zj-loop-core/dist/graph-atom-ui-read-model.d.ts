export declare const GRAPH_ATOM_UI_READ_MODEL_SCHEMA: "zj-loop.graph_atom_ui_read_model.v1";
export type GraphAtomUiVariant = 'review-ready' | 'blocked' | 'scope-drift';
export type GraphAtomUiFacts = {
    fixture_variant?: GraphAtomUiVariant;
    network_id: string;
    scope: {
        network_id: string;
        event_id: string;
        plan_id: string;
        plan_revision: number;
        plan_digest: string;
    };
    event: {
        event_id: string;
        title: string;
        created_at: string;
    };
    plan: {
        plan_id: string;
        plan_revision: number;
        plan_digest: string;
    };
    center: {
        responsibility_unit: 'human' | 'human+agent';
        human_id: string;
    };
    nodes: Array<{
        node_id: string;
        task_id: string;
        label: string;
        assigned_node: string;
        status: 'succeeded' | 'blocked';
        depends_on: string[];
        execution: {
            execution_id: string;
            execution_digest: string;
            status: 'succeeded' | 'blocked';
        };
        evidence: Array<{
            kind: string;
            digest: string;
            artifact_id: string;
        }>;
    }>;
    relay: {
        status: 'converged' | 'blocked';
        receipt_count: number;
        message_ids: string[];
    };
    aggregation: {
        status: 'passed' | 'blocked';
        aggregation_digest: string;
    };
    verification: {
        status: 'passed' | 'blocked';
        verification_digest: string;
        verifier_id: string;
    };
    review_handoff: {
        status: 'accepted' | 'blocked';
        handoff_digest: string;
        responsible_party: string;
    };
    blocking_reasons: string[];
};
export type GraphAtomUiReadModel = {
    schema: typeof GRAPH_ATOM_UI_READ_MODEL_SCHEMA;
    status: GraphAtomUiVariant;
    side_effects_executed: false;
    network_id: string;
    event: GraphAtomUiFacts['event'];
    plan: GraphAtomUiFacts['plan'];
    center: GraphAtomUiFacts['center'];
    nodes: GraphAtomUiFacts['nodes'];
    relay: GraphAtomUiFacts['relay'];
    aggregation: GraphAtomUiFacts['aggregation'];
    verification: GraphAtomUiFacts['verification'];
    review_handoff: GraphAtomUiFacts['review_handoff'];
    blocking_reasons: string[];
    next_action: {
        kind: 'human-review' | 'inspect-blocker' | 'reject-scope-drift';
        label: string;
    };
    read_model_digest: string;
};
export declare function projectGraphAtomUiReadModel(facts: GraphAtomUiFacts): GraphAtomUiReadModel;
export declare function createGraphAtomUiFixture(variant?: GraphAtomUiVariant): GraphAtomUiFacts;
