const DIGEST = /^sha256:[0-9a-f]{64}$/;
const FAILURE_CLASSES = new Set(['known-rejection', 'unverifiable-cleanup', 'unverifiable-evidence', 'provider-timeout']);
export function classifyRealAgentDogfoodFailure(failure) {
    if (!FAILURE_CLASSES.has(failure))
        throw new Error('real-agent-dogfood-failure-class-invalid');
    return { status: failure.startsWith('unverifiable-') ? 'outcome-uncertain' : 'blocked', reason_code: failure };
}
export function replayRealAgentDogfoodAttempt(input) {
    if (!input || !input.execution_id.trim() || !Number.isInteger(input.attempt) || input.attempt < 1 || !DIGEST.test(input.result_digest))
        throw new Error('real-agent-dogfood-replay-input-invalid');
    if (!input.prior)
        return { status: 'recorded', execution_id: input.execution_id, attempt: input.attempt, result_digest: input.result_digest };
    if (input.attempt === input.prior.attempt && input.execution_id === input.prior.execution_id) {
        return input.result_digest === input.prior.result_digest ? { status: 'idempotent', execution_id: input.execution_id, attempt: input.attempt } : { status: 'conflict', reason_code: 'attempt-digest-conflict' };
    }
    if (input.attempt <= input.prior.attempt)
        throw new Error('real-agent-dogfood-retry-attempt-invalid');
    if (input.execution_id === input.prior.execution_id)
        throw new Error('real-agent-dogfood-retry-execution-binding-invalid');
    return { status: 'new-attempt', execution_id: input.execution_id, attempt: input.attempt };
}
