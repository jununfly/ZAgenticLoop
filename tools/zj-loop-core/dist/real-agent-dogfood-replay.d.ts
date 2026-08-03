export type RealAgentDogfoodFailureClass = 'known-rejection' | 'unverifiable-cleanup' | 'unverifiable-evidence' | 'provider-timeout';
export type RealAgentDogfoodReplayRecord = {
    status: 'recorded';
    execution_id: string;
    attempt: number;
    result_digest: string;
};
export declare function classifyRealAgentDogfoodFailure(failure: string): {
    status: 'blocked' | 'outcome-uncertain';
    reason_code: RealAgentDogfoodFailureClass;
};
export declare function replayRealAgentDogfoodAttempt(input: {
    execution_id: string;
    attempt: number;
    result_digest: string;
    prior: RealAgentDogfoodReplayRecord | {
        status: string;
        execution_id: string;
        attempt: number;
        result_digest: string;
    } | null;
}): RealAgentDogfoodReplayRecord | {
    status: 'idempotent';
    execution_id: string;
    attempt: number;
} | {
    status: 'conflict';
    reason_code: 'attempt-digest-conflict';
} | {
    status: 'new-attempt';
    execution_id: string;
    attempt: number;
};
