#!/usr/bin/env node
import { GitLabReadClient } from './read-client.js';
const args = process.argv.slice(2);
const command = args[0];
const value = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
async function main() {
    if (!command || command === '--help') {
        console.log('Usage: zj-loop-gitlab-infra preflight --api-url <url> --project <group/project> [--capabilities <csv>]');
        return;
    }
    const client = new GitLabReadClient({ apiUrl: value('--api-url') ?? process.env.CI_API_V4_URL ?? 'https://gitlab.com/api/v4', projectPath: value('--project') ?? process.env.CI_PROJECT_PATH ?? '', token: process.env.GITLAB_TOKEN, tokenSource: process.env.GITLAB_TOKEN ? 'GITLAB_TOKEN' : 'none' });
    if (command === 'preflight') {
        console.log(JSON.stringify(await client.preflight((value('--capabilities') ?? 'schedule-read,pipeline-read,job-read,artifact-read').split(',')), null, 2));
        return;
    }
    throw new Error(`Unknown command: ${command}`);
}
main().catch((error) => { console.error(JSON.stringify({ schema: 'zj-loop.gitlab_infra_error.v1', status: 'blocked', code: error?.code ?? 'provider-contract-mismatch', message: error?.message ?? String(error) })); process.exitCode = 1; });
