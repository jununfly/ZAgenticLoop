import type { TransportAdapter } from './transport-contract.js';
export type OpnAgentWorkerProcessResult = {
    status: 'empty' | 'processed' | 'blocked';
    message_id?: string;
    reason?: string;
    side_effects_executed: false;
};
export type OpnAgentWorker = {
    runOnce(): Promise<OpnAgentWorkerProcessResult>;
    run(input?: {
        max_iterations?: number;
        idle_delay_ms?: number;
        signal?: AbortSignal;
    }): Promise<{
        iterations: number;
        stopped: true;
    }>;
    stop(): Promise<void>;
};
export declare function createOpnAgentWorker(input: {
    network_id: string;
    node_id: string;
    transport: Pick<TransportAdapter, 'openSession' | 'closeSession'>;
    processNext(input: {
        session_id: string;
    }): Promise<OpnAgentWorkerProcessResult>;
    on_error?: (error: unknown) => void;
}): OpnAgentWorker;
