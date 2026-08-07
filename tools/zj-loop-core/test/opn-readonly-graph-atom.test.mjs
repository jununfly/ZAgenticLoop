import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createOpnArtifactStore } from '../dist/opn-artifact-store.js';
import { completeOpnReadOnlyGraphAtom, completeOpnReadOnlyGraphAtomFromVerificationResult, createOpnReadOnlyGraphAtomPlan, runOpnReadOnlyGraphAtom, startOpnReadOnlyGraphAtom, validateOpnReadOnlyGraphAtomReviewHandoff } from '../dist/opn-readonly-graph-atom.js';
import { createOpnReadOnlyGraphVerificationResult } from '../dist/opn-readonly-graph-verification.js';
import { createLocalOpnTransportAdapter } from '../dist/opn-center-transport.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';

function digest(letter) {
  return `sha256:${letter.repeat(64)}`;
}

function transport() {
  const sent = [];
  return {
    sent,
    async openSession() { return { session_id: 'session-1' }; },
    async send(input) {
      sent.push(input.envelope);
      return { status: 'accepted', message_id: input.envelope.message_id, envelope_digest: input.envelope.envelope_digest, side_effects_executed: false };
    },
    async closeSession() {},
  };
}

test('read-only Graph Atom binds Agent1 evidence before routing Agent2 verification and Human review', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-readonly-graph-'));
  try {
    const artifactStore = createOpnArtifactStore({ root });
    const channel = transport();
    const plan = createOpnReadOnlyGraphAtomPlan({
      graph_id: 'graph-dogfood-1',
      network_id: 'opn-dogfood-20260806',
      plan_id: 'opn-readonly-graph',
      plan_revision: 1,
      task_id: 'task-dogfood-1',
      goal: 'Review the current OPN Graph implementation.',
      snapshot_digest: digest('a'),
      coordinator_id: 'endpoint:opn-dogfood-20260806',
      human_id: 'human-1',
      source_node_id: 'Agent1',
      verifier_node_id: 'Agent2',
    });

    const result = await runOpnReadOnlyGraphAtom({
      plan,
      artifact_store: artifactStore,
      transport: channel,
      source: async () => ({ status: 'passed', findings: 'source findings' }),
      verification: async ({ input_artifact_refs }) => ({ status: 'passed', findings: `verified ${input_artifact_refs.join(',')}` }),
      human_decision: async (handoff) => {
        assert.equal(handoff.status, 'pending');
        return { decision: 'approved', reason: 'reviewed', human_id: 'human-1' };
      },
    });

    assert.equal(result.status, 'passed');
    assert.equal(result.side_effects_executed, false);
    assert.equal(channel.sent.length, 1);
    assert.equal(channel.sent[0].from_node_id, 'endpoint:opn-dogfood-20260806');
    assert.equal(channel.sent[0].target_node_id, 'Agent2');
    assert.equal(channel.sent[0].notification_kind, 'graph.verification.request');
    assert.equal(channel.sent[0].artifact_refs.length, 1);
    assert.match(channel.sent[0].artifact_refs[0].artifact_id, /^sha256:[0-9a-f]{64}$/);
    assert.equal(result.review_handoff.decision.decision, 'approved');
    assert.deepEqual(validateOpnReadOnlyGraphAtomReviewHandoff(result.review_handoff), { status: 'valid' });
    assert.equal(result.phases.map((phase) => phase.phase).join(','), 'source_execution,independent_verification,human_review');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('read-only Graph Atom fails closed when Agent1 cannot produce a bounded result', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-readonly-graph-blocked-'));
  try {
    const artifactStore = createOpnArtifactStore({ root });
    let routed = false;
    const result = await runOpnReadOnlyGraphAtom({
      plan: createOpnReadOnlyGraphAtomPlan({
        graph_id: 'graph-dogfood-blocked', network_id: 'network-1', plan_id: 'plan-1', plan_revision: 1,
        task_id: 'task-blocked', goal: 'Review the current OPN Graph implementation.', snapshot_digest: digest('b'),
        coordinator_id: 'Coordinator', human_id: 'human-1', source_node_id: 'Agent1', verifier_node_id: 'Agent2',
      }),
      artifact_store: artifactStore,
      transport: {
        async openSession() { routed = true; return { session_id: 'session-1' }; },
        async send() { routed = true; return { status: 'accepted', message_id: 'message-1', envelope_digest: digest('c'), side_effects_executed: false }; },
        async closeSession() {},
      },
      source: async () => ({ status: 'outcome-uncertain', reason: 'provider-runtime-unavailable' }),
      verification: async () => ({ status: 'passed', findings: 'must not run' }),
      human_decision: async () => ({ decision: 'approved', reason: 'must not run', human_id: 'human-1' }),
    });
    assert.equal(result.status, 'outcome-uncertain');
    assert.equal(result.reason, 'provider-runtime-unavailable');
    assert.equal(routed, false);
    assert.equal(result.side_effects_executed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('read-only Graph Atom exposes a pending state between Mac routing and Windows verification', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-readonly-graph-pending-'));
  try {
    const artifactStore = createOpnArtifactStore({ root });
    const channel = transport();
    const plan = createOpnReadOnlyGraphAtomPlan({
      graph_id: 'graph-pending', network_id: 'network-pending', plan_id: 'plan-pending', plan_revision: 1,
      task_id: 'task-pending', goal: 'Review the current OPN Graph implementation.', snapshot_digest: digest('e'),
      coordinator_id: 'Coordinator', human_id: 'human-1', source_node_id: 'Agent1', verifier_node_id: 'Agent2',
    });
    const started = await startOpnReadOnlyGraphAtom({ plan, artifact_store: artifactStore, transport: channel, source: async () => ({ status: 'passed', findings: 'source findings' }) });
    assert.equal(started.status, 'awaiting-verification');
    assert.equal(started.verification_request.target_node_id, 'Agent2');
    const completed = await completeOpnReadOnlyGraphAtom({
      plan, artifact_store: artifactStore, source_evidence_ref: started.source_evidence_ref,
      verification: { status: 'passed', findings: 'independent findings', input_artifact_refs: [started.source_evidence_ref] },
      human_decision: async () => ({ decision: 'approved', reason: 'reviewed', human_id: 'human-1' }),
    });
    assert.equal(completed.status, 'passed');
    assert.equal(completed.review_handoff.decision.decision, 'approved');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('read-only Graph Atom accepts a valid remote verification result and reaches Human review', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-readonly-graph-remote-result-'));
  try {
    const artifactStore = createOpnArtifactStore({ root });
    const plan = createOpnReadOnlyGraphAtomPlan({
      graph_id: 'graph-remote-result', network_id: 'network-remote-result', plan_id: 'plan-remote-result', plan_revision: 1,
      task_id: 'task-remote-result', goal: 'Review the current OPN Graph implementation.', snapshot_digest: digest('a'),
      coordinator_id: 'Coordinator', human_id: 'human-1', source_node_id: 'Agent1', verifier_node_id: 'Agent2',
    });
    const sourceEvidence = digest('b');
    const verificationResult = createOpnReadOnlyGraphVerificationResult({
      graph_id: plan.graph_id, network_id: plan.network_id, plan_id: plan.plan_id, plan_revision: plan.plan_revision,
      task_id: plan.task_id, plan_digest: plan.plan_digest, source_evidence_ref: sourceEvidence,
      verification_evidence_ref: digest('c'), verifier_node_id: plan.verifier_node_id, status: 'passed',
    });
    const result = await completeOpnReadOnlyGraphAtomFromVerificationResult({
      plan, artifact_store: artifactStore, source_evidence_ref: sourceEvidence, verification_result: verificationResult,
      human_decision: async (handoff) => {
        assert.equal(handoff.status, 'pending');
        assert.equal(handoff.verification_evidence_ref, digest('c'));
        return { decision: 'approved', reason: 'reviewed remote evidence', human_id: 'human-1' };
      },
    });
    assert.equal(result.status, 'passed');
    assert.equal(result.review_handoff.decision.decision, 'approved');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('read-only Graph Atom blocks a remote verification result with scope drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-readonly-graph-remote-drift-'));
  try {
    const plan = createOpnReadOnlyGraphAtomPlan({
      graph_id: 'graph-remote-drift', network_id: 'network-remote-drift', plan_id: 'plan-remote-drift', plan_revision: 1,
      task_id: 'task-remote-drift', goal: 'Review the current OPN Graph implementation.', snapshot_digest: digest('d'),
      coordinator_id: 'Coordinator', human_id: 'human-1', source_node_id: 'Agent1', verifier_node_id: 'Agent2',
    });
    const sourceEvidence = digest('e');
    const verificationResult = createOpnReadOnlyGraphVerificationResult({
      graph_id: plan.graph_id, network_id: plan.network_id, plan_id: plan.plan_id, plan_revision: plan.plan_revision,
      task_id: plan.task_id, plan_digest: plan.plan_digest, source_evidence_ref: digest('f'),
      verification_evidence_ref: digest('a'), verifier_node_id: plan.verifier_node_id, status: 'passed',
    });
    const result = await completeOpnReadOnlyGraphAtomFromVerificationResult({
      plan, artifact_store: createOpnArtifactStore({ root }), source_evidence_ref: sourceEvidence, verification_result: verificationResult,
      human_decision: async () => ({ decision: 'approved', reason: 'must not review drift', human_id: 'human-1' }),
    });
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'verification-result-scope-mismatch');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('read-only Graph Atom maps an uncertain OPN route to outcome-uncertain without Human review', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-readonly-graph-route-uncertain-'));
  try {
    const plan = createOpnReadOnlyGraphAtomPlan({ ...planInputForRouteUncertain(), snapshot_digest: digest('f') });
    const result = await runOpnReadOnlyGraphAtom({
      plan,
      artifact_store: createOpnArtifactStore({ root }),
      transport: { async openSession() { throw new Error('socket-closed'); }, async send() { throw new Error('must not run'); }, async closeSession() {} },
      source: async () => ({ status: 'passed', findings: 'source findings' }),
      verification: async () => ({ status: 'passed', findings: 'must not run' }),
      human_decision: async () => ({ decision: 'approved', reason: 'must not run', human_id: 'human-1' }),
    });
    assert.equal(result.status, 'outcome-uncertain');
    assert.equal(result.reason, 'verification-task-route-outcome-uncertain');
  } finally { await rm(root, { recursive: true, force: true }); }
});

function planInputForRouteUncertain() {
  return { graph_id: 'graph-route-uncertain', network_id: 'network-route-uncertain', plan_id: 'plan-route-uncertain', plan_revision: 1, task_id: 'task-route-uncertain', goal: 'Review the current OPN Graph implementation.', coordinator_id: 'Coordinator', human_id: 'human-1', source_node_id: 'Agent1', verifier_node_id: 'Agent2' };
}

test('read-only Graph Atom sends the verification request into OPN StateStore facts readable and acknowledgeable by Agent2', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-readonly-graph-transport-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-transport', owner_id: 'human-1' });
    const artifactStore = createOpnArtifactStore({ root: path.join(root, 'artifacts') });
    const center = createLocalOpnTransportAdapter({ stateStore, network_id: 'network-transport', node_id: 'Coordinator' });
    const agent2 = createLocalOpnTransportAdapter({ stateStore, network_id: 'network-transport', node_id: 'Agent2' });
    const plan = createOpnReadOnlyGraphAtomPlan({
      graph_id: 'graph-transport', network_id: 'network-transport', plan_id: 'plan-transport', plan_revision: 1,
      task_id: 'task-transport', goal: 'Review the current OPN Graph implementation.', snapshot_digest: digest('d'),
      coordinator_id: 'Coordinator', human_id: 'human-1', source_node_id: 'Agent1', verifier_node_id: 'Agent2',
    });
    const result = await runOpnReadOnlyGraphAtom({
      plan, artifact_store: artifactStore, transport: center,
      source: async () => ({ status: 'passed', findings: 'source findings' }),
      verification: async ({ input_artifact_refs }) => ({ status: 'passed', findings: input_artifact_refs[0] }),
      human_decision: async () => ({ decision: 'approved', reason: 'reviewed', human_id: 'human-1' }),
    });
    assert.equal(result.status, 'passed');
    const session = await agent2.openSession({ network_id: 'network-transport', node_id: 'Agent2' });
    const envelope = await agent2.receive({ session_id: session.session_id });
    assert.equal(envelope?.notification_kind, 'graph.verification.request');
    assert.equal(envelope?.target_node_id, 'Agent2');
    assert.deepEqual(await agent2.acknowledge({ session_id: session.session_id, message_id: envelope.message_id, envelope_digest: envelope.envelope_digest }), {
      status: 'accepted', message_id: envelope.message_id, envelope_digest: envelope.envelope_digest, side_effects_executed: false,
    });
    await agent2.closeSession({ session_id: session.session_id });
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});
