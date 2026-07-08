#!/usr/bin/env node
import { buildConsumerRunPlan } from './consumer-runner.js';
import { runCli } from './cli.js';
const exitCode = await runCli({
    name: 'zj-loop-consumer',
    description: 'Plan user-project Route consumer execution after Route Decision authorization.',
    usage: 'zj-loop-consumer plan <route-or-consumer> [--root <dir>] [--source <source>] [--signal-id <id>] [--json]',
    options: [
        { name: 'command', type: 'positional', description: 'Command', default: 'plan' },
        { name: 'selector', type: 'positional', description: 'Route id or consumer' },
        { name: 'root', type: 'string', description: 'Project root', default: '.' },
        { name: 'source', type: 'string', description: 'Signal source', default: 'workflow-dispatch' },
        { name: 'signalId', flag: 'signal-id', type: 'string', description: 'Signal id' },
        { name: 'json', type: 'boolean', description: 'Print JSON output' },
    ],
    async handler({ io, options }) {
        if (options.command !== 'plan') {
            throw new Error(`Unknown command: ${String(options.command)}`);
        }
        const selector = String(options.selector ?? '');
        if (!selector)
            throw new Error('plan requires a route id or consumer');
        const plan = await buildConsumerRunPlan({
            root: String(options.root ?? '.'),
            selector,
            source: String(options.source ?? 'workflow-dispatch'),
            signalId: typeof options.signalId === 'string' ? options.signalId : undefined,
        });
        if (options.json === true) {
            io.stdout(JSON.stringify(plan, null, 2));
        }
        else {
            io.stdout(`${plan.status} ${plan.route_id} consumer=${plan.consumer} readiness=${plan.readiness}`);
            io.stdout(`reason: ${plan.reason}`);
            for (const step of plan.next_steps)
                io.stdout(`next step: ${step}`);
        }
        return plan.allowed ? 0 : 2;
    },
});
process.exitCode = exitCode;
