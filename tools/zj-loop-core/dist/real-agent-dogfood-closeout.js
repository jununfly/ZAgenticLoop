import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { verifyHumanSignature } from './human-signer.js';
const execFile = promisify(execFileCallback);
const DIGEST = /^sha256:[0-9a-f]{64}$/;
export const REAL_AGENT_DOGFOOD_CLOSEOUT_SCHEMA = 'zj-loop.real_agent_dogfood_closeout.v1';
export const REAL_AGENT_DOGFOOD_CLOSEOUT_EVENT_SCHEMA = 'zj-loop.real_agent_dogfood_closeout_event.v1';
export const REAL_AGENT_DOGFOOD_CLOSEOUT_AGGREGATE_TYPE = 'real-agent-dogfood-closeout';
export const REAL_AGENT_DOGFOOD_CLOSEOUT_LIFECYCLE_EVENT_SCHEMA = 'zj-loop.real_agent_dogfood_closeout_lifecycle_event.v1';
function canonical(value) { const json = canonicalize(value); if (typeof json !== 'string')
    throw new Error('real-agent-dogfood-closeout-canonicalization-invalid'); return json; }
function digest(value) { return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`; }
function payloadBytes(value) { return new TextEncoder().encode(canonical(value)); }
function payloadOf(value) { return { schema: value.schema, network_id: value.network_id, dogfood_id: value.dogfood_id, execution_id: value.execution_id, attempt: value.attempt, lifecycle_status: value.lifecycle_status, lifecycle_digest: value.lifecycle_digest, worktree_path: value.worktree_path, human_id: value.human_id, signer_fingerprint: value.signer_fingerprint, reason: value.reason, closed_at: value.closed_at }; }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
export async function createRealAgentDogfoodCloseout(input) {
    const status = input.lifecycle.status;
    if (status !== 'accepted' && status !== 'rejected')
        throw new Error('real-agent-dogfood-closeout-lifecycle-not-terminal');
    if (!path.isAbsolute(input.worktree_path) || !text(input.reason) || !Number.isFinite(Date.parse(input.closed_at)))
        throw new Error('real-agent-dogfood-closeout-input-invalid');
    const identity = await input.signer.getPublicIdentity();
    if (identity.schema !== 'zj-loop.human_signer.v1' || identity.algorithm !== 'ECDSA-P256' || !text(identity.human_id) || !/^[0-9a-f]{64}$/.test(identity.public_key_fingerprint))
        throw new Error('real-agent-dogfood-closeout-identity-invalid');
    const payload = { schema: REAL_AGENT_DOGFOOD_CLOSEOUT_SCHEMA, network_id: input.lifecycle.network_id, dogfood_id: input.lifecycle.dogfood_id, execution_id: input.lifecycle.execution_id, attempt: input.lifecycle.attempt, lifecycle_status: status, lifecycle_digest: input.lifecycle.lifecycle_digest, worktree_path: input.worktree_path, human_id: identity.human_id, signer_fingerprint: identity.public_key_fingerprint, reason: input.reason, closed_at: input.closed_at };
    return { ...payload, canonical_payload_digest: digest(payload), signature: await input.signer.sign({ payload: payloadBytes(payload) }), side_effects_executed: false };
}
export function validateRealAgentDogfoodCloseout(input) {
    const value = input.closeout;
    const errors = [];
    if (value.schema !== REAL_AGENT_DOGFOOD_CLOSEOUT_SCHEMA || !['accepted', 'rejected'].includes(value.lifecycle_status))
        errors.push('schema-or-status-invalid');
    if (value.network_id !== input.lifecycle.network_id || value.dogfood_id !== input.lifecycle.dogfood_id || value.execution_id !== input.lifecycle.execution_id || value.attempt !== input.lifecycle.attempt || value.lifecycle_status !== input.lifecycle.status || value.lifecycle_digest !== input.lifecycle.lifecycle_digest)
        errors.push('lifecycle-binding-mismatch');
    if (!path.isAbsolute(value.worktree_path))
        errors.push('worktree-binding-invalid');
    if (!DIGEST.test(value.lifecycle_digest) || !DIGEST.test(value.canonical_payload_digest) || !text(value.human_id) || !/^[0-9a-f]{64}$/.test(value.signer_fingerprint) || !text(value.reason) || !Number.isFinite(Date.parse(value.closed_at)))
        errors.push('closeout-binding-invalid');
    if (value.side_effects_executed !== false || input.identity.human_id !== value.human_id || input.identity.public_key_fingerprint !== value.signer_fingerprint || !value.signature || value.signature.public_key_fingerprint !== value.signer_fingerprint)
        errors.push('signature-binding-invalid');
    if (value.canonical_payload_digest !== digest(payloadOf(value)))
        errors.push('canonical-payload-digest-invalid');
    if (errors.length === 0 && !verifyHumanSignature({ identity: input.identity, payload: payloadBytes(payloadOf(value)), signature: value.signature }))
        errors.push('human-signature-invalid');
    return { status: errors.length === 0 ? 'valid' : 'blocked', errors };
}
async function canonicalPath(input) {
    const absolute = path.resolve(input);
    try {
        return await realpath(absolute);
    }
    catch {
        return path.join(await realpath(path.dirname(absolute)), path.basename(absolute));
    }
}
function inside(child, parent) { const relative = path.relative(parent, child); return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)); }
async function git(args, cwd) { return (await execFile('git', args, { cwd, maxBuffer: 1024 * 1024 })).stdout.trim(); }
export async function removeRealAgentDogfoodWorktree(input) {
    const repo = await canonicalPath(input.repo_root);
    const worktree = await canonicalPath(input.worktree_path);
    await stat(repo);
    await stat(worktree);
    if (inside(worktree, repo))
        throw new Error('worktree-inside-repo');
    const status = await git(['-C', worktree, 'status', '--porcelain', '--untracked-files=all'], repo);
    if (status)
        throw new Error('worktree-not-clean');
    const listed = await git(['-C', repo, 'worktree', 'list', '--porcelain'], repo);
    const paths = listed.split('\n').filter((line) => line.startsWith('worktree ')).map((line) => path.resolve(line.slice('worktree '.length)));
    if (!paths.includes(worktree))
        throw new Error('worktree-not-registered');
    await git(['-C', repo, 'worktree', 'remove', worktree], repo);
}
async function assertNoActiveLease(stateStore, networkId, executionId, now) {
    const events = await stateStore.readEvents({ network_id: networkId, aggregate_type: 'real-agent-dogfood-worker', aggregate_id: executionId });
    const latest = events.events.at(-1)?.payload;
    if (latest?.schema === 'zj-loop.real_agent_dogfood_worker_lease.v1' && latest.execution_id === executionId && typeof latest.expires_at === 'string' && Date.parse(now) < Date.parse(latest.expires_at))
        throw new Error('real-agent-dogfood-closeout-worker-active');
}
export async function recordRealAgentDogfoodCloseout(input) {
    const validation = validateRealAgentDogfoodCloseout({ closeout: input.closeout, identity: input.identity, lifecycle: input.lifecycle });
    if (validation.status === 'blocked')
        throw new Error(`real-agent-dogfood-closeout-invalid:${validation.errors.join(',')}`);
    if (input.closeout.worktree_path !== input.worktree_path)
        throw new Error('real-agent-dogfood-closeout-worktree-binding-mismatch');
    const now = input.now ?? new Date().toISOString();
    await assertNoActiveLease(input.stateStore, input.lifecycle.network_id, input.lifecycle.execution_id, now);
    const event = { event_id: `${input.lifecycle.dogfood_id}:attempt-${input.lifecycle.attempt}:closeout`, aggregate_type: REAL_AGENT_DOGFOOD_CLOSEOUT_AGGREGATE_TYPE, aggregate_id: input.lifecycle.dogfood_id, event_type: 'real-agent-dogfood-closeout.closed', occurred_at: now, payload: { schema: REAL_AGENT_DOGFOOD_CLOSEOUT_EVENT_SCHEMA, closeout: input.closeout } };
    const existing = (await input.stateStore.readEvents({ network_id: input.lifecycle.network_id, aggregate_type: REAL_AGENT_DOGFOOD_CLOSEOUT_AGGREGATE_TYPE, aggregate_id: input.lifecycle.dogfood_id })).events.find((item) => item.event_id === event.event_id);
    if (existing) {
        if (canonical(existing.payload) !== canonical(event.payload))
            throw new Error('real-agent-dogfood-closeout-event-conflict');
        return { status: 'closed', revision: existing.revision, event: existing };
    }
    await removeRealAgentDogfoodWorktree({ repo_root: input.repo_root, worktree_path: input.worktree_path });
    const result = await input.stateStore.appendEvent({ network_id: input.lifecycle.network_id, expected_revision: input.expected_revision, event });
    if (result.status === 'conflict' || result.revision === undefined)
        throw new Error('real-agent-dogfood-closeout-revision-conflict');
    const recorded = (await input.stateStore.readEvents({ network_id: input.lifecycle.network_id, aggregate_type: REAL_AGENT_DOGFOOD_CLOSEOUT_AGGREGATE_TYPE, aggregate_id: input.lifecycle.dogfood_id })).events.find((item) => item.event_id === event.event_id);
    if (!recorded)
        throw new Error('real-agent-dogfood-closeout-record-missing');
    return { status: 'closed', revision: recorded.revision, event: recorded };
}
function decisionCloseoutAggregateId(lifecycle) { return `${lifecycle.dogfood_id}:attempt-${lifecycle.attempt}`; }
function validateDecisionCloseoutInput(input) {
    if (input.lifecycle.status !== 'accepted' && input.lifecycle.status !== 'rejected')
        throw new Error('real-agent-dogfood-closeout-lifecycle-not-terminal');
    if (!DIGEST.test(input.decision_digest) || !DIGEST.test(input.package_digest))
        throw new Error('real-agent-dogfood-closeout-decision-binding-invalid');
    if (input.lifecycle.last_fact_digest !== input.decision_digest)
        throw new Error('real-agent-dogfood-closeout-decision-binding-mismatch');
    if (!path.isAbsolute(input.worktree_path))
        throw new Error('real-agent-dogfood-closeout-worktree-binding-invalid');
}
function decisionCloseoutEvent(input) {
    const payload = { schema: REAL_AGENT_DOGFOOD_CLOSEOUT_LIFECYCLE_EVENT_SCHEMA, status: input.status, network_id: input.lifecycle.network_id, dogfood_id: input.lifecycle.dogfood_id, execution_id: input.lifecycle.execution_id, attempt: input.lifecycle.attempt, lifecycle_status: input.lifecycle.status, lifecycle_digest: input.lifecycle.lifecycle_digest, decision_digest: input.decision_digest, package_digest: input.package_digest, worktree_path: input.worktree_path, reason: input.reason };
    return { event_id: `${decisionCloseoutAggregateId(input.lifecycle)}:${input.status}`, aggregate_type: REAL_AGENT_DOGFOOD_CLOSEOUT_AGGREGATE_TYPE, aggregate_id: decisionCloseoutAggregateId(input.lifecycle), event_type: 'real-agent-dogfood-closeout.lifecycle-transitioned', occurred_at: input.now, payload };
}
export async function recordRealAgentDogfoodDecisionCloseout(input) {
    validateDecisionCloseoutInput(input);
    const now = input.now ?? new Date().toISOString();
    await assertNoActiveLease(input.stateStore, input.lifecycle.network_id, input.lifecycle.execution_id, now);
    const aggregate_id = decisionCloseoutAggregateId(input.lifecycle);
    const existing = (await input.stateStore.readEvents({ network_id: input.lifecycle.network_id, aggregate_type: REAL_AGENT_DOGFOOD_CLOSEOUT_AGGREGATE_TYPE, aggregate_id })).events;
    const latest = existing.at(-1);
    const latestPayload = latest?.payload;
    if (latestPayload && (latestPayload.decision_digest !== input.decision_digest || latestPayload.package_digest !== input.package_digest || latestPayload.lifecycle_digest !== input.lifecycle.lifecycle_digest || latestPayload.worktree_path !== input.worktree_path))
        throw new Error('real-agent-dogfood-closeout-binding-conflict');
    if (latestPayload?.status === 'closed')
        return { status: 'closed', revision: latest.revision, event: latest };
    const pending = latestPayload?.status === 'cleanup-pending' || latestPayload?.status === 'outcome-uncertain' ? latest : undefined;
    let pendingRevision = pending?.revision;
    if (pendingRevision === undefined) {
        const pendingEvent = decisionCloseoutEvent({ ...input, status: 'cleanup-pending', reason: 'cleanup-started', now });
        const pendingResult = await input.stateStore.appendEvent({ network_id: input.lifecycle.network_id, expected_revision: input.expected_revision, now, event: pendingEvent });
        if (pendingResult.status === 'conflict' || pendingResult.revision === undefined)
            throw new Error('real-agent-dogfood-closeout-revision-conflict');
        pendingRevision = pendingResult.revision;
    }
    try {
        await removeRealAgentDogfoodWorktree({ repo_root: input.repo_root, worktree_path: input.worktree_path });
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : 'cleanup-failed';
        const uncertainEvent = decisionCloseoutEvent({ ...input, status: 'outcome-uncertain', reason, now });
        const uncertainResult = await input.stateStore.appendEvent({ network_id: input.lifecycle.network_id, expected_revision: pendingRevision, now, event: uncertainEvent });
        if (uncertainResult.status === 'conflict' || uncertainResult.revision === undefined)
            throw new Error('real-agent-dogfood-closeout-outcome-uncertain-record-conflict');
        return { status: 'outcome-uncertain', revision: uncertainResult.revision, event: uncertainEvent, reason };
    }
    const closedEvent = decisionCloseoutEvent({ ...input, status: 'closed', reason: 'cleanup-verified', now });
    const closedResult = await input.stateStore.appendEvent({ network_id: input.lifecycle.network_id, expected_revision: pendingRevision, now, event: closedEvent });
    if (closedResult.status === 'conflict' || closedResult.revision === undefined)
        throw new Error('real-agent-dogfood-closeout-closed-record-conflict');
    return { status: 'closed', revision: closedResult.revision, event: closedEvent };
}
