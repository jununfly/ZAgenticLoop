#!/usr/bin/env node
import { runCli } from './cli.js';
import { dispatchSignal, readSignalEnvelope } from './dispatch-runner.js';
const exitCode = await runCli({
    name: 'zj-loop-dispatch',
    description: 'Dispatch a structured ZAgenticLoop signal through the Route Table.',
    usage: 'zj-loop-dispatch --signal <file> [--root <dir>] [--mode auto|plan-only|execute|resume] [--format json]',
    options: [
        { name: 'signal', type: 'string', description: 'Path to a zj-loop.signal.v1 JSON file' },
        { name: 'root', type: 'string', description: 'Project root', default: '.' },
        { name: 'mode', type: 'enum', description: 'Dispatch mode', values: ['auto', 'plan-only', 'execute', 'resume'], default: 'auto' },
        { name: 'format', type: 'enum', description: 'Output format', values: ['json'], default: 'json' },
        { name: 'now', type: 'string', description: 'Deterministic timestamp for automation/tests' },
    ],
    async handler({ io, options }) {
        if (typeof options.signal !== 'string' || !options.signal.trim()) {
            throw new Error('--signal is required');
        }
        const signal = await readSignalEnvelope({ path: options.signal });
        const output = await dispatchSignal({
            root: String(options.root ?? '.'),
            signal,
            mode: options.mode === 'auto' || options.mode === 'plan-only' || options.mode === 'execute' || options.mode === 'resume'
                ? options.mode
                : 'auto',
            now: typeof options.now === 'string' ? options.now : undefined,
        });
        io.stdout(JSON.stringify(output, null, 2));
        return output.status === 'hard_stopped' ? 2 : 0;
    },
});
process.exitCode = exitCode;
