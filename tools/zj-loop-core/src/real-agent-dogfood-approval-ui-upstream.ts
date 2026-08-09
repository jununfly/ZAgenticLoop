import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { HumanApprovalContext, HumanPublicIdentity } from './human-authority.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
import type { RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import { projectRealAgentDogfoodLifecycle, type RealAgentDogfoodEvent } from './real-agent-dogfood-lifecycle.js';

export type RealAgentDogfoodApprovalRequest = {
  dogfood_id: string;
  execution_id: string;
  attempt: number;
  network_id: string;
  goal: string;
  execution_mode: string;
  allowed_files: string[];
  worktree_path: string;
  summary_digest: string;
  status: 'pending';
};

export type RealAgentDogfoodApprovalUiUpstream = {
  list(): Promise<{ requests: RealAgentDogfoodApprovalRequest[] }>;
  approve(input: { request: RealAgentDogfoodApprovalRequest; context: HumanApprovalContext; identity: HumanPublicIdentity }): Promise<Record<string, unknown>>;
};

type Summary = {
  schema?: string;
  status?: string;
  network_id?: string;
  dogfood_id?: string;
  execution_id?: string;
  attempt?: number;
  goal?: string;
  execution_mode?: string;
  allowed_files?: string[];
  worktree_path?: string;
  summary_digest?: string;
};

function text(value: unknown): value is string { return typeof value === 'string' && value.trim() !== ''; }
function digest(value: unknown): value is string { return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value); }

export function createRealAgentDogfoodApprovalUiUpstream(input: {
  stateStore: Pick<SqliteStateStore, 'readEvents'>;
  evidenceRoot: string;
  network_id: string;
  plans: readonly RealAgentDogfoodGraphPlan[];
  now?: () => string;
}): RealAgentDogfoodApprovalUiUpstream {
  if (!input.network_id.trim() || !path.isAbsolute(input.evidenceRoot)) throw new Error('real-agent-dogfood-approval-ui-input-invalid');
  const now = input.now ?? (() => new Date().toISOString());
  async function readPending(plan: RealAgentDogfoodGraphPlan): Promise<RealAgentDogfoodApprovalRequest | undefined> {
    const events = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: 'real-agent-dogfood', aggregate_id: plan.dogfood_id })).events as unknown as RealAgentDogfoodEvent[];
    const lifecycle = projectRealAgentDogfoodLifecycle(events);
    if (lifecycle.status !== 'awaiting-human-approval') return undefined;
    let summary: Summary;
    try { summary = JSON.parse(await readFile(path.join(input.evidenceRoot, `${plan.dogfood_id}.approval-summary.json`), 'utf8')) as Summary; } catch { return undefined; }
    if (summary.schema !== 'zj-loop.real_agent_dogfood_approval_summary.v1' || summary.status !== lifecycle.status || summary.network_id !== input.network_id || summary.dogfood_id !== plan.dogfood_id || summary.execution_id !== plan.execution_id || summary.attempt !== plan.attempt || !text(summary.goal) || !text(summary.worktree_path) || !text(summary.execution_mode) || !Array.isArray(summary.allowed_files) || !digest(summary.summary_digest)) return undefined;
    return { dogfood_id: plan.dogfood_id, execution_id: plan.execution_id, attempt: plan.attempt, network_id: input.network_id, goal: summary.goal, execution_mode: summary.execution_mode, allowed_files: [...summary.allowed_files], worktree_path: summary.worktree_path, summary_digest: summary.summary_digest, status: 'pending' };
  }
  return {
    async list() {
      const requests = (await Promise.all(input.plans.map(readPending))).filter((request): request is RealAgentDogfoodApprovalRequest => Boolean(request));
      return { requests };
    },
    async approve({ request, context, identity }) {
      if (context.action !== 'real-agent-dogfood.approve' || context.request_id !== request.dogfood_id || context.request_digest !== request.summary_digest || context.network_id !== input.network_id || context.human_id.trim() === '') throw new Error('real-agent-dogfood-approval-context-invalid');
      const current = (await Promise.all(input.plans.map(readPending))).find((candidate): candidate is RealAgentDogfoodApprovalRequest => candidate?.dogfood_id === request.dogfood_id);
      if (!current) return { status: 'conflict', reason: 'real-agent-dogfood-approval-state-conflict', side_effects_executed: false };
      const envelope = { schema: 'zj-loop.real_agent_dogfood_approval_envelope.v1', dogfood_id: request.dogfood_id, execution_id: request.execution_id, attempt: request.attempt, lifecycle_revision: 4, policy_digest: undefined, approval_summary_digest: request.summary_digest, approval: context, identity };
      const summary = JSON.parse(await readFile(path.join(input.evidenceRoot, `${request.dogfood_id}.approval-summary.json`), 'utf8')) as Summary & { policy_digest?: string; lifecycle_revision?: number; adapter_contract_digest?: string };
      if (!digest(summary.policy_digest) || !Number.isInteger(summary.lifecycle_revision)) throw new Error('real-agent-dogfood-approval-summary-invalid');
      const boundEnvelope = { ...envelope, lifecycle_revision: summary.lifecycle_revision, policy_digest: summary.policy_digest };
      const target = path.join(input.evidenceRoot, `${request.dogfood_id}.json`);
      try {
        const existing = JSON.parse(await readFile(target, 'utf8')) as { approval_summary_digest?: string };
        if (existing.approval_summary_digest === request.summary_digest) return { status: 'duplicate', approval_id: request.dogfood_id, side_effects_executed: false };
        return { status: 'conflict', reason: 'real-agent-dogfood-approval-id-conflict', side_effects_executed: false };
      } catch { /* first approval */ }
      await writeFile(target, `${JSON.stringify(boundEnvelope, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
      return { status: 'recorded', approval_id: request.dogfood_id, approved_at: now(), side_effects_executed: true };
    },
  };
}
