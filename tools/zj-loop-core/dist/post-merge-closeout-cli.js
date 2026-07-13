#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { buildDryRunEvidenceComment, buildPostMergeRoadmapCloseoutExecutionPlan, collectCloseoutInputFromGitHub, collectCloseoutInputFromGitLab, executePostMergeRoadmapCloseout, LIVE_CLEANUP_CONFIRMATION_PHRASE, normalizeGitLabMrView, } from './post-merge-closeout-runner.js';
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
            { name: 'target-branch', type: 'string', description: 'Provider review target branch' },
            { name: 'merged', type: 'boolean', description: 'Mark explicit provider review metadata as merged' },
            { name: 'gitlab-api-url', type: 'string', description: 'GitLab API v4 base URL for MR metadata fetch' },
            { name: 'gitlab-token', type: 'string', description: 'GitLab PRIVATE-TOKEN for MR metadata fetch' },
            { name: 'gitlab-job-token', type: 'string', description: 'GitLab JOB-TOKEN for MR metadata fetch' },
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
                ? await collectGitLabCloseoutInput(options, repo)
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
        usage: 'zj-loop-post-merge-closeout live-closeout --provider github|gitlab --repo <owner/repo> [--pr <number>|--merge-request <iid>] [--carrier-issue <number>] [--confirm-live-cleanup <fixed phrase>] [--require-live-confirmation] [--out <path>] [--json]',
        options: [
            { name: 'command', type: 'positional', description: 'Command', default: 'live-closeout' },
            { name: 'provider', type: 'enum', description: 'Provider review surface', values: ['github', 'gitlab'], default: 'github' },
            { name: 'pr', type: 'string', description: 'Merged PR number' },
            { name: 'merge-request', type: 'string', description: 'Merged GitLab MR IID' },
            { name: 'repo', type: 'string', description: 'Expected owner/repo' },
            { name: 'gitlab-api-url', type: 'string', description: 'GitLab API v4 base URL for MR metadata fetch and live cleanup' },
            { name: 'gitlab-token', type: 'string', description: 'GitLab PRIVATE-TOKEN for live cleanup' },
            { name: 'gitlab-job-token', type: 'string', description: 'GitLab JOB-TOKEN for live cleanup' },
            { name: 'carrier-issue', type: 'string', description: 'Expected activation carrier issue' },
            { name: 'confirm-live-cleanup', type: 'string', description: `Fallback phrase: ${LIVE_CLEANUP_CONFIRMATION_PHRASE}` },
            { name: 'require-live-confirmation', type: 'boolean', description: 'Require the fixed phrase even when merged-PR contract authorization passes' },
            { name: 'out', type: 'string', description: 'Write JSON result to this path' },
            { name: 'json', type: 'boolean', description: 'Print JSON output' },
        ],
        async handler({ io, options }) {
            const provider = String(options.provider ?? 'github');
            const repo = options.repo;
            if (typeof repo !== 'string')
                throw new Error('--repo is required');
            const input = provider === 'gitlab'
                ? await collectGitLabCloseoutInput(options, repo)
                : await collectCloseoutInputFromGitHub({
                    prNumber: requireString(options.pr, '--pr is required'),
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
            const result = await executePostMergeRoadmapCloseout(plan, provider === 'gitlab'
                ? {
                    gitlabApiBaseUrl: stringOption(options['gitlab-api-url']) ?? process.env.CI_API_V4_URL,
                    gitlabToken: stringOption(options['gitlab-token']) ?? process.env.GITLAB_TOKEN ?? process.env.GL_TOKEN,
                    gitlabJobToken: stringOption(options['gitlab-job-token']) ?? process.env.CI_JOB_TOKEN,
                }
                : {});
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
async function collectGitLabCloseoutInput(options, repo) {
    const mergeRequest = typeof options['merge-request'] === 'string'
        ? options['merge-request']
        : typeof options.pr === 'string'
            ? options.pr
            : undefined;
    if (!mergeRequest)
        throw new Error('--merge-request is required for --provider gitlab');
    const hasExplicitMetadata = stringOption(options['review-body']) !== undefined ||
        stringOption(options['review-body-file']) !== undefined ||
        stringOption(options['source-branch']) !== undefined ||
        stringOption(options['target-branch']) !== undefined ||
        options.merged === true;
    if (!hasExplicitMetadata) {
        return collectCloseoutInputFromGitLab({
            iid: mergeRequest,
            expectedRepo: repo,
            apiBaseUrl: stringOption(options['gitlab-api-url']) ?? process.env.CI_API_V4_URL,
            token: stringOption(options['gitlab-token']) ?? process.env.GITLAB_TOKEN ?? process.env.GL_TOKEN,
            jobToken: stringOption(options['gitlab-job-token']) ?? process.env.CI_JOB_TOKEN,
        });
    }
    const body = await readReviewBody(options);
    return {
        pr: normalizeGitLabMrView({
            iid: mergeRequest,
            web_url: typeof options['review-url'] === 'string' ? options['review-url'] : undefined,
            description: body,
            state: options.merged === true ? 'merged' : undefined,
            merged: options.merged === true,
            source_branch: typeof options['source-branch'] === 'string' ? options['source-branch'] : undefined,
            target_branch: typeof options['target-branch'] === 'string' ? options['target-branch'] : 'main',
            project_path: repo,
        }, { expectedRepo: repo }),
        prBody: body,
        expectedRepo: repo,
        currentRepo: repo,
        gitStatus: '',
    };
}
function stringOption(value) {
    return typeof value === 'string' && value.trim() ? value : undefined;
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
