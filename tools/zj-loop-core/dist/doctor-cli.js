#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runCli } from './cli.js';
import { buildLoopDoctorReport } from './doctor-runner.js';
const exitCode = await runCli({
    name: 'zj-loop-doctor',
    description: 'Replay ZAgenticLoop run state and summarize improvement signals.',
    usage: 'zj-loop-doctor [--root <dir>] [--run <run_id>] [--orchestration <orchestration_id>] [--provider <provider> --subject <kind:id>] [--write-index <file>] [--emit-signal] [--format json|text]',
    options: [
        { name: 'root', type: 'string', description: 'Project root', default: '.' },
        { name: 'run', type: 'string', description: 'Replay a single run id' },
        { name: 'orchestration', type: 'string', description: 'Replay a single orchestration id' },
        { name: 'provider', type: 'string', description: 'Filter orchestration evidence by provider' },
        { name: 'subject', type: 'string', description: 'Filter orchestration evidence by subject key, such as issue:123' },
        { name: 'writeIndex', flag: 'write-index', type: 'string', description: 'Write the derived evidence index/report to a file' },
        { name: 'emitSignal', flag: 'emit-signal', type: 'boolean', description: 'Include a Route Decision signal envelope in the report' },
        { name: 'format', type: 'enum', description: 'Output format', values: ['json', 'text'], default: 'json' },
    ],
    async handler({ io, options }) {
        const root = String(options.root ?? '.');
        const report = await buildLoopDoctorReport({
            root,
            emitSignal: options.emitSignal === true,
            filters: {
                runId: typeof options.run === 'string' ? options.run : undefined,
                orchestrationId: typeof options.orchestration === 'string' ? options.orchestration : undefined,
                provider: typeof options.provider === 'string' ? options.provider : undefined,
                subject: typeof options.subject === 'string' ? options.subject : undefined,
            },
        });
        if (typeof options.writeIndex === 'string' && options.writeIndex.trim().length > 0) {
            const target = path.resolve(root, options.writeIndex);
            await mkdir(path.dirname(target), { recursive: true });
            await writeFile(target, `${JSON.stringify(report, null, 2)}\n`);
        }
        if (options.format === 'text') {
            io.stdout(`latest_status: ${report.summary.latest_status}`);
            io.stdout(`runs: ${report.summary.total_runs}`);
            io.stdout(`orchestrations: ${report.summary.total_orchestrations}`);
            io.stdout(`open_stop_signals: ${report.summary.open_stop_signals_count}`);
            for (const signal of report.classified_stop_signals) {
                io.stdout(`${signal.severity}: ${signal.stop_code} (${signal.category}/${signal.responsible_layer})`);
                io.stdout(`next: ${signal.next_actions[0]?.label ?? signal.reason}`);
            }
            for (const finding of report.findings) {
                io.stdout(`${finding.severity}: ${finding.kind} x${finding.count}`);
                io.stdout(`recommendation: ${finding.recommendation}`);
            }
        }
        else {
            io.stdout(JSON.stringify(report, null, 2));
        }
        return 0;
    },
});
process.exitCode = exitCode;
