import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const REAL_AGENT_DOGFOOD_WORKER_LEASE_SCHEMA: "zj-loop.real_agent_dogfood_worker_lease.v1";
export declare const REAL_AGENT_DOGFOOD_WORKER_AGGREGATE_TYPE: "real-agent-dogfood-worker";
export type RealAgentDogfoodWorkerLeaseResult = {
    status: 'acquired';
    lease_id: string;
    worker_id: string;
    expires_at: string;
    revision: number;
} | {
    status: 'reused';
    lease_id: string;
    worker_id: string;
    expires_at: string;
    revision: number;
} | {
    status: 'renewed';
    lease_id: string;
    worker_id: string;
    expires_at: string;
    revision: number;
} | {
    status: 'blocked';
    reason: 'worker-lease-expired' | 'worker-lease-mismatch';
};
export declare function acquireRealAgentDogfoodWorkerLease(input: {
    stateStore: SqliteStateStore;
    network_id: string;
    execution_id: string;
    worker_id: string;
    now?: string;
    ttl_ms?: number;
}): Promise<RealAgentDogfoodWorkerLeaseResult>;
export declare function renewRealAgentDogfoodWorkerLease(input: {
    stateStore: SqliteStateStore;
    network_id: string;
    execution_id: string;
    lease_id: string;
    worker_id: string;
    expected_revision: number;
    now?: string;
    ttl_ms?: number;
}): Promise<RealAgentDogfoodWorkerLeaseResult>;
