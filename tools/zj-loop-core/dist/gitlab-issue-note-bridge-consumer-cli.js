#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { runCli } from './cli.js';
import { GITLAB_ISSUE_NOTE_BRIDGE_CONSUMER_EXIT_CODES, runGitLabIssueNoteBridgeConsumer, } from './gitlab-issue-note-bridge-consumer.js';
const exitCode = await runCli({
    name: 'zj-loop-gitlab-issue-note-bridge-consumer',
    description: 'Validate a fixed API Pipeline bridge consumer request without provider writes.',
    usage: 'zj-loop-gitlab-issue-note-bridge-consumer [--root <dir>] [--registration <path>] [--out <file>] [--json]',
    options: [
        { name: 'root', type: 'string', description: 'Project root', default: '.' },
        { name: 'registration', flag: 'registration', type: 'string', description: 'Project Registration path', default: 'zj-loop/registrations/project.yaml' },
        { name: 'out', type: 'string', description: 'Output JSON path' },
        { name: 'json', type: 'boolean', description: 'Print JSON output' },
    ],
    async handler({ io, options }) {
        const result = await runGitLabIssueNoteBridgeConsumer({
            root: String(options.root ?? '.'),
            registrationPath: String(options.registration ?? 'zj-loop/registrations/project.yaml'),
        });
        const text = `${JSON.stringify(result, null, 2)}\n`;
        if (typeof options.out === 'string')
            await writeFile(options.out, text);
        if (options.json === true || typeof options.out !== 'string')
            io.stdout(text.trimEnd());
        return GITLAB_ISSUE_NOTE_BRIDGE_CONSUMER_EXIT_CODES[result.status];
    },
});
process.exitCode = exitCode;
