#!/usr/bin/env node
import { runCli } from './cli.js';
import { buildFirstRunPlan, FirstRunGoal } from './first-run-runner.js';

const GOALS = ['auto', 'smoke', 'roadmap', 'issue-backlog', 'ci', 'closeout'] as const;

const exitCode = await runCli({
  name: 'zj-loop-first-run',
  description: 'Plan the automation-default first run for a user project.',
  usage: 'zj-loop-first-run plan [--root <dir>] [--goal <goal>] [--source <source>] [--signal-id <id>] [--json]',
  options: [
    { name: 'command', type: 'positional', description: 'Command', default: 'plan' },
    { name: 'root', type: 'string', description: 'Project root', default: '.' },
    { name: 'goal', type: 'enum', description: 'First-run goal', values: GOALS, default: 'auto' },
    { name: 'source', type: 'string', description: 'Signal source', default: 'first-run' },
    { name: 'signalId', flag: 'signal-id', type: 'string', description: 'Signal id' },
    { name: 'json', type: 'boolean', description: 'Print JSON output' },
  ],
  async handler({ io, options }) {
    if (options.command !== 'plan') {
      throw new Error(`Unknown command: ${String(options.command)}`);
    }

    const plan = await buildFirstRunPlan({
      root: String(options.root ?? '.'),
      goal: options.goal as FirstRunGoal,
      source: String(options.source ?? 'first-run'),
      signalId: typeof options.signalId === 'string' ? options.signalId : undefined,
    });

    if (options.json === true) {
      io.stdout(JSON.stringify(plan, null, 2));
    } else {
      io.stdout(`recommended route: ${plan.recommended_route} (${plan.recommended_consumer})`);
      io.stdout(`why: ${plan.recommendation_reason}`);
      io.stdout(`automation intent: ${plan.automation_intent}`);
      for (const step of plan.automatic_next_steps) io.stdout(`next step: ${step}`);
      for (const signal of plan.stop_signals) {
        io.stdout(`stop signal: ${signal.stop_reason}`);
        io.stdout(`responsible layer: ${signal.responsible_layer}`);
        for (const step of signal.next_steps) io.stdout(`next step: ${step}`);
      }
    }

    return plan.stop_signals.length === 0 ? 0 : 2;
  },
});

process.exitCode = exitCode;
