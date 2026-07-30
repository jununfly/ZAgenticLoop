export declare const DISPATCH_INTENT_SCHEMA: "zj-loop.dispatch_intent.v1";
export type DispatchIntent = {
    schema: typeof DISPATCH_INTENT_SCHEMA;
    protocol_version: 'dispatch-intent.v1';
    intent_id: string;
    network_id: string;
    plan_id: string;
    plan_revision: number;
    plan_digest: string;
    task_id: string;
    node_id: string;
    assigned_node: string;
    grant_digest: string;
    claim_event_id: string;
    dispatch_event_id: string;
    authorized_by: string;
    issued_at: string;
    expires_at: string;
    session_ttl_ms: number;
    capabilities: string[];
    resource_scope: string[];
    intent_digest: string;
};
export type DispatchIntentError = {
    code: string;
    path: string;
    message: string;
    blocking: true;
};
export type DispatchIntentValidation = {
    status: 'valid' | 'blocked';
    errors: DispatchIntentError[];
    intent_digest: string;
};
export declare function createDispatchIntent(input: Omit<DispatchIntent, 'schema' | 'protocol_version' | 'intent_digest'>): DispatchIntent;
export declare function dispatchIntentDigest(intent: DispatchIntent): string;
export declare function validateDispatchIntent(intent: unknown): DispatchIntentValidation;
