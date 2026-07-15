import { runCli } from './cli.js';
import { restoreGitLabScheduleProbe, resumeGitLabScheduleProbe, runGitLabScheduleProbe } from './schedule-probe-runner.js';
export async function runScheduleProbeCli(input = {}) {
    const env = input.env ?? process.env;
    const signalTarget = input.signalTarget ?? process;
    const runner = input.runner ?? { runGitLabScheduleProbe, resumeGitLabScheduleProbe, restoreGitLabScheduleProbe };
    const controller = new AbortController();
    let activeProbeId;
    let signal;
    let cleanupPromise;
    let common;
    const beginCleanup = () => {
        if (!signal || !activeProbeId || cleanupPromise)
            return;
        cleanupPromise = runner.restoreGitLabScheduleProbe({ ...common, probeId: activeProbeId });
    };
    const handleSignal = (received) => {
        signal ??= received;
        controller.abort();
        beginCleanup();
    };
    const onSigint = () => handleSignal('SIGINT');
    const onSigterm = () => handleSignal('SIGTERM');
    signalTarget.on('SIGINT', onSigint);
    signalTarget.on('SIGTERM', onSigterm);
    try {
        return await runCli({
            name: 'zj-loop-schedule-probe', description: 'Create and clean up a bounded owned GitLab schedule probe.',
            usage: 'zj-loop-schedule-probe start|resume|restore --project <group/project> [options]',
            options: [
                { name: 'action', type: 'positional', description: 'start, resume, or restore' },
                { name: 'root', type: 'string', default: '.', description: 'Project root for probe state' },
                { name: 'project', type: 'string', description: 'GitLab project path' },
                { name: 'probeId', flag: 'probe-id', type: 'string', description: 'Existing owned probe id' },
                { name: 'dueInMinutes', flag: 'due-in-minutes', type: 'string', description: 'Required 3-30 minute probe delay' },
                { name: 'confirmation', type: 'string', description: 'Required fixed confirmation phrase' },
                { name: 'ref', type: 'string', description: 'Target ref' }, { name: 'timezone', type: 'string', description: 'GitLab cron timezone' },
                { name: 'apiUrl', flag: 'api-url', type: 'string', description: 'GitLab API URL' },
            ],
            async handler({ io, options }) {
                const token = env.GITLAB_TOKEN ?? env.GITLAB_PRIVATE_TOKEN ?? env.GLAB_TOKEN;
                if (!token)
                    throw new Error('GitLab token environment variable is required');
                common = { root: options.root, project: options.project, token, apiUrl: options.apiUrl, ref: options.ref, timezone: options.timezone };
                const action = options.action;
                if (action === 'resume')
                    activeProbeId = String(options.probeId ?? '');
                const onArmed = (state) => { activeProbeId = state.probe_id; beginCleanup(); };
                const result = action === 'start'
                    ? await runner.runGitLabScheduleProbe({ ...common, dueInMinutes: Number(options.dueInMinutes), confirmation: options.confirmation, signal: controller.signal, onArmed })
                    : action === 'resume' ? await runner.resumeGitLabScheduleProbe({ ...common, probeId: options.probeId, signal: controller.signal })
                        : action === 'restore' ? await runner.restoreGitLabScheduleProbe({ ...common, probeId: options.probeId })
                            : (() => { throw new Error('Use start, resume, or restore'); })();
                if (!signal) {
                    io.stdout(JSON.stringify(result, null, 2));
                    return result.status === 'escalated' || result.status === 'blocked' ? 2 : 0;
                }
                beginCleanup();
                const cleanup = cleanupPromise ? await cleanupPromise : { status: 'not-armed' };
                io.stdout(JSON.stringify({ schema: 'zj-loop.gitlab_schedule_probe.v1', status: 'interrupted', signal, result, cleanup }, null, 2));
                return signal === 'SIGINT' ? 130 : 143;
            },
        }, input.argv, input.io);
    }
    finally {
        signalTarget.off?.('SIGINT', onSigint);
        signalTarget.off?.('SIGTERM', onSigterm);
    }
}
