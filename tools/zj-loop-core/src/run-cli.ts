#!/usr/bin/env node
import { runCli } from './cli.js';
import { readLoopRunState, runLoopGoal, writeLoopRunState } from './run-runner.js';

const exitCode = await runCli({
  name: 'zj-loop-run',
  description: 'Run a ZAgenticLoop goal until the first review artifact or hard stop signal.',
  usage: 'zj-loop-run "<goal>" [--root <dir>] [--route <route-id>] [--plan-only] [--resume <run-id>] [--confirm <token>] [--format json|text]',
  options: [
    { name: 'goal', type: 'positional', description: 'Goal text' },
    { name: 'root', type: 'string', description: 'Project root', default: '.' },
    { name: 'route', type: 'string', description: 'Explicit route id' },
    { name: 'planOnly', flag: 'plan-only', type: 'boolean', description: 'Plan without executing route side effects' },
    { name: 'resume', type: 'string', description: 'Resume an existing run id' },
    { name: 'confirm', type: 'string', description: 'Confirm one specific action token' },
    { name: 'format', type: 'enum', description: 'Output format', values: ['json', 'text'], default: 'json' },
    { name: 'runId', flag: 'run-id', type: 'string', description: 'Deterministic run id for automation/tests' },
    { name: 'now', type: 'string', description: 'Deterministic timestamp for automation/tests' },
  ],
  async handler({ io, options }) {
    if (typeof options.resume === 'string' && options.resume.trim()) {
      const record = await readLoopRunState({
        root: String(options.root ?? '.'),
        runId: options.resume,
      });
      const output = {
        schema: 'zj-loop.harness_output.v1' as const,
        schema_version: 1 as const,
        human_summary: `Resumed run ${record.run_id} from local run state.`,
        machine_envelope: record.machine_envelope,
      };
      if (options.format === 'text') {
        io.stdout(output.human_summary);
        io.stdout(`status: ${output.machine_envelope.status}`);
        io.stdout(`route: ${output.machine_envelope.route_id}`);
        io.stdout(`next: ${output.machine_envelope.next_action.label}`);
      } else {
        io.stdout(JSON.stringify(output, null, 2));
      }
      return 0;
    }

    const goal = String(options.goal ?? '');
    const runId = typeof options.runId === 'string'
      ? options.runId
      : typeof options.resume === 'string'
        ? options.resume
        : undefined;

    const output = await runLoopGoal({
      root: String(options.root ?? '.'),
      goal,
      route: typeof options.route === 'string' ? options.route : undefined,
      planOnly: options.planOnly === true,
      runId,
      now: typeof options.now === 'string' ? options.now : undefined,
    });

    await writeLoopRunState({
      root: String(options.root ?? '.'),
      goal,
      output,
      now: typeof options.now === 'string' ? options.now : undefined,
    });

    if (options.format === 'text') {
      io.stdout(output.human_summary);
      io.stdout(`status: ${output.machine_envelope.status}`);
      io.stdout(`route: ${output.machine_envelope.route_id}`);
      io.stdout(`next: ${output.machine_envelope.next_action.label}`);
    } else {
      io.stdout(JSON.stringify(output, null, 2));
    }

    return output.machine_envelope.status === 'failed' ? 1 : 0;
  },
});

process.exitCode = exitCode;
