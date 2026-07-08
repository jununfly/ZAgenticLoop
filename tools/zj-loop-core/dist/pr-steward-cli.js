#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { buildPrStewardExecutionPlan, readPrStewardIssueFixRequest, } from './pr-steward-runner.js';
import { runCli } from './cli.js';
import { runRouteConsumerCli } from './route-consumer-cli.js';
const argv = process.argv.slice(2);
if (argv[0] === 'fix-plan') {
    process.exitCode = await runCli({
        name: 'zj-loop-pr-steward',
        description: 'Build PR Steward fix or escalation plan evidence from a consumed Issue Fix Request.',
        usage: 'zj-loop-pr-steward fix-plan --request <path> --current-pr-head-sha <sha> [--repair-command <command>] [--repair-files <csv>] [--live] [--confirm-live-repair <phrase>] [--out <path>] [--json]',
        options: [
            { name: 'command', type: 'positional', description: 'Command', default: 'fix-plan' },
            { name: 'request', type: 'string', description: 'Path to a consumed Issue Fix Request JSON file' },
            { name: 'current-pr-head-sha', type: 'string', description: 'Current source PR head SHA' },
            { name: 'repair-command', type: 'string', description: 'Deterministic repair command' },
            { name: 'repair-files', type: 'string', description: 'Comma-separated repair files' },
            { name: 'live', type: 'boolean', description: 'Plan live side effects' },
            { name: 'confirm-live-repair', type: 'string', description: 'Fixed confirmation phrase for live repair' },
            { name: 'out', type: 'string', description: 'Write JSON plan to this path' },
            { name: 'json', type: 'boolean', description: 'Print JSON output' },
        ],
        async handler({ io, options }) {
            if (typeof options.request !== 'string')
                throw new Error('--request is required');
            if (typeof options['current-pr-head-sha'] !== 'string')
                throw new Error('--current-pr-head-sha is required');
            const request = await readPrStewardIssueFixRequest(options.request);
            const plan = buildPrStewardExecutionPlan({
                request,
                currentPrHeadSha: options['current-pr-head-sha'],
                repairCommands: typeof options['repair-command'] === 'string' ? [options['repair-command']] : [],
                repairFiles: typeof options['repair-files'] === 'string'
                    ? options['repair-files'].split(',').map((item) => item.trim()).filter(Boolean)
                    : [],
                live: options.live === true,
                confirmationPhrase: typeof options['confirm-live-repair'] === 'string'
                    ? options['confirm-live-repair']
                    : '',
            });
            const text = `${JSON.stringify(plan, null, 2)}\n`;
            if (typeof options.out === 'string')
                await writeFile(options.out, text);
            if (options.json === true || typeof options.out !== 'string')
                io.stdout(text.trimEnd());
            if (plan.status === 'refused')
                return 1;
        },
    }, argv);
}
else {
    process.exitCode = await runRouteConsumerCli({
        name: 'zj-loop-pr-steward',
        routeId: 'pr-steward-fix-request',
        description: 'Plan PR Steward fix-request execution through the Route Table consumer gate.',
    }, argv);
}
