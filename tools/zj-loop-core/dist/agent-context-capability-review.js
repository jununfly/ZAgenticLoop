import { z } from 'zod';
export const AGENT_CONTEXT_CAPABILITY_REVIEW_SCHEMA = 'zj-loop.agent_context_capability_review.v1';
const evidenceRefSchema = z.object({
    path: z.string().min(1),
    hash: z.string().regex(/^[0-9a-f]{64}$/i).nullable().optional(),
    command: z.string().min(1).nullable().optional(),
    description: z.string().min(1),
    classification: z.enum(['fact', 'inference', 'unverified']),
});
const blockedCaseSchema = z.object({
    code: z.string().min(1),
    status: z.enum(['blocked', 'recovered', 'not-reproduced']),
    condition: z.string().min(1),
    observed_behavior: z.string().min(1),
    evidence_refs: z.array(z.string().min(1)),
});
const verificationResultSchema = z.object({
    command: z.string().min(1),
    status: z.enum(['passed', 'failed', 'blocked', 'not-run']),
    summary: z.string().min(1),
    evidence_refs: z.array(z.string().min(1)),
});
const verificationManifestEntrySchema = z.object({
    command: z.string().min(1),
    status: z.enum(['passed', 'failed', 'blocked', 'not-run']),
    exit_code: z.number().int().nullable(),
    output_sha256: z.string().regex(/^[0-9a-f]{64}$/i).nullable(),
    output_path: z.string().min(1).nullable(),
    captured_at: z.string().datetime(),
});
const reviewHandoffSchema = z.object({
    status: z.enum(['ready', 'blocked', 'needs-human-review']),
    summary: z.string().min(1),
    risks: z.array(z.string()),
    decisions_needed: z.array(z.string()),
});
const humanDecisionSchema = z.object({
    status: z.enum(['pending', 'accept', 'request-revision', 'recover', 'reject']),
    decided_by: z.string().min(1).nullable(),
    decided_at: z.string().datetime().nullable(),
    rationale: z.string().nullable(),
});
export const agentContextCapabilityReviewSchema = z.object({
    schema: z.literal(AGENT_CONTEXT_CAPABILITY_REVIEW_SCHEMA),
    target: z.object({
        path: z.string().min(1),
        scope: z.string().min(1),
        commit: z.string().regex(/^[0-9a-f]{40}$/i),
    }),
    report_metadata: z.object({
        generated_at: z.string().datetime(),
        generator: z.string().min(1),
        workspace_commit: z.string().regex(/^[0-9a-f]{40}$/i),
    }),
    goal: z.string().min(1),
    capability_status: z.enum(['implemented', 'guarded', 'not-implemented']),
    observed_flow: z.array(z.string().min(1)),
    contracts_and_invariants: z.array(z.string().min(1)),
    facts: z.array(z.string().min(1)),
    inferences: z.array(z.string().min(1)),
    unverified: z.array(z.string().min(1)),
    evidence_refs: z.record(z.string(), evidenceRefSchema),
    failure_or_blocked_cases: z.array(blockedCaseSchema),
    risks_and_unknowns: z.array(z.string().min(1)),
    verification_results: z.array(verificationResultSchema),
    verification_manifest: z.array(verificationManifestEntrySchema).min(1),
    recommended_next_action: z.array(z.string().min(1)),
    review_handoff: reviewHandoffSchema,
    human_decision: humanDecisionSchema,
}).superRefine((value, context) => {
    if (value.report_metadata.workspace_commit.toLowerCase() !== value.target.commit.toLowerCase()) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['report_metadata', 'workspace_commit'], message: 'workspace_commit must match target.commit' });
    }
    const evidenceKeys = new Set(Object.keys(value.evidence_refs));
    for (const [index, item] of value.failure_or_blocked_cases.entries()) {
        for (const key of item.evidence_refs) {
            if (!evidenceKeys.has(key))
                context.addIssue({ code: z.ZodIssueCode.custom, path: ['failure_or_blocked_cases', index, 'evidence_refs'], message: `unknown evidence ref: ${key}` });
        }
    }
    for (const [index, item] of value.verification_results.entries()) {
        for (const key of item.evidence_refs) {
            if (!evidenceKeys.has(key))
                context.addIssue({ code: z.ZodIssueCode.custom, path: ['verification_results', index, 'evidence_refs'], message: `unknown evidence ref: ${key}` });
        }
    }
    for (const [key, evidence] of Object.entries(value.evidence_refs)) {
        if (evidence.classification === 'fact' && !evidence.hash) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ['evidence_refs', key, 'hash'], message: 'fact evidence must include a hash' });
        }
    }
    const resultByCommand = new Map(value.verification_results.map((item) => [item.command, item]));
    const manifestCommands = new Set(value.verification_manifest.map((item) => item.command));
    if (manifestCommands.size !== value.verification_manifest.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['verification_manifest'], message: 'verification manifest commands must be unique' });
    }
    for (const [index, result] of value.verification_results.entries()) {
        if (!manifestCommands.has(result.command))
            context.addIssue({ code: z.ZodIssueCode.custom, path: ['verification_results', index, 'command'], message: 'verification result has no manifest entry' });
    }
    for (const [index, manifest] of value.verification_manifest.entries()) {
        const result = resultByCommand.get(manifest.command);
        if (!result) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ['verification_manifest', index, 'command'], message: 'manifest command has no verification result' });
            continue;
        }
        if (manifest.status !== result.status)
            context.addIssue({ code: z.ZodIssueCode.custom, path: ['verification_manifest', index, 'status'], message: 'manifest status must match verification result' });
        if (manifest.status === 'passed' && (manifest.exit_code !== 0 || !manifest.output_sha256 || !manifest.output_path)) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ['verification_manifest', index], message: 'passed manifest requires exit_code=0, output_sha256, and output_path' });
        }
    }
});
export function buildAgentContextCapabilityReview(input) {
    return parseAgentContextCapabilityReview({
        schema: AGENT_CONTEXT_CAPABILITY_REVIEW_SCHEMA,
        ...input,
    });
}
export function parseAgentContextCapabilityReview(value) {
    return agentContextCapabilityReviewSchema.parse(value);
}
export function validateAgentContextCapabilityReview(value) {
    return agentContextCapabilityReviewSchema.safeParse(value);
}
