import type { RealAgentDogfoodPostRunProof, RealAgentDogfoodPostRunProofFactory } from './real-agent-dogfood-post-run-proof.js';
import { type TrustedRunnerPeerIdentityVerifier } from './trusted-runner-peer-identity.js';
type ProofRequest = Parameters<RealAgentDogfoodPostRunProofFactory>[0];
export declare function createTrustedRunnerPostRunProofServer(input: {
    socket_path: string;
    correlation_id: string;
    issue: (request: ProofRequest) => Promise<RealAgentDogfoodPostRunProof>;
    verify_peer: TrustedRunnerPeerIdentityVerifier;
}): {
    start(): Promise<void>;
    close(): Promise<void>;
};
export declare function createTrustedRunnerPostRunProofFactory(input: {
    socket_path: string;
    correlation_id: string;
    timeout_ms?: number;
}): RealAgentDogfoodPostRunProofFactory;
export {};
