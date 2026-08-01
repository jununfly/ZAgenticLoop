export declare const BOUNDED_RECONCILIATION_SCHEMA: "zj-loop.bounded_reconciliation.v1";
declare const FORBIDDEN_ACTIONS: readonly ["provider.invoke", "execution.restart", "resource.write"];
export type BoundedReconciliationPlan = {
    schema: typeof BOUNDED_RECONCILIATION_SCHEMA;
    status: 'required';
    network_id: string;
    execution_id: string;
    attempt: number;
    outcome_digest: string;
    reason_code: 'outcome-uncertain' | 'reconciliation-exhausted';
    max_queries: number;
    deadline: string;
    query_scope: string[];
    forbidden_actions: [...typeof FORBIDDEN_ACTIONS];
    observed_fact_digests: string[];
    side_effects_executed: false;
    plan_digest: string;
};
export declare function createBoundedReconciliationPlan(input: Omit<BoundedReconciliationPlan, 'schema' | 'status' | 'forbidden_actions' | 'side_effects_executed' | 'plan_digest'>): BoundedReconciliationPlan;
export declare function validateBoundedReconciliationPlan(value: BoundedReconciliationPlan): {
    status: 'valid' | 'blocked';
    errors: string[];
};
export {};
