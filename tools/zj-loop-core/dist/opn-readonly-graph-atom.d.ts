import type { OpnArtifactStore } from './opn-artifact-store.js';
import { type TransportAdapter, type TransportEnvelope } from './transport-contract.js';
import { type OpnReadOnlyGraphVerificationResult } from './opn-readonly-graph-verification.js';
export declare const OPN_READ_ONLY_GRAPH_ATOM_SCHEMA: "zj-loop.opn_read_only_graph_atom.v1";
export declare const OPN_READ_ONLY_GRAPH_ATOM_PHASES: readonly ["source_execution", "independent_verification", "human_review"];
export type OpnReadOnlyGraphAtomPhase = typeof OPN_READ_ONLY_GRAPH_ATOM_PHASES[number];
type Digest = `sha256:${string}`;
export type OpnReadOnlyGraphAtomPlan = {
    schema: typeof OPN_READ_ONLY_GRAPH_ATOM_SCHEMA;
    graph_id: string;
    network_id: string;
    plan_id: string;
    plan_revision: number;
    task_id: string;
    goal: string;
    snapshot_digest: Digest;
    coordinator_id: string;
    human_id: string;
    source_node_id: string;
    verifier_node_id: string;
    execution_mode: 'read-only';
    phases: readonly OpnReadOnlyGraphAtomPhase[];
    plan_digest: Digest;
};
type Phase = {
    phase: OpnReadOnlyGraphAtomPhase;
    status: 'passed' | 'blocked' | 'outcome-uncertain';
    reason?: string;
    evidence_ref?: Digest;
};
export type OpnReadOnlyGraphAtomReviewHandoff = {
    schema: 'zj-loop.opn_read_only_graph_review_handoff.v1';
    status: 'pending' | 'approved' | 'rejected';
    graph_id: string;
    network_id: string;
    plan_digest: Digest;
    source_evidence_ref: Digest;
    verification_evidence_ref: Digest;
    source_node_id: string;
    verifier_node_id: string;
    decision?: {
        decision: 'approved' | 'rejected';
        reason: string;
        human_id: string;
    };
    handoff_digest: Digest;
};
export type OpnReadOnlyGraphAtomResult = {
    schema: typeof OPN_READ_ONLY_GRAPH_ATOM_SCHEMA;
    status: 'passed' | 'blocked' | 'outcome-uncertain';
    plan_digest: Digest;
    phases: Phase[];
    review_handoff?: OpnReadOnlyGraphAtomReviewHandoff;
    reason?: string;
    side_effects_executed: false;
};
export type OpnReadOnlyGraphAtomStartResult = {
    status: 'awaiting-verification';
    plan_digest: Digest;
    source_evidence_ref: Digest;
    verification_request: TransportEnvelope;
    phases: Phase[];
    side_effects_executed: false;
} | OpnReadOnlyGraphAtomResult;
export declare function validateOpnReadOnlyGraphAtomReviewHandoff(value: OpnReadOnlyGraphAtomReviewHandoff): {
    status: 'valid';
} | {
    status: 'blocked';
    reason: string;
};
export declare function createOpnReadOnlyGraphAtomPlan(input: {
    graph_id: string;
    network_id: string;
    plan_id: string;
    plan_revision: number;
    task_id: string;
    goal: string;
    snapshot_digest: string;
    coordinator_id: string;
    human_id: string;
    source_node_id: string;
    verifier_node_id: string;
}): OpnReadOnlyGraphAtomPlan;
export declare function startOpnReadOnlyGraphAtom(input: {
    plan: OpnReadOnlyGraphAtomPlan;
    artifact_store: OpnArtifactStore;
    transport: Pick<TransportAdapter, 'openSession' | 'send' | 'closeSession'>;
    source: () => Promise<{
        status: 'passed' | 'blocked' | 'outcome-uncertain';
        findings?: string;
        reason?: string;
    }>;
}): Promise<OpnReadOnlyGraphAtomStartResult>;
export declare function completeOpnReadOnlyGraphAtom(input: {
    plan: OpnReadOnlyGraphAtomPlan;
    artifact_store: OpnArtifactStore;
    source_evidence_ref: Digest;
    verification: {
        status: 'passed' | 'blocked' | 'outcome-uncertain';
        findings?: string;
        reason?: string;
        evidence_ref?: Digest;
        input_artifact_refs: readonly Digest[];
    };
    human_decision: (handoff: OpnReadOnlyGraphAtomReviewHandoff) => Promise<{
        decision: 'approved' | 'rejected';
        reason: string;
        human_id: string;
    }>;
}): Promise<OpnReadOnlyGraphAtomResult>;
export declare function runOpnReadOnlyGraphAtom(input: {
    plan: OpnReadOnlyGraphAtomPlan;
    artifact_store: OpnArtifactStore;
    transport: Pick<TransportAdapter, 'openSession' | 'send' | 'closeSession'>;
    source: () => Promise<{
        status: 'passed' | 'blocked' | 'outcome-uncertain';
        findings?: string;
        reason?: string;
    }>;
    verification: (input: {
        input_artifact_refs: readonly Digest[];
    }) => Promise<{
        status: 'passed' | 'blocked' | 'outcome-uncertain';
        findings?: string;
        reason?: string;
    }>;
    human_decision: (handoff: OpnReadOnlyGraphAtomReviewHandoff) => Promise<{
        decision: 'approved' | 'rejected';
        reason: string;
        human_id: string;
    }>;
}): Promise<OpnReadOnlyGraphAtomResult>;
export declare function completeOpnReadOnlyGraphAtomFromVerificationResult(input: {
    plan: OpnReadOnlyGraphAtomPlan;
    artifact_store: OpnArtifactStore;
    source_evidence_ref: Digest;
    verification_result: OpnReadOnlyGraphVerificationResult;
    human_decision: (handoff: OpnReadOnlyGraphAtomReviewHandoff) => Promise<{
        decision: 'approved' | 'rejected';
        reason: string;
        human_id: string;
    }>;
}): Promise<OpnReadOnlyGraphAtomResult>;
export {};
