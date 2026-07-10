#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { buildCiSweeperIssueFixRequestBody, buildCiSweeperRepairPlan, } from './ci-sweeper-runner.js';
import { runCli } from './cli.js';
import { runRouteConsumerCli } from './route-consumer-cli.js';
const argv = process.argv.slice(2);
if (argv[0] === 'repair-plan') {
    process.exitCode = await runCli({
        name: 'zj-loop-ci-sweeper',
        description: 'Plan CI Sweeper deterministic repair commands.',
        usage: 'zj-loop-ci-sweeper repair-plan [--packages <dirs>] [--root <dir>] [--json]',
        options: [
            { name: 'command', type: 'positional', description: 'Command', default: 'repair-plan' },
            { name: 'packages', type: 'string', description: 'Comma-separated package directories', default: '' },
            { name: 'root', type: 'string', description: 'Project root', default: '.' },
            { name: 'json', type: 'boolean', description: 'Print JSON output' },
        ],
        async handler({ io, options }) {
            const packageDirectories = String(options.packages ?? '')
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean);
            const plan = await buildCiSweeperRepairPlan({
                root: String(options.root ?? '.'),
                packageDirectories,
            });
            if (options.json === true) {
                io.stdout(JSON.stringify(plan, null, 2));
            }
            else {
                for (const step of plan.commands) {
                    io.stdout(`${step.cwd ? `${step.cwd}: ` : ''}${[step.command, ...step.args].join(' ')}`);
                }
            }
        },
    }, argv);
}
else if (argv[0] === 'request-body') {
    process.exitCode = await runCli({
        name: 'zj-loop-ci-sweeper',
        description: 'Build CI Sweeper Issue Fix Request issue body from a Route Decision.',
        usage: 'zj-loop-ci-sweeper request-body --route-decision <path> --repo <owner/repo> [--provider github|gitlab] [--workflow <name>] [--run-id <id>] [--source-url <url>] [--out <path>] [--json]',
        options: [
            { name: 'command', type: 'positional', description: 'Command', default: 'request-body' },
            { name: 'route-decision', type: 'string', description: 'Route Decision JSON path' },
            { name: 'repo', type: 'string', description: 'Repository owner/name' },
            { name: 'provider', type: 'string', description: 'Source provider: github or gitlab' },
            { name: 'workflow', type: 'string', description: 'Source workflow name' },
            { name: 'run-id', type: 'string', description: 'Source workflow run id' },
            { name: 'source-url', type: 'string', description: 'Source workflow run URL' },
            { name: 'out', type: 'string', description: 'Write issue body to this path' },
            { name: 'json', type: 'boolean', description: 'Print JSON metadata instead of body' },
        ],
        async handler({ io, options }) {
            if (typeof options['route-decision'] !== 'string')
                throw new Error('--route-decision is required');
            if (typeof options.repo !== 'string')
                throw new Error('--repo is required');
            const routeDecision = JSON.parse(await readFile(String(options['route-decision']), 'utf8'));
            const body = buildCiSweeperIssueFixRequestBody({
                routeDecision,
                repo: String(options.repo),
                provider: options.provider === 'gitlab' ? 'gitlab' : options.provider === 'github' ? 'github' : undefined,
                workflowName: typeof options.workflow === 'string' ? options.workflow : undefined,
                runId: typeof options['run-id'] === 'string' ? options['run-id'] : undefined,
                sourceUrl: typeof options['source-url'] === 'string' ? options['source-url'] : undefined,
            });
            if (typeof options.out === 'string')
                await writeFile(options.out, body);
            if (options.json === true) {
                io.stdout(JSON.stringify({ schema: 'zj-loop.ci_sweeper_request_body_result.v1', written: typeof options.out === 'string', bytes: body.length }, null, 2));
            }
            else if (typeof options.out !== 'string') {
                io.stdout(body);
            }
        },
    }, argv);
}
else {
    process.exitCode = await runRouteConsumerCli({
        name: 'zj-loop-ci-sweeper',
        routeId: 'ci-sweeper',
        description: 'Plan CI Sweeper execution through the Route Table consumer gate.',
    }, argv);
}
