import { type AgentRegistration } from './agent-registration.js';
export declare const OPN_GRAPH_ATOM_ENROLLMENT_SCHEMA: "zj-loop.opn_graph_atom_enrollment.v1";
export type GraphAtomCenter = {
    responsibility_unit: 'human' | 'human+agent';
    human_id: string;
    center_agent_id?: string;
};
export type GraphAtomAgentEnrollment = {
    node_id: string;
    device_id: string;
    network_id: string;
    status: 'approved';
    capability_ceiling: string[];
    registration: AgentRegistration;
    registration_digest: string;
};
export type OpnGraphAtomEnrollmentSnapshot = {
    schema: typeof OPN_GRAPH_ATOM_ENROLLMENT_SCHEMA;
    graph_id: string;
    network_id: string;
    device_id: string;
    center: GraphAtomCenter;
    agents: GraphAtomAgentEnrollment[];
    status: 'ready';
    snapshot_digest: string;
};
export declare function createOpnGraphAtomEnrollmentSnapshot(input: {
    graph_id: string;
    network_id: string;
    device_id: string;
    center: GraphAtomCenter;
    agents: Array<{
        node_id: string;
        device_id: string;
        network_id: string;
        status: 'approved' | 'pending' | 'revoked';
        capability_ceiling: string[];
        registration: AgentRegistration;
    }>;
}): OpnGraphAtomEnrollmentSnapshot;
export declare function validateOpnGraphAtomEnrollmentSnapshot(value: unknown): {
    status: 'valid';
    snapshot: OpnGraphAtomEnrollmentSnapshot;
} | {
    status: 'blocked';
    reason: string;
};
