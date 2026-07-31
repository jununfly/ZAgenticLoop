export declare const AGENT_REVIEW_HANDOFF_SCHEMA: "zj-loop.agent_review_handoff.v1";
export type AgentReviewHandoff = {
    schema: typeof AGENT_REVIEW_HANDOFF_SCHEMA;
    status: 'review-pending';
    execution_id: string;
    task_id: string;
    attempt: number;
    agent_id: string;
    evidence_refs: string[];
    recommendation: 'accept' | 'reject' | 'needs-more-work';
    recommendation_reason: string;
    risks: string[];
    side_effects_executed: false;
    handoff_digest: string;
};
export declare function createAgentReviewHandoff(input: Omit<AgentReviewHandoff, 'schema' | 'status' | 'side_effects_executed' | 'handoff_digest'>): AgentReviewHandoff;
export declare function validateAgentReviewHandoff(value: unknown): {
    status: 'valid';
} | {
    status: 'blocked';
    reason: string;
};
