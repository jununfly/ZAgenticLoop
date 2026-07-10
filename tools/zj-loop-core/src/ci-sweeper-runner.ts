import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildIssueFixRequestComment,
  ISSUE_FIX_REQUEST_SCHEMA,
} from './issue-fix-request-contract.js';

export type CommandStep = {
  command: string;
  args: string[];
  cwd?: string;
};

export type CiSweeperRepairPlan = {
  schema: 'zj-loop.ci_sweeper_repair_plan.v1';
  package_directories: string[];
  commands: CommandStep[];
};

export function buildCiSweeperIssueFixRequestBody(input: {
  routeDecision: any;
  repo: string;
  provider?: 'github' | 'gitlab';
  workflowName?: string;
  runId?: string;
  sourceUrl?: string;
  createdAt?: string;
}) {
  const routeDecision = input.routeDecision ?? {};
  const provider = input.provider ?? providerFor(routeDecision, input.sourceUrl);
  const signalId = String(routeDecision.signal_id ?? routeDecision.source_signal_id ?? `ci:${input.runId ?? 'unknown-run'}`);
  const dedupeKey = String(routeDecision.dedupe_key ?? `${input.repo}:ci-sweeper:${signalId}:generated-workflow`);
  const request = {
    schema: ISSUE_FIX_REQUEST_SCHEMA,
    request_id: `ifr_${stableHash(dedupeKey)}`,
    status: 'requested',
    created_at: input.createdAt ?? routeDecision.created_at ?? new Date().toISOString(),
    source_signal: {
      signal_id: signalId,
      source: 'ci',
      provider,
      summary: String(routeDecision.subject ?? input.workflowName ?? 'CI workflow failure'),
      source_url: input.sourceUrl ?? routeDecision.source_url ?? '',
    },
    subject: {
      type: 'ci',
      provider,
      repo: input.repo,
      workflow: input.workflowName ?? '',
      run_id: input.runId ?? routeDecision.source_run_id ?? '',
      source_url: input.sourceUrl ?? routeDecision.source_url ?? '',
    },
    route_decision: {
      ...routeDecision,
      target_consumer: routeDecision.target_consumer ?? 'ci-sweeper',
      request_kind: routeDecision.request_kind ?? 'issue-fix-request',
      dedupe_key: dedupeKey,
    },
    dedupe_key: dedupeKey,
    requested_consumer: {
      consumer_id: 'ci-sweeper',
      capability: 'deterministic-ci-repair',
    },
    fix_scope: {
      repo: input.repo,
      files_or_areas: ['scripts/', '.github/workflows/', 'zj-loop/'],
      non_goals: ['auto-merge'],
    },
    acceptance_criteria: [
      'Open a verifier-backed Fix PR or append failed/escalation evidence.',
      'Do not auto-merge the Fix PR.',
    ],
    verification_gate: {
      commands: [
        'bash scripts/ci-validate-gates.sh',
        'bash scripts/ci-audit-gates.sh',
      ],
    },
    failure_policy: {
      on_failure: 'failed_requires_new_request',
      retry: 'new_request_only',
    },
    lifecycle: {
      linked_pr: null,
      consumed_by: null,
      closed_at: null,
    },
  };
  return [
    `# Issue Fix Request: ${request.requested_consumer.consumer_id}`,
    '',
    buildIssueFixRequestComment(request).trim(),
    '',
    '## Human-readable summary',
    '',
    `- Source signal: \`${signalId}\``,
    `- Route decision: \`${routeDecision.decision_id ?? 'unknown'}\``,
    `- Consumer: \`${request.requested_consumer.consumer_id}\``,
    `- Dedupe key: \`${dedupeKey}\``,
    `- Source URL: ${request.source_signal.source_url || '(none)'}`,
    '',
    'The Fix Consumer must open a verifier-backed Fix PR or append failed/escalation evidence.',
    '',
  ].join('\n');
}

export function getCiSweeperPackageBuildPlan(packages: Array<{ directory: string }>): string[] {
  return packages.map((releasePackage) => releasePackage.directory);
}

export async function buildCiSweeperRepairCommands(input: {
  root?: string;
  packageDirectories?: string[];
  rootInstallCommand?: [string, string[]] | null;
  rootCommands?: Array<[string, string[]]>;
} = {}): Promise<CommandStep[]> {
  const root = input.root ?? '.';
  const packageDirectories = input.packageDirectories ?? [];
  const rootInstallCommand: [string, string[]] | null =
    input.rootInstallCommand === undefined ? ['npm', ['ci', '--ignore-scripts']] : input.rootInstallCommand;
  const rootCommands = input.rootCommands ?? [
    ['node', ['scripts/check-zj-loop-init-sync.mjs']],
    ['node', ['scripts/validate-release-workflows.mjs']],
  ];
  const commands: CommandStep[] = [];

  for (const directory of packageDirectories) {
    commands.push({ command: 'npm', args: ['ci'], cwd: directory });
    if (await packageHasScript(root, directory, 'build')) {
      commands.push({ command: 'npm', args: ['run', 'build'], cwd: directory });
    }
  }

  if (rootInstallCommand) {
    const [command, args] = rootInstallCommand;
    commands.push({ command, args });
  }

  for (const [command, args] of rootCommands) {
    commands.push({ command, args });
  }

  return commands;
}

export async function buildCiSweeperRepairPlan(input: {
  root?: string;
  packageDirectories?: string[];
  rootInstallCommand?: [string, string[]] | null;
  rootCommands?: Array<[string, string[]]>;
} = {}): Promise<CiSweeperRepairPlan> {
  const packageDirectories = input.packageDirectories ?? [];
  return {
    schema: 'zj-loop.ci_sweeper_repair_plan.v1',
    package_directories: packageDirectories,
    commands: await buildCiSweeperRepairCommands(input),
  };
}

export function formatCommandStep(step: CommandStep): string {
  const command = [step.command, ...step.args].join(' ');
  return step.cwd ? `(cd ${step.cwd} && ${command})` : command;
}

async function packageHasScript(root: string, directory: string, scriptName: string): Promise<boolean> {
  const packageJsonPath = path.join(root, directory, 'package.json');
  const pkg = JSON.parse(await readFile(packageJsonPath, 'utf8')) as { scripts?: Record<string, string> };
  return Boolean(pkg.scripts?.[scriptName]);
}

function stableHash(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function providerFor(routeDecision: any, sourceUrl?: string): 'github' | 'gitlab' {
  const explicit = routeDecision?.provider ?? routeDecision?.source_provider;
  if (explicit === 'gitlab') return 'gitlab';
  if (explicit === 'github') return 'github';

  const source = String(routeDecision?.source ?? '').toLowerCase();
  const url = String(sourceUrl ?? routeDecision?.source_url ?? '').toLowerCase();
  if (source.includes('gitlab') || url.includes('gitlab')) return 'gitlab';
  return 'github';
}
