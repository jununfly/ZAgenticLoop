#!/usr/bin/env node
import { runCli } from './cli.js';
import { readSignalEnvelope } from './dispatch-runner.js';
import { evaluateRuntimePreflight } from './preflight.js';
import { findRoute, loadRouteTable } from './route.js';
const EXECUTION_LAYERS = ['report-only', 'review-artifact', 'live-side-effect'];
export async function runPreflightCli(argv = process.argv.slice(2)) {
    return runCli({
        name: 'zj-loop-preflight',
        description: 'Replay ZAgenticLoop runtime preflight for a route and signal.',
        usage: 'zj-loop-preflight --route <route> --execution-layer report-only|review-artifact|live-side-effect [--signal <file>] [--root <dir>] [--json]',
        options: [
            { name: 'root', type: 'string', description: 'Project root', default: '.' },
            { name: 'route', type: 'string', description: 'Route id or consumer selector' },
            {
                name: 'executionLayer',
                flag: 'execution-layer',
                type: 'enum',
                values: EXECUTION_LAYERS,
                description: 'Preflight execution layer',
                default: 'review-artifact',
            },
            { name: 'signal', type: 'string', description: 'Signal envelope JSON file' },
            { name: 'actorRole', flag: 'actor-role', type: 'string', description: 'Actor role for live side effects' },
            { name: 'workUnits', flag: 'work-units', type: 'string', description: 'Requested work units', default: '1' },
            { name: 'json', type: 'boolean', description: 'Print JSON output' },
        ],
        async handler({ io, options }) {
            if (typeof options.route !== 'string' || options.route.trim().length === 0) {
                throw new Error('--route is required');
            }
            const root = String(options.root ?? '.');
            const table = await loadRouteTable(root);
            const route = findRoute(table, options.route);
            const signal = typeof options.signal === 'string'
                ? await readSignalEnvelope({ path: options.signal })
                : undefined;
            const result = evaluateRuntimePreflight({
                route,
                executionLayer: String(options.executionLayer),
                signal,
                runtime: {
                    actorRole: typeof options.actorRole === 'string' ? options.actorRole : undefined,
                    credentials: process.env,
                    workUnitsRequested: parseWorkUnits(options.workUnits),
                },
            });
            if (options.json === true) {
                io.stdout(JSON.stringify(result, null, 2));
            }
            else {
                io.stdout(`${result.status} ${result.route_id} layer=${result.execution_layer}`);
                for (const warning of result.warnings)
                    io.stdout(`warning: ${warning}`);
                if (result.stop_signal)
                    io.stdout(`stop: ${result.stop_signal.stop_code} ${result.stop_signal.reason}`);
            }
            return result.status === 'hard_stop' ? 2 : 0;
        },
    }, argv);
}
function parseWorkUnits(value) {
    if (typeof value !== 'string' || !/^\d+$/.test(value))
        return 1;
    return Number(value);
}
runPreflightCli().then((code) => {
    process.exitCode = code;
}).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
