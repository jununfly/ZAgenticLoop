import { writeFile } from 'node:fs/promises';
import { scanGitLabIssueBacklog } from './issue-backlog-runner.js';
const args = process.argv.slice(2);
if (args[0] !== 'scan' || value('--provider') !== 'gitlab' || !value('--project')) {
    throw new Error('Usage: zj-loop-issue-backlog scan --provider gitlab --project <group/project> [--api-url <url>] [--out <path>]');
}
const result = await scanGitLabIssueBacklog({
    projectPath: value('--project'), apiBaseUrl: value('--api-url'), token: process.env.GITLAB_TOKEN || process.env.GITLAB_PRIVATE_TOKEN || process.env.GLAB_TOKEN,
    jobToken: process.env.CI_JOB_TOKEN, limit: Number(value('--limit') || 30), pipelineUrl: value('--pipeline-url'),
});
if (value('--out'))
    await writeFile(value('--out'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
function value(flag) { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; }
