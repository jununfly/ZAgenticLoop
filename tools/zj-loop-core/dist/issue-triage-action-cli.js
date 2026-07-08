#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { buildIssueTriageActionRequest, readIssueTriageActionRequest, runIssueTriageActionRunner, } from './issue-triage-action-runner.js';
import { runCli } from './cli.js';
import { findRoute, loadRouteTable } from './route.js';
import { runRouteConsumerCli } from './route-consumer-cli.js';
const argv = process.argv.slice(2);
if (argv[0] === 'action-plan') {
    process.exitCode = await runCli({
        name: 'zj-loop-issue-triage-action',
        description: 'Build Issue Triage Action dry-run evidence from a triage action request.',
        usage: 'zj-loop-issue-triage-action action-plan [--request <path>] [--root <dir>] [--live] [--out <path>] [--json]',
        options: [
            { name: 'command', type: 'positional', description: 'Command', default: 'action-plan' },
            { name: 'request', type: 'string', description: 'Path to an Issue Triage Action Request JSON file' },
            { name: 'root', type: 'string', description: 'Project root', default: '.' },
            { name: 'live', type: 'boolean', description: 'Attempt live action planning; currently rejected by contract' },
            { name: 'out', type: 'string', description: 'Write JSON result to this path' },
            { name: 'json', type: 'boolean', description: 'Print JSON output' },
        ],
        async handler({ io, options }) {
            const table = await loadRouteTable(String(options.root ?? '.'));
            const route = findRoute(table, 'issue-triage-action');
            const request = typeof options.request === 'string'
                ? await readIssueTriageActionRequest(options.request)
                : buildIssueTriageActionRequest();
            const result = runIssueTriageActionRunner({
                route,
                request,
                live: options.live === true,
            });
            const text = `${JSON.stringify(result, null, 2)}\n`;
            if (typeof options.out === 'string')
                await writeFile(options.out, text);
            if (options.json === true || typeof options.out !== 'string')
                io.stdout(text.trimEnd());
            if (result.validation.ok !== true || result.decision.status === 'rejected')
                return 1;
        },
    }, argv);
}
else {
    process.exitCode = await runRouteConsumerCli({
        name: 'zj-loop-issue-triage-action',
        routeId: 'issue-triage-action',
        description: 'Plan Issue Triage Action execution through the Route Table consumer gate.',
    }, argv);
}
