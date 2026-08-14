import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { opnNodeUiServiceLabel } from './opn-node-ui-service.js';
import type { BoundedLoopTask } from './agent-task.js';

const execFile = promisify(execFileCallback);
export const OPN_NODE_UI_SERVICE_TASK_KIND = 'opn-node-ui-service-dogfood' as const;
export const OPN_NODE_UI_SERVICE_DIAGNOSTIC_SCHEMA = 'zj-loop.opn_node_ui_service_diagnostic.v1' as const;
const MAX_OUTPUT = 128 * 1024;

export type DiagnosticEvidence = {
  schema: typeof OPN_NODE_UI_SERVICE_DIAGNOSTIC_SCHEMA;
  network_id: string;
  node_id: string;
  service_label: string;
  platform: 'win32' | 'darwin';
  port: number;
  service_status: { before: ServiceSnapshot; after: ServiceSnapshot };
  service_command: string | null;
  healthz: CheckResult;
  connection: CheckResult;
  restart_persistence: { attempted: true; end: CommandResult; run: CommandResult; healthy_after_restart: boolean };
  status: 'passed' | 'blocked';
  reason?: string;
  evidence_digest: string;
};

export type ServiceSnapshot = { status: 'running' | 'stopped' | 'not-found' | 'unknown'; raw: string };
export type CommandResult = { status: number | null; stdout: string; stderr: string };
export type CheckResult = { status: 'passed' | 'blocked'; http_status: number | null; body: unknown; reason?: string };

function digest(value: unknown): string { return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`; }
function trim(value: string): string { return value.length > MAX_OUTPUT ? value.slice(0, MAX_OUTPUT) : value; }
function parseJson(value: string): unknown { try { return JSON.parse(value) as unknown; } catch { return null; } }
function snapshot(result: CommandResult): ServiceSnapshot {
  const raw = trim(`${result.stdout}\n${result.stderr}`).trim();
  if (result.status !== 0 && /does not exist|cannot find|not found/i.test(raw)) return { status: 'not-found', raw };
  if (/\b(task state|status)\s*:\s*running\b/i.test(raw)) return { status: 'running', raw };
  if (/\b(task state|status)\s*:\s*(ready|stopped|disabled)\b/i.test(raw)) return { status: 'stopped', raw };
  return { status: 'unknown', raw };
}

async function defaultCommand(command: string, args: string[]): Promise<CommandResult> {
  try {
    const result = await execFile(command, args, { windowsHide: true, maxBuffer: MAX_OUTPUT });
    return { status: 0, stdout: trim(result.stdout), stderr: trim(result.stderr) };
  } catch (error) {
    const item = error as { code?: number | string; stdout?: string; stderr?: string; message?: string };
    return { status: typeof item.code === 'number' ? item.code : 1, stdout: trim(item.stdout ?? ''), stderr: trim(item.stderr ?? item.message ?? '') };
  }
}

function serviceCommand(raw: string): string | null {
  const line = raw.split(/\r?\n/).find((value) => /^\s*(task to run|task run|programarguments)\s*:/i.test(value));
  return line ? line.replace(/^\s*[^:]+:\s*/i, '').trim() || null : null;
}

async function check(url: string, fetcher: typeof fetch): Promise<CheckResult> {
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(5_000) });
    const body = parseJson(await response.text());
    return { status: response.ok ? 'passed' : 'blocked', http_status: response.status, body, ...(response.ok ? {} : { reason: `http-${response.status}` }) };
  } catch (error) {
    return { status: 'blocked', http_status: null, body: null, reason: error instanceof Error ? error.message : 'http-request-failed' };
  }
}

export function createOpnNodeUiServiceDiagnosticExecutor(input: {
  network_id: string;
  node_id: string;
  platform?: 'win32' | 'darwin';
  port?: number;
  command?: (command: string, args: string[]) => Promise<CommandResult>;
  fetcher?: typeof fetch;
}) {
  const platform = input.platform ?? (process.platform === 'win32' ? 'win32' : 'darwin');
  const port = input.port ?? 55616;
  const label = opnNodeUiServiceLabel(input.network_id, input.node_id);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('opn-node-ui-diagnostic-port-invalid');
  const command = input.command ?? defaultCommand;
  const fetcher = input.fetcher ?? fetch;
  const service: [string, string[]] = platform === 'win32' ? ['schtasks.exe', ['/Query', '/TN', label, '/FO', 'LIST', '/V']] : ['launchctl', ['print', `gui/${process.getuid?.() ?? 0}/${label}`]];
  const restart: { end: [string, string[]]; run: [string, string[]] } = platform === 'win32'
    ? { end: ['schtasks.exe', ['/End', '/TN', label]], run: ['schtasks.exe', ['/Run', '/TN', label]] }
    : { end: ['launchctl', ['kill', 'SIGTERM', `gui/${process.getuid?.() ?? 0}/${label}`]], run: ['launchctl', ['kickstart', `gui/${process.getuid?.() ?? 0}/${label}`]] };

  return async (task: BoundedLoopTask): Promise<{ status: 'succeeded' | 'blocked'; evidence_refs: string[]; evidence: DiagnosticEvidence; reason?: string }> => {
    if (task.task_kind !== OPN_NODE_UI_SERVICE_TASK_KIND) throw new Error('opn-node-ui-diagnostic-task-kind-invalid');
    const beforeResult = await command(service[0], service[1]);
    const before = snapshot(beforeResult);
    const end = await command(restart.end[0], restart.end[1]);
    const run = await command(restart.run[0], restart.run[1]);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const afterResult = await command(service[0], service[1]);
    const after = snapshot(afterResult);
    const healthz = await check(`http://127.0.0.1:${port}/healthz`, fetcher);
    const connection = await check(`http://127.0.0.1:${port}/ui/connection`, fetcher);
    const restartPersistence = { attempted: true as const, end, run, healthy_after_restart: after.status === 'running' && healthz.status === 'passed' && connection.status === 'passed' };
    const base = { schema: OPN_NODE_UI_SERVICE_DIAGNOSTIC_SCHEMA, network_id: input.network_id, node_id: input.node_id, service_label: label, platform, port, service_status: { before, after }, service_command: serviceCommand(before.raw) ?? serviceCommand(after.raw), healthz, connection, restart_persistence: restartPersistence };
    const passed = before.status === 'running' && after.status === 'running' && end.status === 0 && run.status === 0 && restartPersistence.healthy_after_restart;
    const evidence = { ...base, status: passed ? 'passed' as const : 'blocked' as const, ...(passed ? {} : { reason: 'opn-node-ui-service-diagnostic-check-failed' }), evidence_digest: digest(base) };
    return passed ? { status: 'succeeded', evidence_refs: [evidence.evidence_digest], evidence } : { status: 'blocked', reason: evidence.reason, evidence_refs: [evidence.evidence_digest], evidence };
  };
}
