import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const REAL_AGENT_DOGFOOD_COORDINATOR_LEASE_SCHEMA: "zj-loop.real_agent_dogfood_coordinator_lease.v1";
export declare const REAL_AGENT_DOGFOOD_COORDINATOR_AGGREGATE_TYPE: "real-agent-dogfood-graph-coordinator";
export type RealAgentDogfoodCoordinatorLeaseResult = {
    status: 'acquired';
    lease_id: string;
    human_id: string;
    coordinator_id: string;
    coordinator_lease_digest: string;
    expires_at: string;
    revision: number;
} | {
    status: 'reused';
    lease_id: string;
    human_id: string;
    coordinator_id: string;
    coordinator_lease_digest: string;
    expires_at: string;
    revision: number;
} | {
    status: 'renewed';
    lease_id: string;
    human_id: string;
    coordinator_id: string;
    coordinator_lease_digest: string;
    expires_at: string;
    revision: number;
} | {
    status: 'released';
    lease_id: string;
    human_id: string;
    coordinator_id: string;
    coordinator_lease_digest: string;
    revision: number;
} | {
    status: 'abandoned';
    lease_id: string;
    human_id: string;
    coordinator_id: string;
    coordinator_lease_digest: string;
    revision: number;
} | {
    status: 'blocked';
    reason: 'coordinator-lease-expired' | 'coordinator-lease-mismatch' | 'coordinator-lease-released' | 'coordinator-lease-abandoned';
};
export declare function acquireRealAgentDogfoodCoordinatorLease(input: {
    stateStore: SqliteStateStore;
    network_id: string;
    execution_id: string;
    human_id: string;
    coordinator_id: string;
    session_id: string;
    execution_binding_digest: string;
    now?: string;
    ttl_ms?: number;
}): Promise<RealAgentDogfoodCoordinatorLeaseResult>;
export declare function renewRealAgentDogfoodCoordinatorLease(input: {
    stateStore: SqliteStateStore;
    network_id: string;
    execution_id: string;
    lease_id: string;
    human_id: string;
    coordinator_id: string;
    expected_revision: number;
    now?: string;
    ttl_ms?: number;
}): Promise<RealAgentDogfoodCoordinatorLeaseResult>;
export declare function releaseRealAgentDogfoodCoordinatorLease(input: {
    stateStore: SqliteStateStore;
    network_id: string;
    execution_id: string;
    lease_id: string;
    human_id: string;
    coordinator_id: string;
    expected_revision: number;
    now?: string;
}): Promise<RealAgentDogfoodCoordinatorLeaseResult>;
export declare function abandonRealAgentDogfoodCoordinatorLease(input: {
    stateStore: SqliteStateStore;
    network_id: string;
    execution_id: string;
    lease_id: string;
    human_id: string;
    coordinator_id: string;
    expected_revision: number;
    now?: string;
}): Promise<RealAgentDogfoodCoordinatorLeaseResult>;
