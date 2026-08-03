import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createContentAddressedEvidenceStore } from '../dist/content-addressed-evidence-store.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createRealAgentDogfoodDraft, createRealAgentDogfoodTransition, appendRealAgentDogfoodEvent, projectRealAgentDogfoodLifecycle } from '../dist/real-agent-dogfood-lifecycle.js';
import { createRealAgentDogfoodConformanceReport, createRealAgentDogfoodResultEnvelope } from '../dist/real-agent-dogfood-report.js';
import { runRealAgentDogfoodSelfAudit } from '../dist/real-agent-dogfood-self-audit.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;
function envelope() {
  const report = createRealAgentDogfoodConformanceReport({ scope: { repository: 'jununfly/ZAgenticLoop', input_commit: 'a'.repeat(40), manifest_digest: digest('a'), worktree_identity: 'worktree-1', roadmap_revision: 'roadmap-1' }, implemented: [], partial: [], missing: [], risks: [], evidence_refs: [], verification_refs: [], recommendations: [] });
  return createRealAgentDogfoodResultEnvelope({ execution: { execution_id: 'execution-1', attempt: 1, provider_id: 'fixture', adapter_version: '1' }, report, observations: [], claims: [], output: { events: [{ sequence: 1, kind: 'terminal', payload_digest: digest('b') }], terminal: { outcome: 'success', payload_digest: digest('b') } } });
}

async function fixture(root) {
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const evidenceStore = await createContentAddressedEvidenceStore({ root: path.join(root, 'evidence') });
  await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-03T12:00:00.000Z' });
  const draft = createRealAgentDogfoodDraft({ network_id: 'network-1', dogfood_id: 'dogfood-1', execution_id: 'execution-1', attempt: 1, provider_id: 'fixture', adapter_version: '1', created_at: '2026-08-03T12:00:00.000Z' });
  const pending = createRealAgentDogfoodTransition({ lifecycle: draft.lifecycle, to: 'preflight-ready', event_id: 'ready', occurred_at: '2026-08-03T12:00:01.000Z', fact_digest: digest('a'), next_action: 'human-approval' });
  const awaiting = createRealAgentDogfoodTransition({ lifecycle: pending.lifecycle, to: 'awaiting-human-approval', event_id: 'awaiting', occurred_at: '2026-08-03T12:00:02.000Z', fact_digest: digest('a'), next_action: 'human-approval' });
  const running = createRealAgentDogfoodTransition({ lifecycle: awaiting.lifecycle, to: 'running', event_id: 'running', occurred_at: '2026-08-03T12:00:03.000Z', approval_digest: digest('b'), next_action: 'provider-execution' });
  const verification = createRealAgentDogfoodTransition({ lifecycle: running.lifecycle, to: 'verification-pending', event_id: 'verification', occurred_at: '2026-08-03T12:00:04.000Z', fact_digest: digest('c'), next_action: 'independent-verification' });
  for (const [revision, event] of [draft.event, pending.event, awaiting.event, running.event, verification.event].entries()) await appendRealAgentDogfoodEvent({ stateStore, expected_revision: revision + 1, event });
  return { stateStore, evidenceStore, lifecycle: verification.lifecycle };
}

test('real provider self-audit reaches review-pending only after independent verification', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-self-audit-'));
  const { stateStore, evidenceStore, lifecycle } = await fixture(root);
  try {
    const result = await runRealAgentDogfoodSelfAudit({ stateStore, evidenceStore, lifecycle, provider_opt_in: true, provider: { async run() { return envelope(); } }, verifier_id: 'independent-verifier-1', independent_verifier: { async verify() { return { status: 'passed' }; } }, expected_revision: await stateStore.getRevision('network-1'), now: '2026-08-03T12:00:05.000Z' });
    assert.equal(result.status, 'review-pending');
    assert.match(result.evidence_digest, /^sha256:[0-9a-f]{64}$/);
    const events = await stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'real-agent-dogfood', aggregate_id: 'dogfood-1' });
    assert.equal(projectRealAgentDogfoodLifecycle(events.events).status, 'review-pending');
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('self-audit refuses to invoke a real provider without explicit opt-in', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-self-audit-opt-in-'));
  const { stateStore, evidenceStore, lifecycle } = await fixture(root);
  try {
    const revision = await stateStore.getRevision('network-1');
    await assert.rejects(() => runRealAgentDogfoodSelfAudit({ stateStore, evidenceStore, lifecycle, provider_opt_in: false, provider: { async run() { throw new Error('must-not-run'); } }, verifier_id: 'verifier-1', independent_verifier: { async verify() { return { status: 'passed' }; } }, expected_revision: revision }), /provider-opt-in-required/);
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});
