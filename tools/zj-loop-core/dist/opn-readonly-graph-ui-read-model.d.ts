import { type OpnReadOnlyGraphAtomResult, type OpnReadOnlyGraphAtomStartResult } from './opn-readonly-graph-atom.js';
export declare const OPN_READ_ONLY_GRAPH_UI_READ_MODEL_SCHEMA: "zj-loop.opn_read_only_graph_ui_read_model.v1";
type Digest = `sha256:${string}`;
type UiStatus = 'awaiting-verification' | 'pending-human-review' | 'approved' | 'rejected' | 'blocked' | 'outcome-uncertain';
export type OpnReadOnlyGraphUiReadModel = {
    schema: typeof OPN_READ_ONLY_GRAPH_UI_READ_MODEL_SCHEMA;
    status: UiStatus;
    side_effects_executed: false;
    graph_id: string;
    network_id: string;
    plan_digest: Digest;
    phases: OpnReadOnlyGraphAtomResult['phases'];
    source_evidence_ref?: Digest;
    verification_evidence_ref?: Digest;
    verification_request?: {
        message_id: string;
        target_node_id: string;
        envelope_digest: Digest;
    };
    decision?: {
        decision: 'approved' | 'rejected';
        reason: string;
        human_id: string;
    };
    blocking_reasons: string[];
    next_action: {
        kind: 'wait-agent2' | 'human-review' | 'done' | 'inspect-blocker';
        label: string;
    };
    read_model_digest: Digest;
};
export declare function projectOpnReadOnlyGraphUiReadModel(input: {
    graph_id: string;
    network_id: string;
    result: OpnReadOnlyGraphAtomStartResult;
}): OpnReadOnlyGraphUiReadModel;
export {};
