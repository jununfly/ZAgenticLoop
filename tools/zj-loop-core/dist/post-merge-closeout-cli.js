#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { buildDryRunEvidenceComment, buildPostMergeRoadmapCloseoutExecutionPlan, collectCloseoutInputFromGitHub, executePostMergeRoadmapCloseout, LIVE_CLEANUP_CONFIRMATION_PHRASE, normalizeGitLabMrView, } from './post-merge-closeout-runner.js';
import { runCli } from './cli.js';
import { runRouteConsumerCli } from './route-consumer-cli.js';
const argv = process.argv.slice(2);
if (argv[0] === 'closeout-plan') {
    process.exitCode = await runCli({
        name: 'zj-loop-post-merge-closeout',
        description: 'Build Post-Merge Roadmap Closeout dry-run evidence.',
        usage: 'zj-loop-post-merge-closeout closeout-plan --provider github|gitlab --repo <owner/repo> [--pr <number>|--merge-request <iid>] [--review-body <text>|--review-body-file <path>] [--carrier-issue <number>] [--out <path>] [--comment-out <path>] [--json]',
        options: [
            { name: 'command', type: 'positional', description: 'Command', default: 'closeout-plan' },
            { name: 'provider', type: 'enum', description: 'Provider review surface', values: ['github', 'gitlab'], default: 'github' },
            { name: 'pr', type: 'string', description: 'Merged PR number' },
            { name: 'merge-request', type: 'string', description: 'Merged GitLab MR IID' },
            { name: 'repo', type: 'string', description: 'Expected owner/repo' },
            { name: 'review-url', type: 'string', description: 'Provider review URL' },
            { name: 'review-body', type: 'string', description: 'Provider review body containing the closeout contract' },
            { name: 'review-body-file', type: 'string', description: 'File containing provider review body' },
            { name: 'source-branch', type: 'string', description: 'Provider review source branch' },
            { name: 'target-branch', type: 'string', description: 'Provider review target branch', default: 'main' },
            { name: 'merged', type: 'boolean', description: 'Mark explicit provider review metadata as merged' },
            { name: 'carrier-issue', type: 'string', description: 'Expected activation carrier issue' },
            { name: 'out', type: 'string', description: 'Write JSON plan to this path' },
            { name: 'comment-out', type: 'string', description: 'Write dry-run evidence comment to this path' },
            {
                name: 'artifact-name',
                type: 'string',
                description: 'Workflow artifact name referenced by the evidence comment',
                default: 'post-merge-roadmap-closeout-plan',
            },
            { name: 'json', type: 'boolean', description: 'Print JSON output' },
        ],
        async handler({ io, options }) {
            const provider = String(options.provider ?? 'github');
            const pr = options.pr;
            const repo = options.repo;
            if (typeof repo !== 'string')
                throw new Error('--repo is required');
            const input = provider === 'gitlab'
                ? {
                    pr: normalizeGitLabMrView({
                        iid: typeof options['merge-request'] === 'string'
                            ? options['merge-request']
                            : typeof options.pr === 'string'
                                ? options.pr
                                : undefined,
                        web_url: typeof options['review-url'] === 'string' ? options['review-url'] : undefined,
                        description: await readReviewBody(options),
                        state: options.merged === true ? 'merged' : undefined,
                        merged: options.merged === true,
                        source_branch: typeof options['source-branch'] === 'string' ? options['source-branch'] : undefined,
                        target_branch: typeof options['target-branch'] === 'string' ? options['target-branch'] : 'main',
                        project_path: repo,
                    }, { expectedRepo: repo }),
                    prBody: await readReviewBody(options),
                    expectedRepo: repo,
                    currentRepo: repo,
                    gitStatus: '',
                }
                : await collectCloseoutInputFromGitHub({
                    prNumber: requireString(pr, '--pr is required'),
                    expectedRepo: repo,
                });
            const plan = buildPostMergeRoadmapCloseoutExecutionPlan({
                ...input,
                expectedCarrierIssue: typeof options['carrier-issue'] === 'string'
                    ? Number(options['carrier-issue'])
                    : undefined,
            });
            const text = `${JSON.stringify(plan, null, 2)}\n`;
            if (typeof options.out === 'string')
                await writeFile(options.out, text);
            if (typeof options['comment-out'] === 'string') {
                await writeFile(options['comment-out'], buildDryRunEvidenceComment(plan, {
                    artifactName: String(options['artifact-name'] ?? 'post-merge-roadmap-closeout-plan'),
                }));
            }
            if (options.json === true || typeof options.out !== 'string')
                io.stdout(text.trimEnd());
            if (plan.status === 'refused')
                return 1;
        },
    }, argv);
}
else if (argv[0] === 'live-closeout') {
    process.exitCode = await runCli({
        name: 'zj-loop-post-merge-closeout',
        description: 'Execute guarded Post-Merge Roadmap Closeout live cleanup.',
        usage: 'zj-loop-post-merge-closeout live-closeout --pr <number> --repo <owner/repo> [--carrier-issue <number>] [--confirm-live-cleanup <fixed phrase>] [--require-live-confirmation] [--out <path>] [--json]',
        options: [
            { name: 'command', type: 'positional', description: 'Command', default: 'live-closeout' },
            { name: 'pr', type: 'string', description: 'Merged PR number' },
            { name: 'repo', type: 'string', description: 'Expected owner/repo' },
            { name: 'carrier-issue', type: 'string', description: 'Expected activation carrier issue' },
            { name: 'confirm-live-cleanup', type: 'string', description: `Fallback phrase: ${LIVE_CLEANUP_CONFIRMATION_PHRASE}` },
            { name: 'require-live-confirmation', type: 'boolean', description: 'Require the fixed phrase even when merged-PR contract authorization passes' },
            { name: 'out', type: 'string', description: 'Write JSON result to this path' },
            { name: 'json', type: 'boolean', description: 'Print JSON output' },
        ],
        async handler({ io, options }) {
            const pr = options.pr;
            const repo = options.repo;
            if (typeof pr !== 'string')
                throw new Error('--pr is required');
            if (typeof repo !== 'string')
                throw new Error('--repo is required');
            const input = await collectCloseoutInputFromGitHub({
                prNumber: pr,
                expectedRepo: repo,
            });
            const plan = buildPostMergeRoadmapCloseoutExecutionPlan({
                ...input,
                expectedCarrierIssue: typeof options['carrier-issue'] === 'string'
                    ? Number(options['carrier-issue'])
                    : undefined,
                live: true,
            });
            const confirmationRequired = options['require-live-confirmation'] === true || plan.confirmation.required === true;
            if (confirmationRequired && options['confirm-live-cleanup'] !== LIVE_CLEANUP_CONFIRMATION_PHRASE) {
                throw new Error(`--confirm-live-cleanup must equal ${LIVE_CLEANUP_CONFIRMATION_PHRASE}`);
            }
            const result = await executePostMergeRoadmapCloseout(plan);
            const text = `${JSON.stringify(result, null, 2)}\n`;
            if (typeof options.out === 'string')
                await writeFile(options.out, text);
            if (options.json === true || typeof options.out !== 'string')
                io.stdout(text.trimEnd());
            if (result.status !== 'executed')
                return 1;
        },
    }, argv);
}
else {
    process.exitCode = await runRouteConsumerCli({
        name: 'zj-loop-post-merge-closeout',
        routeId: 'post-merge-roadmap-closeout',
        description: 'Plan Post-Merge Roadmap Closeout through the Route Table consumer gate.',
    }, argv);
}
async function readReviewBody(options) {
    if (typeof options['review-body-file'] === 'string')
        return readFile(options['review-body-file'], 'utf8');
    if (typeof options['review-body'] === 'string')
        return options['review-body'];
    return '';
}
function requireString(value, message) {
    if (typeof value !== 'string')
        throw new Error(message);
    return value;
}
