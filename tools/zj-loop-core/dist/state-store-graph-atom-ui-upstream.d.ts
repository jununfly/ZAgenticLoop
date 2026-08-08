import type { GraphAtomUiReadModel } from './graph-atom-ui-read-model.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
import type { HumanSigner } from './human-signer.js';
import type { ReviewHandoffRecord } from './review-handoff.js';
export declare const STATE_STORE_GRAPH_ATOM_UI_EVENT_SCHEMA: "zj-loop.graph_atom_ui_state_event.v1";
export declare const STATE_STORE_GRAPH_ATOM_UI_AGGREGATE: "graph-atom-ui";
export declare const STATE_STORE_GRAPH_ATOM_UI_EVENT: "graph-atom-ui.read-model.recorded";
type Digest = `sha256:${string}`;
export type StateStoreGraphAtomUiUpstream = {
    list(): Promise<{
        events: GraphAtomUiReadModel[];
    }>;
    get(input: {
        event_id: string;
    }): Promise<{
        event: GraphAtomUiReadModel | null;
    }>;
    evidence(input: {
        event_id: string;
    }): Promise<{
        evidence: Array<{
            kind: string;
            artifact_id: string;
            digest: Digest;
        }>;
    }>;
    accept(input: {
        network_id: string;
        event_id: string;
        plan_id: string;
        plan_revision: number;
        plan_digest: string;
        review_handoff_digest: string;
        verification_digest: string;
        accepted_at: string;
        signer: HumanSigner;
    }): Promise<Record<string, unknown>>;
};
export declare function validateStateStoreGraphAtomUiReadModel(model: GraphAtomUiReadModel, network_id?: string): void;
export declare function recordGraphAtomUiReadModel(input: {
    stateStore: SqliteStateStore;
    model: GraphAtomUiReadModel;
    handoff?: ReviewHandoffRecord;
    now?: string;
}): Promise<{
    status: 'recorded' | 'duplicate' | 'conflict';
    revision?: number;
    current_revision: number;
    reason?: string;
}>;
export declare function createStateStoreGraphAtomUiUpstream(input: {
    stateStore: SqliteStateStore;
    network_id: string;
}): StateStoreGraphAtomUiUpstream;
export {};
