import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { projectRealAgentDogfoodLifecycle } from './real-agent-dogfood-lifecycle.js';
function text(value) { return typeof value === 'string' && value.trim() !== ''; }
function digest(value) { return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value); }
export function createRealAgentDogfoodApprovalUiUpstream(input) {
    if (!input.network_id.trim() || !path.isAbsolute(input.evidenceRoot))
        throw new Error('real-agent-dogfood-approval-ui-input-invalid');
    const now = input.now ?? (() => new Date().toISOString());
    async function readPending(plan) {
        const events = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: 'real-agent-dogfood', aggregate_id: plan.dogfood_id })).events;
        const lifecycle = projectRealAgentDogfoodLifecycle(events);
        if (lifecycle.status !== 'awaiting-human-approval')
            return undefined;
        let summary;
        try {
            summary = JSON.parse(await readFile(path.join(input.evidenceRoot, `${plan.dogfood_id}.approval-summary.json`), 'utf8'));
        }
        catch {
            return undefined;
        }
        if (summary.schema !== 'zj-loop.real_agent_dogfood_approval_summary.v1' || summary.status !== lifecycle.status || summary.network_id !== input.network_id || summary.dogfood_id !== plan.dogfood_id || summary.execution_id !== plan.execution_id || summary.attempt !== plan.attempt || !text(summary.goal) || !text(summary.worktree_path) || !text(summary.execution_mode) || !Array.isArray(summary.allowed_files) || !digest(summary.summary_digest))
            return undefined;
        return { dogfood_id: plan.dogfood_id, execution_id: plan.execution_id, attempt: plan.attempt, network_id: input.network_id, goal: summary.goal, execution_mode: summary.execution_mode, allowed_files: [...summary.allowed_files], worktree_path: summary.worktree_path, summary_digest: summary.summary_digest, status: 'pending' };
    }
    return {
        async list() {
            const requests = (await Promise.all(input.plans.map(readPending))).filter((request) => Boolean(request));
            return { requests };
        },
        async approve({ request, context, identity }) {
            if (context.action !== 'real-agent-dogfood.approve' || context.request_id !== request.dogfood_id || context.request_digest !== request.summary_digest || context.network_id !== input.network_id || context.human_id.trim() === '')
                throw new Error('real-agent-dogfood-approval-context-invalid');
            const current = (await Promise.all(input.plans.map(readPending))).find((candidate) => candidate?.dogfood_id === request.dogfood_id);
            if (!current)
                return { status: 'conflict', reason: 'real-agent-dogfood-approval-state-conflict', side_effects_executed: false };
            const envelope = { schema: 'zj-loop.real_agent_dogfood_approval_envelope.v1', dogfood_id: request.dogfood_id, execution_id: request.execution_id, attempt: request.attempt, lifecycle_revision: 4, policy_digest: undefined, approval_summary_digest: request.summary_digest, approval: context, identity };
            const summary = JSON.parse(await readFile(path.join(input.evidenceRoot, `${request.dogfood_id}.approval-summary.json`), 'utf8'));
            if (!digest(summary.policy_digest) || !Number.isInteger(summary.lifecycle_revision))
                throw new Error('real-agent-dogfood-approval-summary-invalid');
            if (summary.admission_digest !== undefined && !digest(summary.admission_digest))
                throw new Error('real-agent-dogfood-approval-admission-digest-invalid');
            const boundEnvelope = {
                ...envelope,
                lifecycle_revision: summary.lifecycle_revision,
                policy_digest: summary.policy_digest,
                ...(summary.admission_digest ? { admission_digest: summary.admission_digest } : {}),
                ...(summary.provider_auth_ref ? { provider_auth_ref: summary.provider_auth_ref } : {}),
                ...(summary.runtime_binding ? { runtime_binding: summary.runtime_binding } : {}),
            };
            const target = path.join(input.evidenceRoot, `${request.dogfood_id}.json`);
            try {
                const existing = JSON.parse(await readFile(target, 'utf8'));
                if (existing.approval_summary_digest === request.summary_digest && existing.admission_digest === summary.admission_digest && JSON.stringify(existing.provider_auth_ref) === JSON.stringify(summary.provider_auth_ref) && JSON.stringify(existing.runtime_binding) === JSON.stringify(summary.runtime_binding))
                    return { status: 'duplicate', approval_id: request.dogfood_id, side_effects_executed: false };
            }
            catch { /* first approval */ }
            // Admission binding can revise the approval summary while the lifecycle is still waiting for this human approval.
            // Replace only that stale artifact, and publish the new envelope with a same-directory rename.
            const temporaryTarget = `${target}.${process.pid}.${Date.now()}.tmp`;
            try {
                await writeFile(temporaryTarget, `${JSON.stringify(boundEnvelope, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
                await rename(temporaryTarget, target);
            }
            catch (error) {
                await unlink(temporaryTarget).catch(() => undefined);
                throw error;
            }
            return { status: 'recorded', approval_id: request.dogfood_id, approved_at: now(), side_effects_executed: true };
        },
    };
}
