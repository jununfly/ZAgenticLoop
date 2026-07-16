#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { buildCiSweeperIssueFixRequestBody, buildCiSweeperRepairPlan, claimGitLabCiSweeperIssueFixRequest, createGitLabCiSweeperIssueFixRequest, executeGitLabCiSweeperCloseout, executeGitLabCiSweeperRepairMr, triggerGitLabCiSweeperConsumerPipeline, } from './ci-sweeper-runner.js';
import { runCli } from './cli.js';
import { runRouteConsumerCli } from './route-consumer-cli.js';
import { loadRouteTable } from './route.js';
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
        usage: 'zj-loop-ci-sweeper request-body --route-decision <path> --repo <owner/repo> [--provider github|gitlab] [--workflow <name>] [--run-id <id>] [--source-url <url>] [--repair-actions <path>] [--out <path>] [--json]',
        options: [
            { name: 'command', type: 'positional', description: 'Command', default: 'request-body' },
            { name: 'route-decision', type: 'string', description: 'Route Decision JSON path' },
            { name: 'repo', type: 'string', description: 'Repository owner/name' },
            { name: 'provider', type: 'string', description: 'Source provider: github or gitlab' },
            { name: 'workflow', type: 'string', description: 'Source workflow name' },
            { name: 'run-id', type: 'string', description: 'Source workflow run id' },
            { name: 'source-url', type: 'string', description: 'Source workflow run URL' },
            { name: 'repair-actions', type: 'string', description: 'Structured repair action JSON path' },
            { name: 'out', type: 'string', description: 'Write issue body to this path' },
            { name: 'json', type: 'boolean', description: 'Print JSON metadata instead of body' },
        ],
        async handler({ io, options }) {
            if (typeof options['route-decision'] !== 'string')
                throw new Error('--route-decision is required');
            if (typeof options.repo !== 'string')
                throw new Error('--repo is required');
            const routeDecision = JSON.parse(await readFile(String(options['route-decision']), 'utf8'));
            const repairActions = typeof options['repair-actions'] === 'string'
                ? JSON.parse(await readFile(String(options['repair-actions']), 'utf8'))
                : undefined;
            const body = buildCiSweeperIssueFixRequestBody({
                routeDecision,
                repo: String(options.repo),
                provider: options.provider === 'gitlab' ? 'gitlab' : options.provider === 'github' ? 'github' : undefined,
                workflowName: typeof options.workflow === 'string' ? options.workflow : undefined,
                runId: typeof options['run-id'] === 'string' ? options['run-id'] : undefined,
                sourceUrl: typeof options['source-url'] === 'string' ? options['source-url'] : undefined,
                repairActions,
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
else if (argv[0] === 'gitlab-issue-fix-request') {
    process.exitCode = await runCli({
        name: 'zj-loop-ci-sweeper',
        description: 'Create or reuse a GitLab Issue Fix Request carrier.',
        usage: 'zj-loop-ci-sweeper gitlab-issue-fix-request --request-body <path> --project <group/project> --title <title> [--api-url <url>] [--out <path>] [--json]',
        options: [
            { name: 'command', type: 'positional', description: 'Command', default: 'gitlab-issue-fix-request' },
            { name: 'request-body', type: 'string', description: 'Structured Issue Fix Request Markdown path' },
            { name: 'project', type: 'string', description: 'GitLab group/project path' },
            { name: 'title', type: 'string', description: 'GitLab Issue title' },
            { name: 'api-url', type: 'string', description: 'GitLab API v4 base URL' },
            { name: 'out', type: 'string', description: 'Write structured result JSON to this path' },
            { name: 'json', type: 'boolean', description: 'Print structured result JSON' },
        ],
        async handler({ io, options }) {
            if (typeof options['request-body'] !== 'string')
                throw new Error('--request-body is required');
            if (typeof options.project !== 'string')
                throw new Error('--project is required');
            if (typeof options.title !== 'string')
                throw new Error('--title is required');
            const result = await createGitLabCiSweeperIssueFixRequest({
                projectPath: String(options.project),
                token: process.env.GITLAB_TOKEN,
                title: String(options.title),
                requestBody: await readFile(String(options['request-body']), 'utf8'),
                apiBaseUrl: typeof options['api-url'] === 'string' ? String(options['api-url']) : undefined,
            });
            const text = `${JSON.stringify(result, null, 2)}\n`;
            if (typeof options.out === 'string')
                await writeFile(String(options.out), text);
            if (options.json === true || typeof options.out !== 'string')
                io.stdout(text.trimEnd());
            return result.status === 'completed' ? 0 : 2;
        },
    }, argv);
}
else if (argv[0] === 'gitlab-claim') {
    process.exitCode = await runCli({
        name: 'zj-loop-ci-sweeper',
        description: 'Claim an explicitly identified GitLab Issue Fix Request.',
        usage: 'zj-loop-ci-sweeper gitlab-claim --root <dir> --project <group/project> --issue-iid <iid> --request-id <id> --claim-id <id> --source-pipeline-id <id> [--api-url <url>] [--out <path>] [--json]',
        options: [
            { name: 'command', type: 'positional', description: 'Command', default: 'gitlab-claim' },
            { name: 'root', type: 'string', description: 'Project root containing Route Table', default: '.' },
            { name: 'project', type: 'string', description: 'GitLab group/project path' },
            { name: 'issue-iid', type: 'string', description: 'Explicit GitLab Issue IID' },
            { name: 'request-id', type: 'string', description: 'Explicit Issue Fix Request id' },
            { name: 'claim-id', type: 'string', description: 'Deterministic claim id' },
            { name: 'source-pipeline-id', type: 'string', description: 'Consumer source pipeline id' },
            { name: 'api-url', type: 'string', description: 'GitLab API v4 base URL' },
            { name: 'out', type: 'string', description: 'Write structured result JSON to this path' },
            { name: 'json', type: 'boolean', description: 'Print structured result JSON' },
        ],
        async handler({ io, options }) {
            for (const name of ['project', 'issue-iid', 'request-id', 'claim-id', 'source-pipeline-id']) {
                if (typeof options[name] !== 'string' || String(options[name]).trim() === '')
                    throw new Error(`--${name} is required`);
            }
            const result = await claimGitLabCiSweeperIssueFixRequest({
                projectPath: String(options.project),
                issueIid: String(options['issue-iid']),
                token: process.env.GITLAB_TOKEN,
                requestId: String(options['request-id']),
                claimId: String(options['claim-id']),
                sourcePipelineId: String(options['source-pipeline-id']),
                route: await findCiSweeperRoute(String(options.root ?? '.')),
                apiBaseUrl: typeof options['api-url'] === 'string' ? String(options['api-url']) : undefined,
            });
            const text = `${JSON.stringify(result, null, 2)}\n`;
            if (typeof options.out === 'string')
                await writeFile(String(options.out), text);
            if (options.json === true || typeof options.out !== 'string')
                io.stdout(text.trimEnd());
            return result.status === 'completed' ? 0 : 2;
        },
    }, argv);
}
else if (argv[0] === 'gitlab-trigger-consumer') {
    process.exitCode = await runCli({
        name: 'zj-loop-ci-sweeper',
        description: 'Trigger an explicitly identified GitLab CI Sweeper consumer pipeline.',
        usage: 'zj-loop-ci-sweeper gitlab-trigger-consumer --project <group/project> --ref <branch> --issue-iid <iid> --request-id <id> --claim-id <id> [--api-url <url>] [--out <path>] [--json]',
        options: [
            { name: 'command', type: 'positional', description: 'Command', default: 'gitlab-trigger-consumer' },
            { name: 'project', type: 'string', description: 'GitLab group/project path' },
            { name: 'ref', type: 'string', description: 'Fixed consumer ref, normally CI_DEFAULT_BRANCH' },
            { name: 'issue-iid', type: 'string', description: 'Explicit GitLab Issue IID' },
            { name: 'request-id', type: 'string', description: 'Explicit Issue Fix Request id' },
            { name: 'claim-id', type: 'string', description: 'Deterministic claim id' },
            { name: 'api-url', type: 'string', description: 'GitLab API v4 base URL' },
            { name: 'out', type: 'string', description: 'Write structured result JSON to this path' },
            { name: 'json', type: 'boolean', description: 'Print structured result JSON' },
        ],
        async handler({ io, options }) {
            for (const name of ['project', 'ref', 'issue-iid', 'request-id', 'claim-id']) {
                if (typeof options[name] !== 'string' || String(options[name]).trim() === '')
                    throw new Error(`--${name} is required`);
            }
            const result = await triggerGitLabCiSweeperConsumerPipeline({
                projectPath: String(options.project),
                token: process.env.GITLAB_TOKEN,
                ref: String(options.ref),
                issueIid: String(options['issue-iid']),
                requestId: String(options['request-id']),
                claimId: String(options['claim-id']),
                apiBaseUrl: typeof options['api-url'] === 'string' ? String(options['api-url']) : undefined,
            });
            const text = `${JSON.stringify(result, null, 2)}\n`;
            if (typeof options.out === 'string')
                await writeFile(String(options.out), text);
            if (options.json === true || typeof options.out !== 'string')
                io.stdout(text.trimEnd());
            return result.status === 'completed' ? 0 : 2;
        },
    }, argv);
}
else if (argv[0] === 'gitlab-repair-mr') {
    process.exitCode = await runCli({
        name: 'zj-loop-ci-sweeper',
        description: 'Execute bounded GitLab CI Sweeper claim, verifier, and repair MR flow.',
        usage: 'zj-loop-ci-sweeper gitlab-repair-mr --root <dir> --project <group/project> --issue-iid <iid> --request-id <id> --claim-id <id> --source-pipeline-id <id> --branch <branch> --target-branch <branch> --commit-message <message> --title <title> --description <text> [--api-url <url>] [--out <path>] [--json]',
        options: [
            { name: 'command', type: 'positional', description: 'Command', default: 'gitlab-repair-mr' },
            { name: 'root', type: 'string', description: 'Project root containing Route Table', default: '.' },
            { name: 'project', type: 'string', description: 'GitLab group/project path' },
            { name: 'issue-iid', type: 'string', description: 'Explicit GitLab Issue IID' },
            { name: 'request-id', type: 'string', description: 'Explicit Issue Fix Request id' },
            { name: 'claim-id', type: 'string', description: 'Deterministic claim id' },
            { name: 'source-pipeline-id', type: 'string', description: 'Consumer source pipeline id' },
            { name: 'branch', type: 'string', description: 'Deterministic repair branch' },
            { name: 'target-branch', type: 'string', description: 'Fixed consumer target branch' },
            { name: 'commit-message', type: 'string', description: 'Repair commit message' },
            { name: 'title', type: 'string', description: 'Repair MR title' },
            { name: 'description', type: 'string', description: 'Repair MR description' },
            { name: 'api-url', type: 'string', description: 'GitLab API v4 base URL' },
            { name: 'out', type: 'string', description: 'Write structured result JSON to this path' },
            { name: 'json', type: 'boolean', description: 'Print structured result JSON' },
        ],
        async handler({ io, options }) {
            for (const name of ['project', 'issue-iid', 'request-id', 'claim-id', 'source-pipeline-id', 'branch', 'target-branch', 'commit-message', 'title', 'description']) {
                if (typeof options[name] !== 'string' || String(options[name]).trim() === '')
                    throw new Error(`--${name} is required`);
            }
            const result = await executeGitLabCiSweeperRepairMr({
                projectPath: String(options.project),
                issueIid: String(options['issue-iid']),
                requestId: String(options['request-id']),
                claimId: String(options['claim-id']),
                sourcePipelineId: String(options['source-pipeline-id']),
                token: process.env.GITLAB_TOKEN,
                route: await findCiSweeperRoute(String(options.root ?? '.')),
                branch: String(options.branch),
                targetBranch: String(options['target-branch']),
                commitMessage: String(options['commit-message']),
                title: String(options.title),
                description: String(options.description),
                apiBaseUrl: typeof options['api-url'] === 'string' ? String(options['api-url']) : undefined,
            });
            const text = `${JSON.stringify(result, null, 2)}\n`;
            if (typeof options.out === 'string')
                await writeFile(String(options.out), text);
            if (options.json === true || typeof options.out !== 'string')
                io.stdout(text.trimEnd());
            return result.status === 'completed' ? 0 : 2;
        },
    }, argv);
}
else if (argv[0] === 'gitlab-closeout') {
    process.exitCode = await runCli({
        name: 'zj-loop-ci-sweeper',
        description: 'Execute guarded GitLab CI Sweeper repair MR closeout.',
        usage: 'zj-loop-ci-sweeper gitlab-closeout --project <group/project> --merge-request <iid> --issue-iid <iid> --request-id <id> --branch <branch> --target-branch <branch> --confirm <fixed phrase> [--api-url <url>] [--out <path>] [--json]',
        options: [
            { name: 'command', type: 'positional', description: 'Command', default: 'gitlab-closeout' },
            { name: 'project', type: 'string', description: 'GitLab group/project path' },
            { name: 'merge-request', type: 'string', description: 'Merged GitLab repair MR IID' },
            { name: 'issue-iid', type: 'string', description: 'Issue Fix Request carrier IID' },
            { name: 'request-id', type: 'string', description: 'Explicit Issue Fix Request id' },
            { name: 'branch', type: 'string', description: 'Merged automated CI Sweeper repair branch' },
            { name: 'target-branch', type: 'string', description: 'Merged repair target branch' },
            { name: 'confirm', type: 'string', description: 'Fixed destructive cleanup confirmation phrase' },
            { name: 'api-url', type: 'string', description: 'GitLab API v4 base URL' },
            { name: 'out', type: 'string', description: 'Write structured result JSON to this path' },
            { name: 'json', type: 'boolean', description: 'Print structured result JSON' },
        ],
        async handler({ io, options }) {
            for (const name of ['project', 'merge-request', 'issue-iid', 'request-id', 'branch', 'target-branch', 'confirm']) {
                if (typeof options[name] !== 'string' || String(options[name]).trim() === '')
                    throw new Error(`--${name} is required`);
            }
            const result = await executeGitLabCiSweeperCloseout({
                projectPath: String(options.project),
                mergeRequestIid: String(options['merge-request']),
                issueIid: String(options['issue-iid']),
                requestId: String(options['request-id']),
                branch: String(options.branch),
                targetBranch: String(options['target-branch']),
                confirmationPhrase: String(options.confirm),
                token: process.env.GITLAB_TOKEN,
                apiBaseUrl: typeof options['api-url'] === 'string' ? String(options['api-url']) : undefined,
            });
            const text = `${JSON.stringify(result, null, 2)}\n`;
            if (typeof options.out === 'string')
                await writeFile(String(options.out), text);
            if (options.json === true || typeof options.out !== 'string')
                io.stdout(text.trimEnd());
            return result.status === 'completed' ? 0 : 2;
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
async function findCiSweeperRoute(root) {
    const table = await loadRouteTable(root);
    const routes = [...(table.routes ?? []), ...(table.disabled_dispatch_routes ?? [])];
    const route = routes.find((candidate) => candidate.route_id === 'ci-sweeper' || candidate.consumer === 'ci-sweeper');
    if (!route)
        throw new Error('ci-sweeper-route-missing');
    return route;
}
