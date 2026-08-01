import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { appendRealAgentDogfoodEvent, createRealAgentDogfoodTransition } from './real-agent-dogfood-lifecycle.js';
export const REAL_AGENT_DOGFOOD_VERIFICATION_SCHEMA = 'zj-loop.real_agent_dogfood_verification.v1';
import { verifyRealAgentDogfoodPostRunProof } from './real-agent-dogfood-post-run-proof.js';
function digest(value) {
    const json = canonicalize(value);
    if (typeof json !== 'string')
        throw new Error('real-agent-dogfood-verification-canonicalization-invalid');
    return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}
function validDigest(value) { return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value); }
export async function verifyRealAgentDogfoodExecution(input) {
    if (input.lifecycle.status !== 'verification-pending')
        throw new Error('real-agent-dogfood-verifier-lifecycle-invalid');
    let decision;
    let executionFact;
    let parsedFact;
    try {
        const parsed = JSON.parse((await input.evidenceStore.read({ digest: input.provider_fact_digest, actor: `verifier:${input.verifier_id}` })).toString('utf8'));
        parsedFact = parsed;
        if (parsed.schema !== 'zj-loop.real_agent_dogfood_provider_result.v1' || typeof parsed.execution_id !== 'string' || !Number.isInteger(parsed.attempt) || typeof parsed.worker_id !== 'string' || !parsed.result || !['completed', 'failed', 'cancelled', 'timed-out'].includes(String(parsed.result.status)) || typeof parsed.result.success !== 'boolean')
            throw new Error('provider-fact-invalid');
        executionFact = { execution_id: parsed.execution_id, attempt: parsed.attempt, worker_id: parsed.worker_id, status: parsed.result.status, success: parsed.result.success, post_run_proof: parsed.post_run_proof ?? null };
    }
    catch {
        decision = { to: 'outcome-uncertain', verificationStatus: 'blocked', reasonCode: 'provider-fact-missing-or-invalid', nextAction: 'human-reconcile-execution' };
    }
    if (!decision && executionFact && (!input.verifier_id.trim() || input.verifier_id === executionFact.worker_id)) {
        decision = { to: 'blocked', verificationStatus: 'blocked', reasonCode: 'independent-verifier-required', nextAction: 'assign-independent-verifier' };
    }
    else if (!decision && executionFact && (executionFact.execution_id !== input.lifecycle.execution_id || executionFact.attempt !== input.lifecycle.attempt || !executionFact.success || executionFact.status !== 'completed')) {
        decision = { to: 'blocked', verificationStatus: 'blocked', reasonCode: 'provider-execution-fact-failed', nextAction: 'human-review-provider-failure' };
    }
    else if (!decision && executionFact) {
        try {
            await input.evidenceStore.read({ digest: input.stdout_digest, actor: `verifier:${input.verifier_id}` });
            await input.evidenceStore.read({ digest: input.stderr_digest, actor: `verifier:${input.verifier_id}` });
        }
        catch {
            decision = { to: 'outcome-uncertain', verificationStatus: 'blocked', reasonCode: 'verification-evidence-missing-or-invalid', nextAction: 'human-reconcile-execution' };
        }
        if (!decision) {
            const proof = executionFact.post_run_proof;
            const checked = proof && parsedFact && typeof parsedFact.worktree_path === 'string' && typeof parsedFact.executable_digest === 'string' && typeof parsedFact.stdout?.digest === 'string' && typeof parsedFact.stderr?.digest === 'string'
                ? verifyRealAgentDogfoodPostRunProof({ proof, execution_id: executionFact.execution_id, attempt: executionFact.attempt, worktree_path: parsedFact.worktree_path, executable_digest: parsedFact.executable_digest, stdout_digest: parsedFact.stdout.digest, stderr_digest: parsedFact.stderr.digest })
                : { status: 'blocked', reasons: ['post-run-proof-missing-or-invalid'] };
            if (checked.status === 'blocked' || !validDigest(input.stdout_digest) || !validDigest(input.stderr_digest)) {
                decision = { to: 'outcome-uncertain', verificationStatus: 'blocked', reasonCode: 'verification-proof-incomplete', nextAction: 'human-reconcile-execution' };
            }
            else {
                decision = { to: 'review-pending', verificationStatus: 'passed', reasonCode: 'independent-verification-passed', nextAction: 'human-review' };
            }
        }
    }
    if (!decision)
        throw new Error('real-agent-dogfood-verifier-decision-missing');
    const verification = { schema: REAL_AGENT_DOGFOOD_VERIFICATION_SCHEMA, lifecycle_digest: input.lifecycle.lifecycle_digest, execution_id: input.lifecycle.execution_id, attempt: input.lifecycle.attempt, verifier_id: input.verifier_id, provider_fact_digest: input.provider_fact_digest, stdout_digest: input.stdout_digest, stderr_digest: input.stderr_digest, status: decision.verificationStatus, reason_code: decision.reasonCode };
    const verificationDigest = digest(verification);
    const transition = createRealAgentDogfoodTransition({ lifecycle: input.lifecycle, to: decision.to, event_id: `${input.lifecycle.dogfood_id}:attempt-${input.lifecycle.attempt}:verification:${decision.to}`, occurred_at: input.now ?? new Date().toISOString(), fact_digest: verificationDigest, reason_code: decision.to === 'review-pending' ? undefined : decision.reasonCode, next_action: decision.nextAction });
    const result = await appendRealAgentDogfoodEvent({ stateStore: input.stateStore, expected_revision: input.expected_revision, event: transition.event });
    if (result.status === 'conflict')
        throw new Error('real-agent-dogfood-verifier-revision-conflict');
    return { status: decision.to, verification_status: decision.verificationStatus, reason_code: decision.reasonCode, next_action: decision.nextAction, verification_digest: verificationDigest };
}
