import type { OpnArtifactStore } from './opn-artifact-store.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
import { type HumanActionDecision, type HumanActionRequest } from './human-action.js';
export declare const HUMAN_ACTION_OPN_READ_MODEL_SCHEMA: "zj-loop.human_action_opn_read_model.v1";
export type HumanActionReadModel = {
    schema: typeof HUMAN_ACTION_OPN_READ_MODEL_SCHEMA;
    network_id: string;
    requests: Array<Omit<HumanActionRequest, 'status'> & {
        status: 'pending' | 'approved' | 'rejected';
        decision?: HumanActionDecision;
    }>;
    side_effects_executed: false;
};
export declare function projectOpnHumanActions(input: {
    stateStore: Pick<SqliteStateStore, 'readEvents'>;
    artifactStore: OpnArtifactStore;
    network_id: string;
    node_id?: string;
    now?: string;
}): Promise<HumanActionReadModel>;
