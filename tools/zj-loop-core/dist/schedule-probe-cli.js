#!/usr/bin/env node
import { runCli } from './cli.js';
import { restoreGitLabScheduleProbe, resumeGitLabScheduleProbe, runGitLabScheduleProbe } from './schedule-probe-runner.js';
const exitCode = await runCli({
    name: 'zj-loop-schedule-probe', description: 'Create and clean up a bounded owned GitLab schedule probe.',
    usage: 'zj-loop-schedule-probe start|resume|restore --project <group/project> [options]',
    options: [
        { name: 'root', type: 'string', default: '.', description: 'Project root for probe state' },
        { name: 'project', type: 'string', description: 'GitLab project path' },
        { name: 'probeId', flag: 'probe-id', type: 'string', description: 'Existing owned probe id' },
        { name: 'dueInMinutes', flag: 'due-in-minutes', type: 'string', description: 'Required 3-30 minute probe delay' },
        { name: 'confirmation', type: 'string', description: 'Required fixed confirmation phrase' },
        { name: 'ref', type: 'string', description: 'Target ref' }, { name: 'timezone', type: 'string', description: 'GitLab cron timezone' },
        { name: 'apiUrl', flag: 'api-url', type: 'string', description: 'GitLab API URL' },
    ],
    async handler({ io, options }) {
        const action = process.argv[2];
        const token = process.env.GITLAB_TOKEN ?? process.env.GITLAB_PRIVATE_TOKEN ?? process.env.GLAB_TOKEN;
        if (!token)
            throw new Error('GitLab token environment variable is required');
        const common = { root: options.root, project: options.project, token, apiUrl: options.apiUrl, ref: options.ref, timezone: options.timezone };
        const result = action === 'start'
            ? await runGitLabScheduleProbe({ ...common, dueInMinutes: Number(options.dueInMinutes), confirmation: options.confirmation })
            : action === 'resume' ? await resumeGitLabScheduleProbe({ ...common, probeId: options.probeId })
                : action === 'restore' ? await restoreGitLabScheduleProbe({ ...common, probeId: options.probeId })
                    : (() => { throw new Error('Use start, resume, or restore'); })();
        io.stdout(JSON.stringify(result, null, 2));
        return 0;
    },
});
process.exitCode = exitCode;
