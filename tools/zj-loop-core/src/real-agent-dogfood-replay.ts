const DIGEST = /^sha256:[0-9a-f]{64}$/;
const FAILURE_CLASSES = new Set(['known-rejection', 'unverifiable-cleanup', 'unverifiable-evidence', 'provider-timeout']);

export type RealAgentDogfoodFailureClass = 'known-rejection' | 'unverifiable-cleanup' | 'unverifiable-evidence' | 'provider-timeout';
export type RealAgentDogfoodReplayRecord = { status: 'recorded'; execution_id: string; attempt: number; result_digest: string };

export function classifyRealAgentDogfoodFailure(failure: string): { status: 'blocked' | 'outcome-uncertain'; reason_code: RealAgentDogfoodFailureClass } {
  if (!FAILURE_CLASSES.has(failure)) throw new Error('real-agent-dogfood-failure-class-invalid');
  return { status: failure.startsWith('unverifiable-') ? 'outcome-uncertain' : 'blocked', reason_code: failure as RealAgentDogfoodFailureClass };
}

export function replayRealAgentDogfoodAttempt(input: { execution_id: string; attempt: number; result_digest: string; prior: RealAgentDogfoodReplayRecord | { status: string; execution_id: string; attempt: number; result_digest: string } | null }):
  | RealAgentDogfoodReplayRecord
  | { status: 'idempotent'; execution_id: string; attempt: number }
  | { status: 'conflict'; reason_code: 'attempt-digest-conflict' }
  | { status: 'new-attempt'; execution_id: string; attempt: number } {
  if (!input || !input.execution_id.trim() || !Number.isInteger(input.attempt) || input.attempt < 1 || !DIGEST.test(input.result_digest)) throw new Error('real-agent-dogfood-replay-input-invalid');
  if (!input.prior) return { status: 'recorded', execution_id: input.execution_id, attempt: input.attempt, result_digest: input.result_digest };
  if (input.attempt === input.prior.attempt && input.execution_id === input.prior.execution_id) {
    return input.result_digest === input.prior.result_digest ? { status: 'idempotent', execution_id: input.execution_id, attempt: input.attempt } : { status: 'conflict', reason_code: 'attempt-digest-conflict' };
  }
  if (input.attempt <= input.prior.attempt) throw new Error('real-agent-dogfood-retry-attempt-invalid');
  if (input.execution_id === input.prior.execution_id) throw new Error('real-agent-dogfood-retry-execution-binding-invalid');
  return { status: 'new-attempt', execution_id: input.execution_id, attempt: input.attempt };
}
