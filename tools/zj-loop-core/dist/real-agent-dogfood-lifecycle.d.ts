import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const REAL_AGENT_DOGFOOD_LIFECYCLE_SCHEMA: "zj-loop.real_agent_dogfood_lifecycle.v1";
export declare const REAL_AGENT_DOGFOOD_EVENT_SCHEMA: "zj-loop.real_agent_dogfood_event.v1";
export declare const REAL_AGENT_DOGFOOD_AGGREGATE_TYPE: "real-agent-dogfood";
export type RealAgentDogfoodStatus = 'draft' | 'preflight-ready' | 'awaiting-human-approval' | 'running' | 'verification-pending' | 'review-pending' | 'accepted' | 'blocked' | 'outcome-uncertain' | 'request-revision' | 'rejected';
export type RealAgentDogfoodLifecycle = {
    schema: typeof REAL_AGENT_DOGFOOD_LIFECYCLE_SCHEMA;
    network_id: string;
    dogfood_id: string;
    execution_id: string;
    attempt: number;
    provider_id: string;
    adapter_version: string;
    status: RealAgentDogfoodStatus;
    created_at: string;
    updated_at: string;
    last_fact_digest: string | null;
    approval_digest: string | null;
    reason_code: string | null;
    next_action: string | null;
    lifecycle_digest: string;
};
export type RealAgentDogfoodEventPayload = {
    schema: typeof REAL_AGENT_DOGFOOD_EVENT_SCHEMA;
    network_id: string;
    dogfood_id: string;
    execution_id: string;
    attempt: number;
    provider_id: string;
    adapter_version: string;
    from_status: RealAgentDogfoodStatus | null;
    to_status: RealAgentDogfoodStatus;
    fact_digest: string | null;
    approval_digest: string | null;
    reason_code: string | null;
    next_action: string | null;
};
export type RealAgentDogfoodEvent = {
    event_id: string;
    aggregate_type: typeof REAL_AGENT_DOGFOOD_AGGREGATE_TYPE;
    aggregate_id: string;
    event_type: 'real-agent-dogfood.lifecycle.transitioned';
    occurred_at: string;
    payload: RealAgentDogfoodEventPayload;
};
type Input = Omit<RealAgentDogfoodLifecycle, 'schema' | 'status' | 'created_at' | 'updated_at' | 'last_fact_digest' | 'approval_digest' | 'reason_code' | 'next_action' | 'lifecycle_digest'> & {
    created_at: string;
};
export declare function createRealAgentDogfoodDraft(input: Input): {
    lifecycle: RealAgentDogfoodLifecycle;
    event: RealAgentDogfoodEvent;
};
export declare function createRealAgentDogfoodTransition(input: {
    lifecycle: RealAgentDogfoodLifecycle;
    to: RealAgentDogfoodStatus;
    event_id: string;
    occurred_at: string;
    fact_digest?: string;
    approval_digest?: string;
    reason_code?: string;
    next_action?: string;
    attempt?: number;
    execution_id?: string;
}): {
    lifecycle: RealAgentDogfoodLifecycle;
    event: RealAgentDogfoodEvent;
};
export declare function projectRealAgentDogfoodLifecycle(events: RealAgentDogfoodEvent[]): RealAgentDogfoodLifecycle;
export declare function appendRealAgentDogfoodEvent(input: {
    stateStore: SqliteStateStore;
    expected_revision: number;
    event: RealAgentDogfoodEvent;
    now?: string;
}): Promise<{
    status: 'recorded' | 'duplicate' | 'conflict';
    revision?: number;
    current_revision: number;
    reason?: string;
}>;
export {};
