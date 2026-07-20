#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { buildDependencySweeperExecutionPlan, executeDependencySweeperLiveRunner, readIssueFixRequest, } from './dependency-sweeper-runner.js';
import { createGitLabDependencySweeperRepairMr } from './gitlab-dependency-sweeper-adapter.js';
import { executeGitLabDependencySweeperCloseout } from './gitlab-dependency-sweeper-closeout.js';
import { runCli } from './cli.js';
import { runRouteConsumerCli } from './route-consumer-cli.js';
const argv = process.argv.slice(2);
if (argv[0] === 'repair-plan') {
    process.exitCode = await runCli({
        name: 'zj-loop-dependency-sweeper',
        description: 'Build Dependency Sweeper repair plan evidence from a consumed Issue Fix Request.',
        usage: 'zj-loop-dependency-sweeper repair-plan --request <path> [--live] [--confirm-live-repair <phrase>] [--out <path>] [--json]',
        options: [
            { name: 'command', type: 'positional', description: 'Command', default: 'repair-plan' },
            { name: 'request', type: 'string', description: 'Path to a consumed Issue Fix Request JSON file' },
            { name: 'live', type: 'boolean', description: 'Plan live repair side effects' },
            { name: 'confirm-live-repair', type: 'string', description: 'Fixed confirmation phrase for live repair' },
            { name: 'out', type: 'string', description: 'Write JSON plan to this path' },
            { name: 'json', type: 'boolean', description: 'Print JSON output' },
        ],
        async handler({ io, options }) {
            if (typeof options.request !== 'string')
                throw new Error('--request is required');
            const request = await readIssueFixRequest(options.request);
            const plan = buildDependencySweeperExecutionPlan({
                request,
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
else if (argv[0] === 'gitlab-repair-mr') {
    process.exitCode = await runCli({
        name: 'zj-loop-dependency-sweeper',
        description: 'Create a GitLab Dependency Sweeper repair MR from verifier-generated Commit API actions.',
        usage: 'zj-loop-dependency-sweeper gitlab-repair-mr --request <path> --actions <path> --project <group/project> --branch <branch> --source-ref <ref> --target-branch <branch> --commit-message <message> --title <title> --description <body> [--api-url <url>] [--out <path>] [--json]',
        options: [
            { name: 'command', type: 'positional', description: 'Command', default: 'gitlab-repair-mr' },
            { name: 'request', type: 'string', description: 'Consumed Issue Fix Request JSON path' },
            { name: 'actions', type: 'string', description: 'Verifier-generated GitLab Commit API actions JSON path' },
            { name: 'project', type: 'string', description: 'GitLab group/project path' },
            { name: 'branch', type: 'string', description: 'Deterministic repair branch' },
            { name: 'source-ref', type: 'string', description: 'Ref containing the verified fixture files' },
            { name: 'target-branch', type: 'string', description: 'Target branch' },
            { name: 'commit-message', type: 'string', description: 'Commit message' },
            { name: 'title', type: 'string', description: 'Merge Request title' },
            { name: 'description', type: 'string', description: 'Merge Request description' },
            { name: 'api-url', type: 'string', description: 'GitLab API v4 base URL' },
            { name: 'out', type: 'string', description: 'Write structured result JSON to this path' },
            { name: 'json', type: 'boolean', description: 'Print structured result JSON' },
        ],
        async handler({ io, options }) {
            for (const name of ['request', 'actions', 'project', 'branch', 'source-ref', 'target-branch', 'commit-message', 'title', 'description']) {
                if (typeof options[name] !== 'string' || String(options[name]).trim() === '')
                    throw new Error(`--${name} is required`);
            }
            const request = JSON.parse(await readFile(String(options.request), 'utf8'));
            const actions = JSON.parse(await readFile(String(options.actions), 'utf8'));
            const result = await createGitLabDependencySweeperRepairMr({
                projectPath: String(options.project),
                token: process.env.GITLAB_TOKEN,
                request,
                requestId: String(request.request_id ?? ''),
                branch: String(options.branch),
                sourceRef: String(options['source-ref']),
                targetBranch: String(options['target-branch']),
                commitMessage: String(options['commit-message']),
                title: String(options.title),
                description: String(options.description),
                actions,
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
        name: 'zj-loop-dependency-sweeper',
        description: 'Delete a merged GitLab Dependency Sweeper repair branch and close its carrier.',
        usage: 'zj-loop-dependency-sweeper gitlab-closeout --project <group/project> --merge-request <iid> --issue-iid <iid> --request-id <id> --claim-id <id> --branch <branch> --target-branch <branch> --confirm <phrase> [--api-url <url>] [--out <path>] [--json]',
        options: [
            { name: 'command', type: 'positional', description: 'Command', default: 'gitlab-closeout' },
            { name: 'project', type: 'string', description: 'GitLab group/project path' },
            { name: 'merge-request', type: 'string', description: 'Merged GitLab MR IID' },
            { name: 'issue-iid', type: 'string', description: 'Carrier Issue IID' },
            { name: 'request-id', type: 'string', description: 'Issue Fix Request id' },
            { name: 'claim-id', type: 'string', description: 'Winning claim id' },
            { name: 'branch', type: 'string', description: 'Merged repair branch' },
            { name: 'target-branch', type: 'string', description: 'MR target branch' },
            { name: 'confirm', type: 'string', description: 'Fixed destructive confirmation phrase' },
            { name: 'api-url', type: 'string', description: 'GitLab API v4 base URL' },
            { name: 'out', type: 'string', description: 'Write structured result JSON to this path' },
            { name: 'json', type: 'boolean', description: 'Print structured result JSON' },
        ],
        async handler({ io, options }) {
            for (const name of ['project', 'merge-request', 'issue-iid', 'request-id', 'claim-id', 'branch', 'target-branch', 'confirm']) {
                if (typeof options[name] !== 'string' || String(options[name]).trim() === '')
                    throw new Error(`--${name} is required`);
            }
            const result = await executeGitLabDependencySweeperCloseout({
                projectPath: String(options.project), token: process.env.GITLAB_TOKEN,
                mergeRequestIid: String(options['merge-request']), issueIid: String(options['issue-iid']), requestId: String(options['request-id']), claimId: String(options['claim-id']),
                branch: String(options.branch), targetBranch: String(options['target-branch']), confirmationPhrase: String(options.confirm),
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
else if (argv[0] === 'live-repair') {
    process.exitCode = await runCli({
        name: 'zj-loop-dependency-sweeper',
        description: 'Execute Dependency Sweeper live repair from a consumed Issue Fix Request.',
        usage: 'zj-loop-dependency-sweeper live-repair --request <path> --confirm-live-repair <phrase> [--existing-repair-pr-url <url>] [--out <path>] [--json]',
        options: [
            { name: 'command', type: 'positional', description: 'Command', default: 'live-repair' },
            { name: 'request', type: 'string', description: 'Path to a consumed Issue Fix Request JSON file' },
            { name: 'confirm-live-repair', type: 'string', description: 'Fixed confirmation phrase for live repair' },
            { name: 'existing-repair-pr-url', type: 'string', description: 'Existing open repair PR URL; reuse it without branch side effects' },
            { name: 'out', type: 'string', description: 'Write JSON result to this path' },
            { name: 'json', type: 'boolean', description: 'Print JSON output' },
        ],
        async handler({ io, options }) {
            if (typeof options.request !== 'string')
                throw new Error('--request is required');
            const request = await readIssueFixRequest(options.request);
            const plan = buildDependencySweeperExecutionPlan({
                request,
                live: true,
                confirmationPhrase: typeof options['confirm-live-repair'] === 'string'
                    ? options['confirm-live-repair']
                    : '',
                existingRepairPullRequestUrl: typeof options['existing-repair-pr-url'] === 'string'
                    ? options['existing-repair-pr-url']
                    : '',
            });
            const result = await executeDependencySweeperLiveRunner(plan);
            const text = `${JSON.stringify(result, null, 2)}\n`;
            if (typeof options.out === 'string')
                await writeFile(options.out, text);
            if (options.json === true || typeof options.out !== 'string')
                io.stdout(text.trimEnd());
            if (result.outcome !== 'repair-pr')
                return 1;
        },
    }, argv);
}
else {
    process.exitCode = await runRouteConsumerCli({
        name: 'zj-loop-dependency-sweeper',
        routeId: 'dependency-sweeper',
        description: 'Plan Dependency Sweeper execution through the Route Table consumer gate.',
    }, argv);
}
