import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { validateOpnGraphAtomEnrollmentSnapshot, type OpnGraphAtomEnrollmentSnapshot } from './opn-graph-atom-enrollment.js';

export const OPN_SAME_DEVICE_READONLY_RUNNER_SCHEMA = 'zj-loop.opn_same_device_readonly_runner.v1' as const;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

export type ReadonlyAgentProvider = {
  run(input: { cwd: string; prompt: string; executable: string; mode: 'read-only' }): Promise<{
    status: 'completed' | 'failed' | 'cancelled' | 'timed-out';
    success: boolean;
    pid: number;
    exit_code: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    provider?: string;
  }>;
};

export type SameDeviceReadonlyTask = {
  task_id: string;
  node_id: string;
  executable: string;
  cwd: string;
  prompt: string;
  resource_scope: readonly string[];
};

export type SameDeviceReadonlyAgentResult = {
  task_id: string;
  node_id: string;
  status: 'passed' | 'blocked' | 'outcome-uncertain';
  provider_status: string;
  stdout_digest: string;
  stderr_digest: string;
  stdout_bytes: number;
  stderr_bytes: number;
  evidence_digest: string;
  reason?: string;
};

export type SameDeviceReadonlyRunResult = {
  schema: typeof OPN_SAME_DEVICE_READONLY_RUNNER_SCHEMA;
  status: 'passed' | 'blocked' | 'outcome-uncertain';
  network_id: string;
  graph_id: string;
  device_id: string;
  enrollment_digest: string;
  agent_results: SameDeviceReadonlyAgentResult[];
  evidence_digest: string;
  reason?: string;
};

function digest(value: unknown): string {
  const encoded = canonicalize(value);
  if (typeof encoded !== 'string') throw new Error('same-device-readonly-canonicalization-invalid');
  return `sha256:${createHash('sha256').update(encoded, 'utf8').digest('hex')}`;
}

function bytes(value: string): number { return Buffer.byteLength(value, 'utf8'); }

function validText(value: unknown): value is string { return typeof value === 'string' && value.trim() !== '' && !value.includes('\0'); }

function validateTask(task: SameDeviceReadonlyTask, enrollment: OpnGraphAtomEnrollmentSnapshot): string | null {
  if (!validText(task.task_id) || !validText(task.node_id) || !validText(task.executable) || !task.executable.startsWith('/') || !validText(task.cwd) || !task.cwd.startsWith('/') || !validText(task.prompt)) return 'task-shape-invalid';
  if (!Array.isArray(task.resource_scope) || task.resource_scope.length === 0 || task.resource_scope.some((scope) => !validText(scope) || !scope.startsWith('read:'))) return 'readonly-resource-scope-invalid';
  const agent = enrollment.agents.find((candidate) => candidate.node_id === task.node_id);
  if (!agent) return 'task-agent-not-enrolled';
  if (!agent.capability_ceiling.includes('read')) return 'task-agent-read-capability-missing';
  return null;
}

export async function runSameDeviceReadonlyAgentTasks(input: {
  enrollment: OpnGraphAtomEnrollmentSnapshot;
  tasks: readonly SameDeviceReadonlyTask[];
  providers: ReadonlyMap<string, ReadonlyAgentProvider>;
}): Promise<SameDeviceReadonlyRunResult> {
  const enrollmentResult = validateOpnGraphAtomEnrollmentSnapshot(input.enrollment);
  if (enrollmentResult.status === 'blocked') throw new Error(`same-device-readonly-enrollment-${enrollmentResult.reason}`);
  const enrollment = enrollmentResult.snapshot;
  if (!Array.isArray(input.tasks) || input.tasks.length !== 2) throw new Error('same-device-readonly-requires-two-tasks');
  if (new Set(input.tasks.map((task) => task.node_id)).size !== input.tasks.length) throw new Error('same-device-readonly-agent-duplicate');
  const taskErrors = input.tasks.map((task) => validateTask(task, enrollment));
  if (taskErrors.some(Boolean)) throw new Error(`same-device-readonly-${taskErrors.find(Boolean)}`);
  const started = input.tasks.map(async (task): Promise<SameDeviceReadonlyAgentResult> => {
    const provider = input.providers.get(task.node_id);
    if (!provider) return { task_id: task.task_id, node_id: task.node_id, status: 'blocked', provider_status: 'not-started', stdout_digest: digest(''), stderr_digest: digest(''), stdout_bytes: 0, stderr_bytes: 0, evidence_digest: digest({ task_id: task.task_id, status: 'blocked', reason: 'provider-not-registered' }), reason: 'provider-not-registered' };
    let result;
    try { result = await provider.run({ cwd: task.cwd, prompt: task.prompt, executable: task.executable, mode: 'read-only' }); }
    catch { return { task_id: task.task_id, node_id: task.node_id, status: 'outcome-uncertain', provider_status: 'exception', stdout_digest: digest(''), stderr_digest: digest(''), stdout_bytes: 0, stderr_bytes: 0, evidence_digest: digest({ task_id: task.task_id, status: 'outcome-uncertain', reason: 'provider-exception' }), reason: 'provider-exception' }; }
    const stdout_digest = digest(result.stdout);
    const stderr_digest = digest(result.stderr);
    const status = result.status === 'completed' && result.success ? 'passed' : result.status === 'failed' || result.status === 'cancelled' || result.status === 'timed-out' ? 'blocked' : 'outcome-uncertain';
    const reason = status === 'passed' ? undefined : `provider-${result.status}`;
    const evidence_digest = digest({ schema: OPN_SAME_DEVICE_READONLY_RUNNER_SCHEMA, task_id: task.task_id, node_id: task.node_id, provider: result.provider ?? 'unknown', provider_status: result.status, success: result.success, pid: result.pid, exit_code: result.exit_code, signal: result.signal, stdout_digest, stderr_digest, reason: reason ?? null });
    return { task_id: task.task_id, node_id: task.node_id, status, provider_status: result.status, stdout_digest, stderr_digest, stdout_bytes: bytes(result.stdout), stderr_bytes: bytes(result.stderr), evidence_digest, ...(reason ? { reason } : {}) };
  });
  const agent_results = await Promise.all(started);
  const status = agent_results.every((result) => result.status === 'passed') ? 'passed' : agent_results.some((result) => result.status === 'outcome-uncertain') ? 'outcome-uncertain' : 'blocked';
  const evidence_digest = digest({ schema: OPN_SAME_DEVICE_READONLY_RUNNER_SCHEMA, network_id: enrollment.network_id, graph_id: enrollment.graph_id, device_id: enrollment.device_id, enrollment_digest: enrollment.snapshot_digest, agent_results });
  return { schema: OPN_SAME_DEVICE_READONLY_RUNNER_SCHEMA, status, network_id: enrollment.network_id, graph_id: enrollment.graph_id, device_id: enrollment.device_id, enrollment_digest: enrollment.snapshot_digest, agent_results, evidence_digest, ...(status === 'passed' ? {} : { reason: 'same-device-readonly-agent-result-not-passed' }) };
}

export function validateSameDeviceReadonlyRunResult(value: unknown): { status: 'valid' } | { status: 'blocked'; reason: string } {
  if (!value || typeof value !== 'object' || (value as Record<string, unknown>).schema !== OPN_SAME_DEVICE_READONLY_RUNNER_SCHEMA) return { status: 'blocked', reason: 'same-device-readonly-result-shape-invalid' };
  const item = value as Record<string, unknown>;
  if (!DIGEST.test(String(item.enrollment_digest)) || !DIGEST.test(String(item.evidence_digest)) || !Array.isArray(item.agent_results) || item.agent_results.length !== 2) return { status: 'blocked', reason: 'same-device-readonly-result-evidence-invalid' };
  return { status: 'valid' };
}
