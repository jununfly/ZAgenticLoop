import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export type LoopDoctorFinding = {
  kind: 'route-ambiguity' | 'protocol-repair' | 'hard-stop';
  count: number;
  severity: 'info' | 'warning' | 'error';
  recommendation: string;
};

export type LoopDoctorReport = {
  schema: 'zj-loop.diagnostic_report.v1';
  schema_version: 1;
  emit_signal: boolean;
  total_runs: number;
  findings: LoopDoctorFinding[];
  signal?: {
    schema: 'zj-loop.signal.v1';
    source: 'zj-loop-doctor';
    diagnostic_report: Omit<LoopDoctorReport, 'signal'>;
  };
};

type RunStateLike = {
  status?: string;
  stop_signal?: { reason?: string };
  machine_envelope?: {
    status?: string;
    stop_signal?: { reason?: string };
    protocol_repair_request?: unknown;
  };
};

export async function buildLoopDoctorReport(input: {
  root?: string;
  emitSignal?: boolean;
} = {}): Promise<LoopDoctorReport> {
  const runs = await readRunStates(input.root ?? '.');
  const findings = summarizeFindings(runs);
  const report: LoopDoctorReport = {
    schema: 'zj-loop.diagnostic_report.v1',
    schema_version: 1,
    emit_signal: input.emitSignal === true,
    total_runs: runs.length,
    findings,
  };

  if (input.emitSignal === true) {
    const { signal: _signal, ...diagnosticReport } = report;
    report.signal = {
      schema: 'zj-loop.signal.v1',
      source: 'zj-loop-doctor',
      diagnostic_report: diagnosticReport,
    };
  }

  return report;
}

async function readRunStates(root: string): Promise<RunStateLike[]> {
  const runsDir = path.resolve(root, 'zj-loop', 'runs');
  let entries: string[];
  try {
    entries = await readdir(runsDir);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'ENOENT') return [];
    throw err;
  }

  const states: RunStateLike[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const text = await readFile(path.join(runsDir, entry), 'utf8');
    states.push(JSON.parse(text) as RunStateLike);
  }
  return states;
}

function summarizeFindings(runs: RunStateLike[]): LoopDoctorFinding[] {
  const routeAmbiguity = runs.filter((run) => stopReason(run) === 'ambiguous-route').length;
  const protocolRepair = runs.filter((run) => run.status === 'needs_protocol_repair'
    || run.machine_envelope?.status === 'needs_protocol_repair'
    || run.machine_envelope?.protocol_repair_request !== undefined).length;
  const hardStop = runs.filter((run) => (run.status === 'stopped' || run.machine_envelope?.status === 'stopped')
    && stopReason(run) !== 'ambiguous-route').length;

  const findings: LoopDoctorFinding[] = [];
  if (routeAmbiguity > 0) {
    findings.push({
      kind: 'route-ambiguity',
      count: routeAmbiguity,
      severity: 'warning',
      recommendation: 'Prefer explicit --route or improve deterministic resolver rules for repeated ambiguous goals.',
    });
  }
  if (protocolRepair > 0) {
    findings.push({
      kind: 'protocol-repair',
      count: protocolRepair,
      severity: 'warning',
      recommendation: 'Review repeated protocol repair requests and promote safe defaults into deterministic normalization.',
    });
  }
  if (hardStop > 0) {
    findings.push({
      kind: 'hard-stop',
      count: hardStop,
      severity: 'info',
      recommendation: 'Inspect stop_signal reasons and decide whether route contracts, permissions, budgets, or verifier requirements need adjustment.',
    });
  }
  return findings;
}

function stopReason(run: RunStateLike): string | undefined {
  return run.stop_signal?.reason ?? run.machine_envelope?.stop_signal?.reason;
}
