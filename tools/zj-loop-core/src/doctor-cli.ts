#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runCli } from './cli.js';
import { buildCompletionAlignmentLedger } from './completion-alignment.js';
import { buildLoopDoctorReport } from './doctor-runner.js';
import { buildGitLabIssueNoteBridgeCapabilityArtifact } from './gitlab-issue-note-bridge-capability.js';
import { inspectGitLabScheduleHealth } from './schedule-health-contract.js';
import { DEFAULT_ROUTE_TABLE_PATH, loadRouteTable } from './route.js';

const exitCode = await runCli({
  name: 'zj-loop-doctor',
  description: 'Replay ZAgenticLoop run state and summarize improvement signals.',
  usage: 'zj-loop-doctor [--root <dir>] [--completion] [--capability <route_id>] [--require-complete] [--run <run_id>] [--orchestration <orchestration_id>] [--provider <provider> --subject <kind:id>] [--write-index <file>] [--emit-signal] [--format json|text]',
  options: [
    { name: 'root', type: 'string', description: 'Project root', default: '.' },
    { name: 'run', type: 'string', description: 'Replay a single run id' },
    { name: 'orchestration', type: 'string', description: 'Replay a single orchestration id' },
    { name: 'provider', type: 'string', description: 'Filter orchestration evidence by provider' },
    { name: 'scheduleHealth', flag: 'schedule-health', type: 'boolean', description: 'Inspect explicit provider schedule health (network read)' },
    { name: 'project', type: 'string', description: 'Provider project path for schedule health' },
    { name: 'route', type: 'string', description: 'Route id for schedule health' },
    { name: 'scheduleId', flag: 'schedule-id', type: 'string', description: 'Provider schedule id for schedule health' },
    { name: 'job', type: 'string', description: 'Scheduled job name for artifact lookup' },
    { name: 'artifact', type: 'string', description: 'Expected job artifact path' },
    { name: 'artifactSchema', flag: 'artifact-schema', type: 'string', description: 'Expected JSON artifact schema' },
    { name: 'expectedWithinMinutes', flag: 'expected-within-minutes', type: 'string', description: 'Optional first scheduled execution window override in minutes' },
    { name: 'apiUrl', flag: 'api-url', type: 'string', description: 'Optional provider API URL' },
    { name: 'subject', type: 'string', description: 'Filter orchestration evidence by subject key, such as issue:123' },
    { name: 'completion', type: 'boolean', description: 'Derive the Completion Alignment Ledger' },
    { name: 'capability', type: 'string', description: 'Emit a route-specific capability artifact' },
    { name: 'requireComplete', flag: 'require-complete', type: 'boolean', description: 'Exit nonzero unless every required completion cell is complete' },
    { name: 'writeIndex', flag: 'write-index', type: 'string', description: 'Write the derived evidence index/report to a file' },
    { name: 'emitSignal', flag: 'emit-signal', type: 'boolean', description: 'Include a Route Decision signal envelope in the report' },
    { name: 'format', type: 'enum', description: 'Output format', values: ['json', 'text'], default: 'json' },
  ],
  async handler({ io, options }) {
    const root = String(options.root ?? '.');
    if (typeof options.capability === 'string') {
      const table = await loadRouteTable(root);
      const route = [...(table.routes ?? []), ...(table.disabled_dispatch_routes ?? [])].find((entry) => entry.route_id === options.capability);
      if (!route) throw new Error(`Unknown capability route: ${options.capability}`);
      const artifact = options.capability === 'gitlab-issue-note-bridge'
        ? buildGitLabIssueNoteBridgeCapabilityArtifact(route)
        : null;
      if (!artifact) throw new Error(`Unsupported capability route: ${options.capability}`);
      io.stdout(JSON.stringify(artifact, null, 2));
      return artifact.verification.status === 'verified' ? 0 : 1;
    }
      if (options.scheduleHealth === true) {
      if (options.provider !== 'gitlab') throw new Error('--schedule-health currently requires --provider gitlab');
      for (const key of ['project', 'route', 'scheduleId', 'job', 'artifact', 'artifactSchema'] as const) if (typeof options[key] !== 'string' || options[key].trim() === '') throw new Error(`--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required with --schedule-health`);
      const expectedWithinMinutes = options.expectedWithinMinutes === undefined
        ? undefined
        : Number(options.expectedWithinMinutes);
      if (expectedWithinMinutes !== undefined && (!Number.isInteger(expectedWithinMinutes) || expectedWithinMinutes <= 0)) {
        throw new Error('--expected-within-minutes must be a positive integer');
      }
      const result = await inspectGitLabScheduleHealth({ target: { provider: 'gitlab', project: options.project, route_id: options.route, schedule_id: options.scheduleId, job: options.job, artifact: options.artifact, artifact_schema: options.artifactSchema }, apiUrl: options.apiUrl, expectedWithinMinutes });
      if (options.format === 'text') {
        io.stdout(`schedule_health: ${result.status}`);
        for (const step of result.next_steps) io.stdout(`next: ${step.command.join(' ')}`);
      } else io.stdout(JSON.stringify(result, null, 2));
      return 0;
    }
    if (options.completion === true) {
      const routeTablePath = path.resolve(root, DEFAULT_ROUTE_TABLE_PATH);
      const [table, routeTableText] = await Promise.all([
        loadRouteTable(root),
        readFile(routeTablePath, 'utf8'),
      ]);
      const ledger = buildCompletionAlignmentLedger({ table, routeTableText });
      if (options.format === 'text') {
        io.stdout(`target: ${ledger.target.id}`);
        for (const [status, count] of Object.entries(ledger.summary)) io.stdout(`${status}: ${count}`);
      } else {
        io.stdout(JSON.stringify(ledger, null, 2));
      }
      const complete = ledger.cells.every((cell) => cell.status === 'complete' || cell.status === 'not-applicable-with-reason');
      return options.requireComplete === true && !complete ? 1 : 0;
    }
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
    } else {
      io.stdout(JSON.stringify(report, null, 2));
    }

    return 0;
  },
});

process.exitCode = exitCode;
