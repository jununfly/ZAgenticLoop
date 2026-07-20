#!/usr/bin/env node
import {
  buildRouteDecision,
  DEFAULT_ROUTE_TABLE_PATH,
  expectedConfirmationPhrase,
  evaluateRoutePromotionGate,
  listRoutes,
  loadRouteTable,
  promoteRouteMaturity,
  setRouteEnabled,
} from './route.js';
import { buildGitLabControlRouteEvidence } from './gitlab-control-route-evidence.js';

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function positionalAfterCommand(args: string[]): string | undefined {
  const valueFlags = new Set(['--root', '--source', '--signal-id', '--confirm', '--reason', '--runner', '--target', '--orchestration', '--project', '--scope', '--requested-side-effect']);
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (valueFlags.has(arg)) {
      index += 1;
      continue;
    }
    if (!arg.startsWith('-')) return arg;
  }
  return undefined;
}

function help(): string {
  return `zj-loop-route — inspect and update ZAgenticLoop Route Table policy

Usage:
  zj-loop-route status [consumer-or-route] [--root <dir>] [--json]
  zj-loop-route dispatch <consumer-or-route> [--root <dir>] [--source <source>] [--signal-id <id>] [--json]
  zj-loop-route control-evidence <human|ignore> --project <group/project> --orchestration <id> --signal-id <id> --source gitlab-protocol --reason <reason> [--requested-side-effect <level>] [--json]
  zj-loop-route enable <consumer-or-route> [--root <dir>] [--confirm <phrase>] [--reason <text>] [--json]
  zj-loop-route disable <consumer-or-route> [--root <dir>] [--json]
  zj-loop-route promote <consumer-or-route> --runner install-ready|execution-ready [--root <dir>] [--confirm <phrase>] [--json]
  zj-loop-route promotion-gate <consumer-or-route> --target execution-ready [--root <dir>] [--orchestration <id>] [--apply] [--confirm <phrase>] [--json]

Side-effecting enable confirmation:
  enable <consumer> side effects
  enable <consumer> destructive side effects

Execution-ready promotion confirmation:
  promote <consumer> runner to execution-ready
`;
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length === 0 || hasFlag(argv, '--help') || hasFlag(argv, '-h')) {
    console.log(help());
    return 0;
  }

  const [command] = argv;
  const selector = positionalAfterCommand(argv);
  const root = optionValue(argv, '--root') ?? '.';
  const json = hasFlag(argv, '--json');

  if (command === 'status') {
    const table = await loadRouteTable(root, DEFAULT_ROUTE_TABLE_PATH);
    const routes = listRoutes(table).filter((route) => !selector || route.route_id === selector || route.consumer === selector);
    if (json) {
      console.log(JSON.stringify({ routes }, null, 2));
    } else {
      console.log(formatRouteStatusTable(routes));
    }
    return 0;
  }

  if (!selector) throw new Error(`${command} requires a consumer or route id`);

  if (command === 'dispatch') {
    const table = await loadRouteTable(root, DEFAULT_ROUTE_TABLE_PATH);
    const decision = buildRouteDecision({
      table,
      selector,
      source: optionValue(argv, '--source'),
      signalId: optionValue(argv, '--signal-id'),
    });
    console.log(JSON.stringify(decision, null, 2));
    return decision.allowed ? 0 : 2;
  }

  if (command === 'control-evidence') {
    const result = buildGitLabControlRouteEvidence({
      projectPath: optionValue(argv, '--project') ?? '',
      orchestrationId: optionValue(argv, '--orchestration') ?? '',
      routeId: selector,
      reason: optionValue(argv, '--reason') ?? '',
      signal: {
        source: optionValue(argv, '--source') ?? '',
        signal_id: optionValue(argv, '--signal-id') ?? '',
        project: optionValue(argv, '--project') ?? '',
      },
      requestedSideEffect: optionValue(argv, '--requested-side-effect'),
    });
    console.log(JSON.stringify(result, null, 2));
    return result.status === 'completed' ? 0 : 2;
  }

  if (command === 'enable' || command === 'disable') {
    const result = await setRouteEnabled({
      root,
      selector,
      enabled: command === 'enable',
      confirm: optionValue(argv, '--confirm'),
      reason: optionValue(argv, '--reason'),
    });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`${result.enabled ? 'enabled' : 'disabled'} ${result.route_id} consumer=${result.consumer}`);
      if (result.side_effecting && result.enabled) console.log('side effects enabled by explicit confirmation');
      for (const step of result.next_steps) console.log(`next step: ${step}`);
    }
    return 0;
  }

  if (command === 'promote') {
    const runner = optionValue(argv, '--runner');
    if (runner !== 'install-ready' && runner !== 'execution-ready') {
      throw new Error('promote requires --runner install-ready|execution-ready');
    }
    const result = await promoteRouteMaturity({
      root,
      selector,
      runner,
      confirm: optionValue(argv, '--confirm'),
    });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`promoted ${result.route_id} runner=${result.runner}`);
      console.log(`enabled remains ${result.enabled ? 'true' : 'false'}`);
      for (const step of result.next_steps) console.log(`next step: ${step}`);
    }
    return 0;
  }

  if (command === 'promotion-gate') {
    const target = optionValue(argv, '--target');
    if (target !== 'execution-ready') {
      throw new Error('promotion-gate requires --target execution-ready');
    }
    const result = await evaluateRoutePromotionGate({
      root,
      selector,
      target,
      orchestrationId: optionValue(argv, '--orchestration'),
      apply: hasFlag(argv, '--apply'),
      confirm: optionValue(argv, '--confirm'),
    });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`${result.promotable ? 'promotable' : 'not promotable'} ${result.route_id} target=${result.target_maturity}`);
      if (result.applied) console.log(`applied runner promotion changed=${result.changed ? 'true' : 'false'}`);
      for (const missing of result.missing_evidence) console.log(`missing evidence: ${missing}`);
      for (const failed of result.failed_checks) console.log(`failed check: ${failed}`);
      console.log(`promotion command: ${result.promotion_command.join(' ')}`);
      for (const step of result.next_steps) console.log(`next step: ${step}`);
    }
    return result.promotable ? 0 : 2;
  }

  throw new Error(`Unknown command: ${command}`);
}

function formatRouteStatusTable(routes: ReturnType<typeof listRoutes>): string {
  const rows = [
    ['enabled', 'dispatch', 'execute', 'route', 'consumer', 'kind', 'mode', 'sidefx', 'protocol', 'runner', 'readiness', 'confirm'],
    ...routes.map((route) => [
      route.enabled ? 'yes' : 'no',
      route.automation_model.authorization.dispatch_allowed ? 'yes' : 'no',
      route.automation_model.authorization.execution_allowed ? 'yes' : 'no',
      route.route_id,
      route.consumer,
      route.consumer_kind,
      route.execution_mode,
      route.side_effect_level,
      route.maturity_protocol,
      route.maturity_runner,
      route.readiness,
      route.side_effecting && !route.enabled ? expectedConfirmationPhrase(route) : '',
    ]),
  ];
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  return rows
    .map((row) => row.map((value, column) => value.padEnd(widths[column])).join('  ').trimEnd())
    .join('\n');
}

main().then((code) => {
  process.exitCode = code;
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
