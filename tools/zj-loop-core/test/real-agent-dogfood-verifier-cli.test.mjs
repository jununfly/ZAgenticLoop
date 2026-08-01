import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { runRealAgentDogfoodVerifierCli } from '../dist/real-agent-dogfood-verifier-cli.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createContentAddressedEvidenceStore } from '../dist/content-addressed-evidence-store.js';
import { createRealAgentDogfoodDraft, createRealAgentDogfoodTransition, appendRealAgentDogfoodEvent, projectRealAgentDogfoodLifecycle } from '../dist/real-agent-dogfood-lifecycle.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;

test('verifier CLI reads a persisted context and converges missing provider fact to outcome-uncertain', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-verifier-cli-'));
  const statePath = path.join(root, 'state.db');
  const evidencePath = path.join(root, 'evidence');
  const contextPath = path.join(root, 'verifier-context.json');
  const store = createSqliteStateStore({ filename: statePath });
  await createContentAddressedEvidenceStore({ root: evidencePath });
  try {
    await store.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-01T12:00:00.000Z' });
    const draft = createRealAgentDogfoodDraft({ network_id: 'network-1', dogfood_id: 'dogfood-1', execution_id: 'execution-1', attempt: 1, provider_id: 'codex', adapter_version: 'codex-agent-provider.v1', created_at: '2026-08-01T12:00:00.000Z' });
    const ready = createRealAgentDogfoodTransition({ lifecycle: draft.lifecycle, to: 'preflight-ready', event_id: 'ready', occurred_at: '2026-08-01T12:00:01.000Z', fact_digest: digest('a'), next_action: 'human-approval' });
    const awaiting = createRealAgentDogfoodTransition({ lifecycle: ready.lifecycle, to: 'awaiting-human-approval', event_id: 'awaiting', occurred_at: '2026-08-01T12:00:02.000Z', fact_digest: digest('a'), next_action: 'human-approval' });
    const running = createRealAgentDogfoodTransition({ lifecycle: awaiting.lifecycle, to: 'running', event_id: 'running', occurred_at: '2026-08-01T12:00:03.000Z', approval_digest: digest('b'), next_action: 'provider-execution' });
    const pending = createRealAgentDogfoodTransition({ lifecycle: running.lifecycle, to: 'verification-pending', event_id: 'pending', occurred_at: '2026-08-01T12:00:04.000Z', fact_digest: digest('c'), next_action: 'run-independent-verifier' });
    let revision = 1;
    for (const event of [draft.event, ready.event, awaiting.event, running.event, pending.event]) await appendRealAgentDogfoodEvent({ stateStore: store, expected_revision: revision++, event });
    const context = { schema: 'zj-loop.real_agent_dogfood_verifier_context.v1', state_store: statePath, evidence_store: evidencePath, network_id: 'network-1', dogfood_id: 'dogfood-1', execution_id: 'execution-1', attempt: 1, verifier_id: 'verifier-1', provider_fact_digest: digest('d'), stdout_digest: digest('e'), stderr_digest: digest('f'), expected_revision: await store.getRevision('network-1') };
    await (await import('node:fs/promises')).writeFile(contextPath, JSON.stringify(context));
    const stdout = [];
    const stderr = [];
    const exitCode = await runRealAgentDogfoodVerifierCli(['verify', '--context', contextPath], { stdout: (message) => stdout.push(message), stderr: (message) => stderr.push(message) });
    assert.deepEqual(stderr, []);
    assert.equal(exitCode, 2);
    assert.equal(JSON.parse(stdout[0]).status, 'outcome-uncertain');
    const events = await store.readEvents({ network_id: 'network-1', aggregate_type: 'real-agent-dogfood', aggregate_id: 'dogfood-1' });
    assert.equal(projectRealAgentDogfoodLifecycle(events.events).status, 'outcome-uncertain');
  } finally { await store.close(); await rm(root, { recursive: true, force: true }); }
});
