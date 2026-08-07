import type { OpnArtifactStore } from './opn-artifact-store.js';
import { type OpnReadOnlyGraphVerificationResult } from './opn-readonly-graph-verification.js';
import { type TransportAdapter, type TransportEnvelope } from './transport-contract.js';
type Digest = `sha256:${string}`;
type ProviderResult = {
    status: 'completed' | 'failed' | 'cancelled' | 'timed-out';
    success: boolean;
    stdout: string;
    stderr: string;
};
type ReadOnlyProvider = {
    run(input: {
        cwd: string;
        prompt: string;
        mode: 'read-only';
        env_allowlist: string[];
        env: Record<string, string>;
        timeout_ms: number;
        termination_grace_ms: number;
        max_stdout_bytes: number;
        max_stderr_bytes: number;
    }): Promise<ProviderResult>;
};
export declare function processOpnReadOnlyGraphVerificationRequest(input: {
    envelope: TransportEnvelope;
    verifier_node_id: string;
    cwd: string;
    session_id: string;
    artifact_store: OpnArtifactStore;
    downloadArtifact(artifact_id: string): Promise<Buffer>;
    publishArtifact?: (value: {
        bytes: Buffer;
        metadata: Awaited<ReturnType<OpnArtifactStore['put']>>['metadata'];
        transfer_id: string;
        target_node_id: string;
    }) => Promise<void>;
    provider: ReadOnlyProvider;
    transport: Pick<TransportAdapter, 'send' | 'acknowledge'>;
    now?: () => string;
}): Promise<{
    status: 'processed' | 'blocked';
    verification_result?: OpnReadOnlyGraphVerificationResult;
    result_artifact_id?: Digest;
    message_id: string;
    reason?: string;
    side_effects_executed: false;
}>;
export {};
