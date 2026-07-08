import { buildConsumerRunPlan } from './consumer-runner.js';
import { runCli } from './cli.js';
const SHARED_OPTIONS = [
    { name: 'command', type: 'positional', description: 'Command', default: 'plan' },
    { name: 'root', type: 'string', description: 'Project root', default: '.' },
    { name: 'source', type: 'string', description: 'Signal source', default: 'workflow-dispatch' },
    { name: 'signalId', flag: 'signal-id', type: 'string', description: 'Signal id' },
    { name: 'json', type: 'boolean', description: 'Print JSON output' },
];
export async function runRouteConsumerCli(config, argv = process.argv.slice(2)) {
    return runCli({
        name: config.name,
        description: config.description,
        usage: `${config.name} plan [--root <dir>] [--source <source>] [--signal-id <id>] [--json]`,
        options: SHARED_OPTIONS,
        async handler({ io, options }) {
            if (options.command !== 'plan') {
                throw new Error(`Unknown command: ${String(options.command)}`);
            }
            const plan = await buildConsumerRunPlan({
                root: String(options.root ?? '.'),
                selector: config.routeId,
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
    }, argv);
}
