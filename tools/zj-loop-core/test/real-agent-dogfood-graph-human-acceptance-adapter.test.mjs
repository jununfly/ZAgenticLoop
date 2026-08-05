import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { createProviderOutcome } from '../dist/provider-outcome.js';
import { createProviderOutcomeVerification } from '../dist/provider-outcome-verification.js';
import { createReviewHandoff } from '../dist/review-handoff.js';
import { createHumanAcceptance } from '../dist/human-acceptance.js';
import { createRealAgentDogfoodGraphHumanAcceptanceAdapter } from '../dist/real-agent-dogfood-graph-human-acceptance-adapter.js';
import { createRealAgentDogfoodGraphPhaseRecord } from '../dist/real-agent-dogfood-graph-state.js';
import { createRealAgentDogfoodGraphPlan } from '../dist/real-agent-dogfood-graph-orchestrator.js';
import { createContentAddressedEvidenceStore } from '../dist/content-addressed-evidence-store.js';

const digest = (value) => `sha256:${value.repeat(64)}`;

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-human-acceptance-adapter-'));
  const plan = createRealAgentDogfoodGraphPlan({
    dogfood_id: 'dogfood-human-acceptance', execution_id: 'execution-human-acceptance', attempt: 1,
    goal: 'accept graph result', repo_root: path.join(root, 'repo'), baseline_commit: 'a'.repeat(40),
    target_worktree: path.join(root, 'target'), source_worktree: path.join(root, 'source'),
    verifier_worktree: path.join(root, 'verifier', 'execution-human-acceptance-attempt-1'), evidence_store: path.join(root, 'evidence'),
    allowed_files: ['README.md'], execution_mode: 'write-enabled', network_policy: 'network-allowed',
  });
  const outcome = createProviderOutcome({
    network_id: 'network-human-acceptance', event_id: 'event-human-acceptance', plan_id: 'plan-human-acceptance', plan_revision: 3,
    execution_id: plan.execution_id, task_id: 'task-human-acceptance', provider_id: 'agent-1', provider_kind: 'fixture',
    provider_request_id: 'request-human-acceptance', request_digest: digest('1'), response_digest: digest('2'), resource_scope: ['resource:1'],
    observed_at: '2026-08-06T08:00:00.000Z', outcome: 'confirmed-success', side_effects_executed: true,
    evidence: { kind: 'receipt', receipt_id: 'receipt-1', receipt_digest: digest('3') },
  });
  const verification = createProviderOutcomeVerification({
    outcome, verifier_id: 'verifier-1', verification_conditions: ['present'], satisfied_conditions: ['present'], failed_conditions: [],
    evidence_digest: digest('4'), checked_at: '2026-08-06T08:01:00.000Z',
  });
  const handoff = createReviewHandoff({
    verification, dependencies_closed: true, remaining_risks: [],
    external_resource_states: [{ resource_id: 'resource:1', last_known_status: 'updated', responsible_party: 'human-1' }],
    responsible_party: 'human-1', accepted_at: '2026-08-06T08:02:00.000Z',
  });
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const identity = await signer.getPublicIdentity();
  const acceptance = await createHumanAcceptance({ signer, handoff, plan_digest: plan.plan_digest, accepted_at: '2026-08-06T08:03:00.000Z' });
  const sourcePhase = createRealAgentDogfoodGraphPhaseRecord({ plan, network_id: 'network-human-acceptance', phase: 'source_execution', status: 'passed', completed_phases: ['source_execution'], reason: 'provider-completed', actor_kind: 'agent-node', actor_identity: 'agent-1', evidence_digest: digest('a'), evidence_refs: [digest('a')], execution_binding_digest: digest('b'), worker_lease_digest: digest('c') });
  const scopePhase = createRealAgentDogfoodGraphPhaseRecord({ plan, network_id: 'network-human-acceptance', phase: 'scope_observation', status: 'passed', completed_phases: ['source_execution', 'scope_observation'], reason: 'scope-observed', actor_kind: 'coordinator', actor_identity: 'coordinator-1', evidence_digest: digest('d'), evidence_refs: [digest('d')] });
  const verificationPhase = createRealAgentDogfoodGraphPhaseRecord({ plan, network_id: 'network-human-acceptance', phase: 'independent_verification', status: 'passed', completed_phases: ['source_execution', 'scope_observation', 'independent_verification'], reason: 'verification-passed', actor_kind: 'trusted-runner', actor_identity: 'verifier-1', evidence_digest: digest('e'), evidence_refs: [digest('e')] });
  const evidenceStore = await createContentAddressedEvidenceStore({ root: path.join(root, 'evidence') });
  return { root, plan, handoff, identity, acceptance, sourcePhase, scopePhase, verificationPhase, evidenceStore };
}

test('human acceptance adapter validates the signed review handoff and records Graph Evidence', async () => {
  const value = await fixture();
  try {
    const result = await createRealAgentDogfoodGraphHumanAcceptanceAdapter({
      plan: value.plan, network_id: 'network-human-acceptance', plan_id: 'plan-human-acceptance', plan_revision: 3,
      human_id: 'human-1', identity: value.identity, handoff: value.handoff, acceptance: value.acceptance,
      source_phase: value.sourcePhase, scope_phase: value.scopePhase, verification_phase: value.verificationPhase,
      evidence_store: value.evidenceStore,
    })();
    assert.equal(result.status, 'passed');
    assert.equal(result.record.phase, 'human_acceptance');
    assert.equal(result.record.actor_kind, 'human');
    assert.equal(result.record.actor_identity, 'human-1');
    assert.deepEqual(result.record.completed_phases, ['source_execution', 'scope_observation', 'independent_verification', 'human_acceptance']);
    assert.match(result.evidence_digest, /^sha256:[0-9a-f]{64}$/);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});

test('human acceptance adapter blocks an acceptance bound to a different Graph plan', async () => {
  const value = await fixture();
  try {
    const result = await createRealAgentDogfoodGraphHumanAcceptanceAdapter({
      plan: value.plan, network_id: 'network-human-acceptance', plan_id: 'different-plan', plan_revision: 3,
      human_id: 'human-1', identity: value.identity, handoff: value.handoff, acceptance: value.acceptance,
      source_phase: value.sourcePhase, scope_phase: value.scopePhase, verification_phase: value.verificationPhase,
      evidence_store: value.evidenceStore,
    })();
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'human-acceptance-handoff-binding-invalid');
    assert.equal(result.record, undefined);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});

test('human acceptance adapter reports uncertain when acceptance Evidence cannot be written', async () => {
  const value = await fixture();
  try {
    const result = await createRealAgentDogfoodGraphHumanAcceptanceAdapter({
      plan: value.plan, network_id: 'network-human-acceptance', plan_id: 'plan-human-acceptance', plan_revision: 3,
      human_id: 'human-1', identity: value.identity, handoff: value.handoff, acceptance: value.acceptance,
      source_phase: value.sourcePhase, scope_phase: value.scopePhase, verification_phase: value.verificationPhase,
      evidence_store: { put: async () => { throw new Error('evidence unavailable'); } },
    })();
    assert.equal(result.status, 'outcome-uncertain');
    assert.equal(result.reason, 'human-acceptance-evidence-write-failed');
    assert.equal(result.record, undefined);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});
