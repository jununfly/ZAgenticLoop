import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createOpnArtifactStore } from '../dist/opn-artifact-store.js';
import { createOpnReadOnlyGraphAtomPlan, runOpnReadOnlyGraphAtom, startOpnReadOnlyGraphAtom, completeOpnReadOnlyGraphAtom } from '../dist/opn-readonly-graph-atom.js';
import { projectOpnReadOnlyGraphUiReadModel } from '../dist/opn-readonly-graph-ui-read-model.js';

const digest = (digit) => `sha256:${digit.repeat(64)}`;
const planInput = { graph_id: 'graph-ui', network_id: 'network-ui', plan_id: 'plan-ui', plan_revision: 1, task_id: 'task-ui', goal: 'Review the current OPN Graph implementation.', snapshot_digest: digest('a'), coordinator_id: 'Coordinator', human_id: 'human-1', source_node_id: 'Agent1', verifier_node_id: 'Agent2' };
function channel() { return { async openSession() { return { session_id: 'session-1' }; }, async send({ envelope }) { return { status: 'accepted', message_id: envelope.message_id, envelope_digest: envelope.envelope_digest, side_effects_executed: false }; }, async closeSession() {} }; }

test('Windows read-only projection shows waiting for Agent2 and final Human decision without mutation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-readonly-ui-'));
  try {
    const artifactStore = createOpnArtifactStore({ root });
    const plan = createOpnReadOnlyGraphAtomPlan(planInput);
    const pending = await startOpnReadOnlyGraphAtom({ plan, artifact_store: artifactStore, transport: channel(), source: async () => ({ status: 'passed', findings: 'source findings' }) });
    const pendingModel = projectOpnReadOnlyGraphUiReadModel({ graph_id: plan.graph_id, network_id: plan.network_id, result: pending });
    assert.equal(pendingModel.status, 'awaiting-verification');
    assert.equal(pendingModel.next_action.kind, 'wait-agent2');
    assert.equal(pendingModel.side_effects_executed, false);

    const completed = await completeOpnReadOnlyGraphAtom({ plan, artifact_store: artifactStore, source_evidence_ref: pending.source_evidence_ref, verification: { status: 'passed', findings: 'verified', input_artifact_refs: [pending.source_evidence_ref] }, human_decision: async () => ({ decision: 'approved', reason: 'accepted', human_id: 'human-1' }) });
    const finalModel = projectOpnReadOnlyGraphUiReadModel({ graph_id: plan.graph_id, network_id: plan.network_id, result: completed });
    assert.equal(finalModel.status, 'approved');
    assert.equal(finalModel.next_action.kind, 'done');
    assert.equal(finalModel.decision.decision, 'approved');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Windows read-only projection rejects a tampered Human handoff', () => {
  assert.throws(() => projectOpnReadOnlyGraphUiReadModel({ graph_id: 'graph-ui', network_id: 'network-ui', result: { schema: 'zj-loop.opn_read_only_graph_atom.v1', status: 'blocked', plan_digest: digest('a'), phases: [], review_handoff: { schema: 'zj-loop.opn_read_only_graph_review_handoff.v1', status: 'approved', graph_id: 'graph-ui', network_id: 'network-ui', plan_digest: digest('a'), source_evidence_ref: digest('b'), verification_evidence_ref: digest('c'), source_node_id: 'Agent1', verifier_node_id: 'Agent2', decision: { decision: 'approved', reason: 'tampered', human_id: 'human-1' }, handoff_digest: digest('d') }, side_effects_executed: false } }), /opn-read-only-graph-ui-handoff-invalid/);
});
