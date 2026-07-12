#!/usr/bin/env node
import { runCli } from './cli.js';
import { buildLoopDoctorReport } from './doctor-runner.js';

const exitCode = await runCli({
  name: 'zj-loop-doctor',
  description: 'Replay ZAgenticLoop run state and summarize improvement signals.',
  usage: 'zj-loop-doctor [--root <dir>] [--emit-signal] [--format json|text]',
  options: [
    { name: 'root', type: 'string', description: 'Project root', default: '.' },
    { name: 'emitSignal', flag: 'emit-signal', type: 'boolean', description: 'Include a Route Decision signal envelope in the report' },
    { name: 'format', type: 'enum', description: 'Output format', values: ['json', 'text'], default: 'json' },
  ],
  async handler({ io, options }) {
    const report = await buildLoopDoctorReport({
      root: String(options.root ?? '.'),
      emitSignal: options.emitSignal === true,
    });

    if (options.format === 'text') {
      io.stdout(`runs: ${report.total_runs}`);
      for (const finding of report.findings) {
        io.stdout(`${finding.severity}: ${finding.kind} x${finding.count}`);
        io.stdout(`recommendation: ${finding.recommendation}`);
      }
    } else {
      io.stdout(JSON.stringify(report, null, 2));
    }

    return 0;
  },
});

process.exitCode = exitCode;
