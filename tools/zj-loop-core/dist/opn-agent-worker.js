function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export function createOpnAgentWorker(input) {
    if (!input.network_id.trim() || !input.node_id.trim())
        throw new Error('opn-agent-worker-identity-required');
    if (!input.transport || typeof input.transport.openSession !== 'function' || typeof input.transport.closeSession !== 'function')
        throw new Error('opn-agent-worker-transport-required');
    if (typeof input.processNext !== 'function')
        throw new Error('opn-agent-worker-processor-required');
    let session_id;
    let stopped = false;
    async function closeCurrentSession() {
        const current = session_id;
        session_id = undefined;
        if (current)
            await input.transport.closeSession({ session_id: current });
    }
    async function ensureSession() {
        if (stopped)
            throw new Error('opn-agent-worker-stopped');
        if (!session_id)
            session_id = (await input.transport.openSession({ network_id: input.network_id, node_id: input.node_id })).session_id;
        if (!session_id || !session_id.trim())
            throw new Error('opn-agent-worker-session-invalid');
        return session_id;
    }
    const worker = {
        async runOnce() {
            const current = await ensureSession();
            try {
                return await input.processNext({ session_id: current });
            }
            catch (error) {
                await closeCurrentSession();
                throw error;
            }
        },
        async run(options = {}) {
            const maxIterations = options.max_iterations;
            if (maxIterations !== undefined && (!Number.isInteger(maxIterations) || maxIterations < 1))
                throw new Error('opn-agent-worker-iterations-invalid');
            const idleDelay = options.idle_delay_ms ?? 1_000;
            if (!Number.isInteger(idleDelay) || idleDelay < 0 || idleDelay > 60_000)
                throw new Error('opn-agent-worker-idle-delay-invalid');
            let iterations = 0;
            try {
                while (!stopped && !options.signal?.aborted && (maxIterations === undefined || iterations < maxIterations)) {
                    const result = await worker.runOnce();
                    iterations += 1;
                    if (result.status === 'empty' && idleDelay > 0 && !stopped && !options.signal?.aborted)
                        await delay(idleDelay);
                }
                return { iterations, stopped: true };
            }
            finally {
                await closeCurrentSession();
            }
        },
        async stop() {
            stopped = true;
            await closeCurrentSession();
        },
    };
    return worker;
}
