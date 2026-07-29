import { z } from 'zod';
export declare const AGENT_CONTEXT_CAPABILITY_REVIEW_SCHEMA: "zj-loop.agent_context_capability_review.v1";
export declare const agentContextCapabilityReviewSchema: z.ZodObject<{
    schema: z.ZodLiteral<"zj-loop.agent_context_capability_review.v1">;
    target: z.ZodObject<{
        path: z.ZodString;
        scope: z.ZodString;
        commit: z.ZodString;
    }, z.core.$strip>;
    report_metadata: z.ZodObject<{
        generated_at: z.ZodString;
        generator: z.ZodString;
        workspace_commit: z.ZodString;
    }, z.core.$strip>;
    goal: z.ZodString;
    capability_status: z.ZodEnum<{
        implemented: "implemented";
        guarded: "guarded";
        "not-implemented": "not-implemented";
    }>;
    observed_flow: z.ZodArray<z.ZodString>;
    contracts_and_invariants: z.ZodArray<z.ZodString>;
    facts: z.ZodArray<z.ZodString>;
    inferences: z.ZodArray<z.ZodString>;
    unverified: z.ZodArray<z.ZodString>;
    evidence_refs: z.ZodRecord<z.ZodString, z.ZodObject<{
        path: z.ZodString;
        hash: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        command: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        description: z.ZodString;
        classification: z.ZodEnum<{
            fact: "fact";
            inference: "inference";
            unverified: "unverified";
        }>;
    }, z.core.$strip>>;
    failure_or_blocked_cases: z.ZodArray<z.ZodObject<{
        code: z.ZodString;
        status: z.ZodEnum<{
            blocked: "blocked";
            recovered: "recovered";
            "not-reproduced": "not-reproduced";
        }>;
        condition: z.ZodString;
        observed_behavior: z.ZodString;
        evidence_refs: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    risks_and_unknowns: z.ZodArray<z.ZodString>;
    verification_results: z.ZodArray<z.ZodObject<{
        command: z.ZodString;
        status: z.ZodEnum<{
            blocked: "blocked";
            passed: "passed";
            failed: "failed";
            "not-run": "not-run";
        }>;
        summary: z.ZodString;
        evidence_refs: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    verification_manifest: z.ZodArray<z.ZodObject<{
        command: z.ZodString;
        status: z.ZodEnum<{
            blocked: "blocked";
            passed: "passed";
            failed: "failed";
            "not-run": "not-run";
        }>;
        exit_code: z.ZodNullable<z.ZodNumber>;
        output_sha256: z.ZodNullable<z.ZodString>;
        output_path: z.ZodNullable<z.ZodString>;
        captured_at: z.ZodString;
    }, z.core.$strip>>;
    recommended_next_action: z.ZodArray<z.ZodString>;
    review_handoff: z.ZodObject<{
        status: z.ZodEnum<{
            blocked: "blocked";
            ready: "ready";
            "needs-human-review": "needs-human-review";
        }>;
        summary: z.ZodString;
        risks: z.ZodArray<z.ZodString>;
        decisions_needed: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    human_decision: z.ZodObject<{
        status: z.ZodEnum<{
            pending: "pending";
            accept: "accept";
            "request-revision": "request-revision";
            recover: "recover";
            reject: "reject";
        }>;
        decided_by: z.ZodNullable<z.ZodString>;
        decided_at: z.ZodNullable<z.ZodString>;
        rationale: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type AgentContextCapabilityReview = z.infer<typeof agentContextCapabilityReviewSchema>;
export type AgentContextCapabilityReviewInput = Omit<AgentContextCapabilityReview, 'schema'>;
export declare function buildAgentContextCapabilityReview(input: AgentContextCapabilityReviewInput): AgentContextCapabilityReview;
export declare function parseAgentContextCapabilityReview(value: unknown): AgentContextCapabilityReview;
export declare function validateAgentContextCapabilityReview(value: unknown): z.ZodSafeParseResult<{
    schema: "zj-loop.agent_context_capability_review.v1";
    target: {
        path: string;
        scope: string;
        commit: string;
    };
    report_metadata: {
        generated_at: string;
        generator: string;
        workspace_commit: string;
    };
    goal: string;
    capability_status: "implemented" | "guarded" | "not-implemented";
    observed_flow: string[];
    contracts_and_invariants: string[];
    facts: string[];
    inferences: string[];
    unverified: string[];
    evidence_refs: Record<string, {
        path: string;
        description: string;
        classification: "fact" | "inference" | "unverified";
        hash?: string | null | undefined;
        command?: string | null | undefined;
    }>;
    failure_or_blocked_cases: {
        code: string;
        status: "blocked" | "recovered" | "not-reproduced";
        condition: string;
        observed_behavior: string;
        evidence_refs: string[];
    }[];
    risks_and_unknowns: string[];
    verification_results: {
        command: string;
        status: "blocked" | "passed" | "failed" | "not-run";
        summary: string;
        evidence_refs: string[];
    }[];
    verification_manifest: {
        command: string;
        status: "blocked" | "passed" | "failed" | "not-run";
        exit_code: number | null;
        output_sha256: string | null;
        output_path: string | null;
        captured_at: string;
    }[];
    recommended_next_action: string[];
    review_handoff: {
        status: "blocked" | "ready" | "needs-human-review";
        summary: string;
        risks: string[];
        decisions_needed: string[];
    };
    human_decision: {
        status: "pending" | "accept" | "request-revision" | "recover" | "reject";
        decided_by: string | null;
        decided_at: string | null;
        rationale: string | null;
    };
}>;
