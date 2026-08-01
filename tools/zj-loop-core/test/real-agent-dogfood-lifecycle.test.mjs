import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  appendRealAgentDogfoodEvent,
  createRealAgentDogfoodDraft,
  createRealAgentDogfoodTransition,
  projectRealAgentDogfoodLifecycle,
} from '../dist/real-agent-dogfood-lifecycle.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const digest = (letter) => `sha256:${letter.repeat(64)}`;

function transition(lifecycle, to, event_id, extra = {}) {
  return createRealAgentDogfoodTransition({
    lifecycle,
    to,
    event_id,
    occurred_at: '2026-08-01T12:00:00.000Z',
    fact_digest: digest(event_id.slice(-1) || 'a'),
    ...extra,
  });
}

test('RealAgentDogfoodLifecycle creates a draft and maps a valid preparation path', () => {
  const draft = createRealAgentDogfoodDraft({
    network_id: 'network-1',
    dogfood_id: 'dogfood-1',
    execution_id: 'execution-1',
    attempt: 1,
    provider_id: 'provider-1',
    adapter_version: 'adapter-1',
    created_at: '2026-08-01T12:00:00.000Z',
  });
  assert.equal(draft.lifecycle.status, 'draft');
  const ready = transition(draft.lifecycle, 'preflight-ready', 'event-ready-1');
  const awaiting = transition(ready.lifecycle, 'awaiting-human-approval', 'event-awaiting-1');
  assert.equal(awaiting.lifecycle.status, 'awaiting-human-approval');
  assert.deepEqual(projectRealAgentDogfoodLifecycle([draft.event, ready.event, awaiting.event]), awaiting.lifecycle);
});

test('RealAgentDogfoodLifecycle rejects invalid jumps and requires facts for stop states', () => {
  const draft = createRealAgentDogfoodDraft({ network_id: 'network-1', dogfood_id: 'dogfood-1', execution_id: 'execution-1', attempt: 1, provider_id: 'provider-1', adapter_version: 'adapter-1', created_at: '2026-08-01T12:00:00.000Z' });
  assert.throws(() => transition(draft.lifecycle, 'running', 'event-running-1'), { message: 'real-agent-dogfood-transition-invalid' });
  assert.throws(() => createRealAgentDogfoodTransition({ lifecycle: draft.lifecycle, to: 'blocked', event_id: 'event-blocked-1', occurred_at: '2026-08-01T12:00:00.000Z' }), { message: 'real-agent-dogfood-stop-fact-required' });
});

test('Request revision creates a new attempt while preserving the prior attempt', () => {
  const draft = createRealAgentDogfoodDraft({ network_id: 'network-1', dogfood_id: 'dogfood-1', execution_id: 'execution-1', attempt: 1, provider_id: 'provider-1', adapter_version: 'adapter-1', created_at: '2026-08-01T12:00:00.000Z' });
  const ready = transition(draft.lifecycle, 'preflight-ready', 'event-ready-1');
  const awaiting = transition(ready.lifecycle, 'awaiting-human-approval', 'event-awaiting-1');
  const running = transition(awaiting.lifecycle, 'running', 'event-running-1', { approval_digest: digest('a') });
  const verification = transition(running.lifecycle, 'verification-pending', 'event-verification-1', { fact_digest: digest('b') });
  const review = transition(verification.lifecycle, 'review-pending', 'event-review-1', { fact_digest: digest('c') });
  const revision = transition(review.lifecycle, 'request-revision', 'event-revision-1', { reason_code: 'human-requested-revision', next_action: 'create-new-attempt' });
  const nextDraft = transition(revision.lifecycle, 'draft', 'event-draft-2', { attempt: 2, execution_id: 'execution-2', next_action: 'prepare-preflight' });
  assert.equal(revision.lifecycle.attempt, 1);
  assert.equal(nextDraft.lifecycle.attempt, 2);
  assert.equal(nextDraft.lifecycle.execution_id, 'execution-2');
});

test('Replay fails closed for unknown event, event conflict, or invalid prerequisite', () => {
  const draft = createRealAgentDogfoodDraft({ network_id: 'network-1', dogfood_id: 'dogfood-1', execution_id: 'execution-1', attempt: 1, provider_id: 'provider-1', adapter_version: 'adapter-1', created_at: '2026-08-01T12:00:00.000Z' });
  assert.throws(() => projectRealAgentDogfoodLifecycle([{ ...draft.event, event_type: 'unknown.event' }]), { message: 'real-agent-dogfood-event-unknown' });
  assert.throws(() => projectRealAgentDogfoodLifecycle([draft.event, { ...draft.event, event_id: 'event-conflict', payload: { ...draft.event.payload, to_status: 'running' } }]), { message: 'real-agent-dogfood-event-sequence-invalid' });
  assert.throws(() => projectRealAgentDogfoodLifecycle([{ ...draft.event, payload: { ...draft.event.payload, from_status: 'running' } }]), { message: 'real-agent-dogfood-event-sequence-invalid' });
});

test('StateStore integration uses network revision CAS and event idempotency', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-real-agent-dogfood-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-01T12:00:00.000Z' });
    const draft = createRealAgentDogfoodDraft({ network_id: 'network-1', dogfood_id: 'dogfood-1', execution_id: 'execution-1', attempt: 1, provider_id: 'provider-1', adapter_version: 'adapter-1', created_at: '2026-08-01T12:00:00.000Z' });
    assert.deepEqual(await appendRealAgentDogfoodEvent({ stateStore, expected_revision: 1, event: draft.event }), { status: 'recorded', revision: 2, current_revision: 2 });
    assert.deepEqual(await appendRealAgentDogfoodEvent({ stateStore, expected_revision: 999, event: draft.event }), { status: 'duplicate', revision: 2, current_revision: 2 });
    const ready = transition(draft.lifecycle, 'preflight-ready', 'event-ready-1');
    assert.deepEqual(await appendRealAgentDogfoodEvent({ stateStore, expected_revision: 1, event: ready.event }), { status: 'conflict', current_revision: 2, reason: 'revision-mismatch' });
    const invalid = { ...draft.event, event_id: 'event-invalid-1', payload: { ...draft.event.payload, to_status: 'running' } };
    await assert.rejects(() => appendRealAgentDogfoodEvent({ stateStore, expected_revision: 2, event: invalid }), { message: 'real-agent-dogfood-event-sequence-invalid' });
    assert.equal(await stateStore.getRevision('network-1'), 2);
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});
