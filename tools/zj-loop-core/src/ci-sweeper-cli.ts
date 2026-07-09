#!/usr/bin/env node
import { buildCiSweeperRepairPlan } from './ci-sweeper-runner.js';
import { runCli } from './cli.js';
import { runRouteConsumerCli } from './route-consumer-cli.js';

const argv = process.argv.slice(2);
if (argv[0] === 'repair-plan') {
  process.exitCode = await runCli({
    name: 'zj-loop-ci-sweeper',
    description: 'Plan CI Sweeper deterministic repair commands.',
    usage: 'zj-loop-ci-sweeper repair-plan [--packages <dirs>] [--root <dir>] [--json]',
    options: [
      { name: 'command', type: 'positional', description: 'Command', default: 'repair-plan' },
      { name: 'packages', type: 'string', description: 'Comma-separated package directories', default: '' },
      { name: 'root', type: 'string', description: 'Project root', default: '.' },
      { name: 'json', type: 'boolean', description: 'Print JSON output' },
    ],
    async handler({ io, options }) {
      const packageDirectories = String(options.packages ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const plan = await buildCiSweeperRepairPlan({
        root: String(options.root ?? '.'),
        packageDirectories,
      });
      if (options.json === true) {
        io.stdout(JSON.stringify(plan, null, 2));
      } else {
        for (const step of plan.commands) {
          io.stdout(`${step.cwd ? `${step.cwd}: ` : ''}${[step.command, ...step.args].join(' ')}`);
        }
      }
    },
  }, argv);
} else {
  process.exitCode = await runRouteConsumerCli({
    name: 'zj-loop-ci-sweeper',
    routeId: 'ci-sweeper',
    description: 'Plan CI Sweeper execution through the Route Table consumer gate.',
  }, argv);
}
