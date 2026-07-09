#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { buildRoadmapBoundedSlicePack, buildActivationRequestId, buildRoadmapActivationBranchName, buildRoadmapActivationPrContract, buildRoadmapActivationPrTitle, dispatchRoadmapActivationCommand, readActivationComments, renderRoadmapActivationWorkflowSummary, verifyRoadmapBoundedSliceResult, } from './roadmap-activation-runner.js';
import { runCli } from './cli.js';
import { findRoute, loadRouteTable } from './route.js';
import { runRouteConsumerCli } from './route-consumer-cli.js';
const argv = process.argv.slice(2);
if (argv[0] === 'activation-plan') {
    process.exitCode = await runCli({
        name: 'zj-loop-roadmap-activation',
        description: 'Build Roadmap-Sliced Development activation request evidence.',
        usage: 'zj-loop-roadmap-activation activation-plan --command-text <cmd> --requested-by <user> --permission <perm> --source-issue <n> --command-comment-id <id> [--comments <path>] [--root <dir>] [--out <path>] [--comment-out <path>] [--json]',
        options: [
            { name: 'command', type: 'positional', description: 'Command', default: 'activation-plan' },
            { name: 'command-text', type: 'string', description: 'Slash command text' },
            { name: 'requested-by', type: 'string', description: 'Requester login' },
            { name: 'permission', type: 'string', description: 'Requester repository permission' },
            { name: 'source-issue', type: 'string', description: 'Source issue number' },
            { name: 'command-comment-id', type: 'string', description: 'Slash command comment id' },
            { name: 'comments', type: 'string', description: 'JSON file containing existing issue comments' },
            { name: 'root', type: 'string', description: 'Project root', default: '.' },
            { name: 'out', type: 'string', description: 'Write JSON result to this path' },
            { name: 'comment-out', type: 'string', description: 'Write activation comment body to this path' },
            { name: 'json', type: 'boolean', description: 'Print JSON output' },
        ],
        async handler({ io, options }) {
            for (const key of ['command-text', 'requested-by', 'permission', 'source-issue', 'command-comment-id']) {
                if (typeof options[key] !== 'string')
                    throw new Error(`--${key} is required`);
            }
            const table = await loadRouteTable(String(options.root ?? '.'));
            const route = findRoute(table, 'roadmap-sliced-development');
            const comments = typeof options.comments === 'string' ? await readActivationComments(options.comments) : [];
            const result = dispatchRoadmapActivationCommand({
                route,
                commandText: String(options['command-text']),
                requestedBy: String(options['requested-by']),
                requestedByPermission: String(options.permission),
                sourceIssue: String(options['source-issue']),
                commandCommentId: String(options['command-comment-id']),
                comments,
            });
            const activationRequestId = result.action === 'create-request'
                ? buildActivationRequestId({
                    sourceIssue: String(options['source-issue']),
                    commandCommentId: String(options['command-comment-id']),
                    commandText: String(options['command-text']),
                })
                : undefined;
            const summary = renderRoadmapActivationWorkflowSummary({
                action: result.action,
                routeDecision: result.routeDecision,
                activationRequestId,
            });
            const text = `${JSON.stringify({
                action: result.action,
                routeDecision: result.routeDecision,
                activationRequestId,
                commentCreated: Boolean(result.commentBody),
                nextSteps: summary.match(/### Next Steps\n\n([\s\S]*)$/)?.[1]
                    ?.trim()
                    .split('\n')
                    .map((line) => line.replace(/^- /, '')) ?? [],
            }, null, 2)}\n`;
            if (typeof options.out === 'string')
                await writeFile(options.out, text);
            if (typeof options['comment-out'] === 'string' && result.commentBody) {
                await writeFile(options['comment-out'], result.commentBody);
            }
            if (options.json === true || typeof options.out !== 'string')
                io.stdout(text.trimEnd());
            if (!result.routeDecision.allowed && result.action !== 'denied' && result.action !== 'unsupported-pattern')
                return 1;
        },
    }, argv);
}
else if (argv[0] === 'bounded-slices-pack') {
    process.exitCode = await runCli({
        name: 'zj-loop-roadmap-activation',
        description: 'Build deterministic bounded-slices execution pack for Roadmap-Sliced Development.',
        usage: 'zj-loop-roadmap-activation bounded-slices-pack --activation-request-id <id> --roadmap-path <path> --branch-name <branch> [--slices <path>] [--max-slices <n>] [--out <path>] [--json]',
        options: [
            { name: 'command', type: 'positional', description: 'Command', default: 'bounded-slices-pack' },
            { name: 'activation-request-id', type: 'string', description: 'Stable activation request id' },
            { name: 'roadmap-path', type: 'string', description: 'Process roadmap path' },
            { name: 'branch-name', type: 'string', description: 'Activation branch name' },
            { name: 'slices', type: 'string', description: 'JSON file containing leaf slice definitions' },
            { name: 'max-slices', type: 'string', description: 'Maximum leaf slices to pack; defaults to 30' },
            { name: 'out', type: 'string', description: 'Write JSON result to this path' },
            { name: 'json', type: 'boolean', description: 'Print JSON output' },
        ],
        async handler({ io, options }) {
            for (const key of ['activation-request-id', 'roadmap-path', 'branch-name']) {
                if (typeof options[key] !== 'string')
                    throw new Error(`--${key} is required`);
            }
            const leafSlices = typeof options.slices === 'string'
                ? JSON.parse(await readFile(String(options.slices), 'utf8'))
                : [];
            const result = buildRoadmapBoundedSlicePack({
                activationRequestId: String(options['activation-request-id']),
                roadmapPath: String(options['roadmap-path']),
                branchName: String(options['branch-name']),
                maxSlices: typeof options['max-slices'] === 'string' ? Number(options['max-slices']) : undefined,
                leafSlices,
            });
            const text = `${JSON.stringify(result, null, 2)}\n`;
            if (typeof options.out === 'string')
                await writeFile(options.out, text);
            if (options.json === true || typeof options.out !== 'string')
                io.stdout(text.trimEnd());
        },
    }, argv);
}
else if (argv[0] === 'bounded-slices-verify') {
    process.exitCode = await runCli({
        name: 'zj-loop-roadmap-activation',
        description: 'Verify gate-backed bounded-slices result evidence.',
        usage: 'zj-loop-roadmap-activation bounded-slices-verify --pack <path> --result <path> [--out <path>] [--json]',
        options: [
            { name: 'command', type: 'positional', description: 'Command', default: 'bounded-slices-verify' },
            { name: 'pack', type: 'string', description: 'Bounded-slices pack JSON path' },
            { name: 'result', type: 'string', description: 'Bounded-slices result JSON path' },
            { name: 'out', type: 'string', description: 'Write JSON verification to this path' },
            { name: 'json', type: 'boolean', description: 'Print JSON output' },
        ],
        async handler({ io, options }) {
            for (const key of ['pack', 'result']) {
                if (typeof options[key] !== 'string')
                    throw new Error(`--${key} is required`);
            }
            const verification = verifyRoadmapBoundedSliceResult({
                pack: JSON.parse(await readFile(String(options.pack), 'utf8')),
                result: JSON.parse(await readFile(String(options.result), 'utf8')),
            });
            const text = `${JSON.stringify(verification, null, 2)}\n`;
            if (typeof options.out === 'string')
                await writeFile(options.out, text);
            if (options.json === true || typeof options.out !== 'string')
                io.stdout(text.trimEnd());
            if (verification.status !== 'passed')
                return 1;
        },
    }, argv);
}
else if (argv[0] === 'contract-plan') {
    process.exitCode = await runCli({
        name: 'zj-loop-roadmap-activation',
        description: 'Build deterministic Roadmap Activation branch, PR title, and PR contract evidence.',
        usage: 'zj-loop-roadmap-activation contract-plan --activation-request-id <id> --source-issue-url <url> --source-comment-url <url> [--title <title>] [--source-issue <n>] [--process-roadmap-path <path>] [--out <path>] [--json]',
        options: [
            { name: 'command', type: 'positional', description: 'Command', default: 'contract-plan' },
            { name: 'activation-request-id', type: 'string', description: 'Stable activation request id' },
            { name: 'title', type: 'string', description: 'Roadmap PR short title' },
            { name: 'source-issue', type: 'string', description: 'Source issue number' },
            { name: 'source-issue-url', type: 'string', description: 'Source GitHub issue URL' },
            { name: 'source-comment-url', type: 'string', description: 'Source GitHub issue comment URL' },
            { name: 'process-roadmap-path', type: 'string', description: 'Process roadmap path for closeout evidence' },
            { name: 'out', type: 'string', description: 'Write JSON result to this path' },
            { name: 'json', type: 'boolean', description: 'Print JSON output' },
        ],
        async handler({ io, options }) {
            for (const key of ['activation-request-id', 'source-issue-url', 'source-comment-url']) {
                if (typeof options[key] !== 'string')
                    throw new Error(`--${key} is required`);
            }
            const activationRequestId = String(options['activation-request-id']);
            const title = typeof options.title === 'string' ? options.title : undefined;
            const sourceIssue = typeof options['source-issue'] === 'string' ? options['source-issue'] : undefined;
            const branchName = buildRoadmapActivationBranchName({ activationRequestId, title, sourceIssue });
            const prTitle = buildRoadmapActivationPrTitle({ title, sourceIssue });
            const prContract = buildRoadmapActivationPrContract({
                activationRequestId,
                sourceIssueUrl: String(options['source-issue-url']),
                sourceCommentUrl: String(options['source-comment-url']),
                branchName,
                lifecycleState: 'requested',
                closeoutContract: {
                    activationCarrierIssue: sourceIssue,
                    processRoadmapPath: typeof options['process-roadmap-path'] === 'string' ? options['process-roadmap-path'] : '',
                },
            });
            const result = {
                schema: 'zj-loop.roadmap_activation_contract_plan.v1',
                activationRequestId,
                branchName,
                prTitle,
                lifecycleState: 'requested',
                prContract,
                nextSteps: [
                    'Create or update the roadmap branch from the current base branch.',
                    'Open or update the Roadmap Activation PR with the contract block.',
                    'Start Roadmap-Sliced Consumer execution from the Activation Request scope.',
                ],
            };
            const text = `${JSON.stringify(result, null, 2)}\n`;
            if (typeof options.out === 'string')
                await writeFile(options.out, text);
            if (options.json === true || typeof options.out !== 'string')
                io.stdout(text.trimEnd());
        },
    }, argv);
}
else {
    process.exitCode = await runRouteConsumerCli({
        name: 'zj-loop-roadmap-activation',
        routeId: 'roadmap-sliced-development',
        description: 'Plan Roadmap-Sliced Development activation through the Route Table consumer gate.',
    }, argv);
}
