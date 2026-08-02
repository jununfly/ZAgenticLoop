import { type Socket } from 'node:net';
import type { RealAgentDogfoodPostRunProof, RealAgentDogfoodPostRunProofFactory } from './real-agent-dogfood-post-run-proof.js';
type ProofRequest = Parameters<RealAgentDogfoodPostRunProofFactory>[0];
export declare function createTrustedRunnerPostRunProofServer(input: {
    socket_path: string;
    correlation_id: string;
    issue: (request: ProofRequest) => Promise<RealAgentDogfoodPostRunProof>;
    verify_peer: (socket: Socket) => Promise<boolean> | boolean;
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
