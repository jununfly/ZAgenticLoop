import type { OpnArtifactStore } from './opn-artifact-store.js';
import { type OpnReadOnlyGraphVerificationResult } from './opn-readonly-graph-verification.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
import type { TransportAdapter } from './transport-contract.js';
export declare function receiveOpnReadOnlyGraphVerificationResult(input: {
    transport: Pick<TransportAdapter, 'receive' | 'acknowledge'>;
    session_id: string;
    coordinator_id: string;
    expected: {
        graph_id: string;
        network_id: string;
        plan_id: string;
        plan_revision: number;
        task_id: string;
        plan_digest: string;
        source_evidence_ref: string;
        verifier_node_id: string;
    };
    state_store: SqliteStateStore;
    artifact_store: OpnArtifactStore;
    downloadArtifact(artifact_id: string): Promise<Buffer>;
}): Promise<{
    status: 'empty' | 'recorded' | 'duplicate' | 'blocked';
    message_id?: string;
    result?: OpnReadOnlyGraphVerificationResult;
    reason?: string;
    side_effects_executed: false;
}>;
