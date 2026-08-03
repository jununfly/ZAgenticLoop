import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildNativeOpnTracerEvidence, nativeOpnTracerEvidenceDigest } from '../dist/native-opn-tracer.js';
import { recordNativeOpnTracerEvidence } from '../dist/native-opn-tracer-fact.js';
import { createNativeOpnTracerExecution, recordNativeOpnTracerExecution } from '../dist/native-opn-tracer-execution.js';
import { createNativeOpnTracerAggregation, nativeOpnTracerAggregationDigest, recordNativeOpnTracerAggregation } from '../dist/native-opn-tracer-aggregation.js';
import { createNativeOpnTracerVerification, recordNativeOpnTracerVerification } from '../dist/native-opn-tracer-verification.js';
import { createNativeOpnTracerReviewHandoff } from '../dist/review-handoff.js';
import { recordReviewHandoff } from '../dist/review-handoff-fact.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const digest = (digit) => `sha256:${digit.repeat(64)}`;
const validInput = () => ({
  fixture_version: '1-4-7.1',
  network_id: 'network-1',
  event_id: 'event-graph-1',
  plan: { plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('1') },
  center: { responsibility_unit: 'human+agent', human_id: 'human-1' },
  execution_nodes: [
    { node_id: 'agent-1', task_id: 'task-stage-1', execution_id: 'execution-1', status: 'passed', output_evidence_digest: digest('2') },
    { node_id: 'agent-2', task_id: 'task-stage-2', execution_id: 'execution-2', status: 'passed', output_evidence_digest: digest('3') },
  ],
  dependency: { from_task_id: 'task-stage-1', to_task_id: 'task-stage-2', artifact_ref: 'artifact:stage-1-output' },
  resource_isolation: [
    { node_id: 'agent-1', resource_id: 'repo', strategy: 'git-branch-worktree', status: 'verified', isolation_ref: 'branch:agent-1/worktree:one' },
    { node_id: 'agent-2', resource_id: 'repo', strategy: 'git-branch-worktree', status: 'verified', isolation_ref: 'branch:agent-2/worktree:two' },
  ],
  aggregation: { status: 'passed', input_evidence_digests: [digest('2'), digest('3')], output_evidence_digest: digest('4') },
  verification: { status: 'passed', evidence_digest: digest('5') },
  review_handoff: { status: 'accepted', responsible_party: 'human-1' },
  created_at: '2026-07-31T10:00:00.000Z',
});

test('Native OPN Tracer records a two-stage Agent1/Agent2 graph with a Human responsibility center', () => {
  const evidence = buildNativeOpnTracerEvidence(validInput());
  assert.equal(evidence.status, 'passed');
  assert.equal(evidence.center.responsibility_unit, 'human+agent');
  assert.deepEqual(evidence.execution_nodes.map((node) => node.node_id), ['agent-1', 'agent-2']);
  assert.equal(evidence.dependency.from_task_id, 'task-stage-1');
  assert.equal(evidence.dependency.to_task_id, 'task-stage-2');
  assert.equal(evidence.review_handoff.status, 'accepted');
  assert.equal(evidence.side_effects_executed, false);
  assert.match(nativeOpnTracerEvidenceDigest(evidence), /^sha256:[0-9a-f]{64}$/);
});

test('Native OPN Tracer blocks when an execution or its resource isolation is not proven', () => {
  const input = validInput();
  input.execution_nodes[1].status = 'blocked';
  input.resource_isolation[1].status = 'blocked';
  const evidence = buildNativeOpnTracerEvidence(input);
  assert.equal(evidence.status, 'blocked');
  assert.deepEqual(evidence.blocking_reasons, ['execution-blocked', 'resource-isolation-invalid']);
  assert.equal(evidence.side_effects_executed, false);
});

test('Native OPN Tracer Evidence is append-only and idempotent in StateStore', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-native-opn-tracer-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-31T00:00:00.000Z' });
    const evidence = buildNativeOpnTracerEvidence(validInput());
    const first = await recordNativeOpnTracerEvidence({ stateStore, expected_revision: 1, evidence, now: '2026-07-31T10:01:00.000Z' });
    assert.equal(first.status, 'recorded');
    assert.equal(first.side_effects_executed, false);
    const retry = await recordNativeOpnTracerEvidence({ stateStore, expected_revision: 2, evidence, now: '2026-07-31T10:02:00.000Z' });
    assert.equal(retry.status, 'duplicate');
    const events = await stateStore.readEvents({ network_id: 'network-1', after_revision: 1 });
    assert.equal(events.events.length, 1);
    assert.equal(events.events[0].event_type, 'native-opn-tracer.evidence.recorded');
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('Native OPN Tracer records Agent2 only after the bound Agent1 output Evidence exists', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-native-opn-tracer-execution-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-31T00:00:00.000Z' });
    const stage1 = createNativeOpnTracerExecution({ network_id: 'network-1', event_id: 'event-graph-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('1'), node_id: 'agent-1', task_id: 'task-stage-1', execution_id: 'execution-1', assigned_node: 'agent-1', status: 'succeeded', input_evidence_digests: [], output_evidence_digest: digest('2'), recorded_at: '2026-07-31T10:00:00.000Z' });
    const stage2 = createNativeOpnTracerExecution({ network_id: 'network-1', event_id: 'event-graph-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('1'), node_id: 'agent-2', task_id: 'task-stage-2', execution_id: 'execution-2', assigned_node: 'agent-2', status: 'succeeded', input_evidence_digests: [digest('2')], output_evidence_digest: digest('3'), recorded_at: '2026-07-31T10:01:00.000Z' });
    const premature = await recordNativeOpnTracerExecution({ stateStore, expected_revision: 1, execution: stage2, now: '2026-07-31T10:01:00.000Z' });
    assert.equal(premature.status, 'blocked');
    assert.equal(premature.reason, 'dependency-evidence-not-recorded');
    const first = await recordNativeOpnTracerExecution({ stateStore, expected_revision: 1, execution: stage1, now: '2026-07-31T10:00:00.000Z' });
    assert.equal(first.status, 'recorded');
    const second = await recordNativeOpnTracerExecution({ stateStore, expected_revision: 2, execution: stage2, now: '2026-07-31T10:01:00.000Z' });
    assert.equal(second.status, 'recorded');
    const retry = await recordNativeOpnTracerExecution({ stateStore, expected_revision: 3, execution: stage2, now: '2026-07-31T10:02:00.000Z' });
    assert.equal(retry.status, 'duplicate');
    assert.equal((await stateStore.readEvents({ network_id: 'network-1', after_revision: 1 })).events.length, 2);
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('Native OPN Tracer Aggregation requires both successful executions and preserves one winner', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-native-opn-tracer-aggregation-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-31T00:00:00.000Z' });
    const stage1 = createNativeOpnTracerExecution({ network_id: 'network-1', event_id: 'event-graph-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('1'), node_id: 'agent-1', task_id: 'task-stage-1', execution_id: 'execution-1', assigned_node: 'agent-1', status: 'succeeded', input_evidence_digests: [], output_evidence_digest: digest('2'), recorded_at: '2026-07-31T10:00:00.000Z' });
    const stage2 = createNativeOpnTracerExecution({ network_id: 'network-1', event_id: 'event-graph-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('1'), node_id: 'agent-2', task_id: 'task-stage-2', execution_id: 'execution-2', assigned_node: 'agent-2', status: 'succeeded', input_evidence_digests: [digest('2')], output_evidence_digest: digest('3'), recorded_at: '2026-07-31T10:01:00.000Z' });
    await recordNativeOpnTracerExecution({ stateStore, expected_revision: 1, execution: stage1, now: stage1.recorded_at });
    await recordNativeOpnTracerExecution({ stateStore, expected_revision: 2, execution: stage2, now: stage2.recorded_at });
    const aggregation = createNativeOpnTracerAggregation({ network_id: 'network-1', event_id: 'event-graph-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('1'), aggregation_id: 'aggregation-1', execution_ids: ['execution-1', 'execution-2'], input_evidence_digests: [digest('2'), digest('3')], output_evidence_digest: digest('4'), aggregated_at: '2026-07-31T10:02:00.000Z' });
    const first = await recordNativeOpnTracerAggregation({ stateStore, expected_revision: 3, aggregation, now: aggregation.aggregated_at });
    assert.equal(first.status, 'recorded');
    assert.equal(first.side_effects_executed, false);
    const retry = await recordNativeOpnTracerAggregation({ stateStore, expected_revision: 4, aggregation, now: '2026-07-31T10:03:00.000Z' });
    assert.equal(retry.status, 'duplicate');
    const events = await stateStore.readEvents({ network_id: 'network-1', after_revision: 3 });
    assert.equal(events.events.length, 1);
    assert.equal(events.events[0].event_type, 'native-opn-tracer.aggregation.recorded');
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('Native OPN Tracer Aggregation validates the Graph responsibility and isolation projection', () => {
  const aggregation = createNativeOpnTracerAggregation({
    network_id: 'network-1', event_id: 'event-graph-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('1'),
    aggregation_id: 'aggregation-graph-1', execution_ids: ['execution-1', 'execution-2'], input_evidence_digests: [digest('2'), digest('3')],
    output_evidence_digest: digest('4'), aggregated_at: '2026-07-31T10:02:00.000Z',
    graph: {
      responsibility_unit: 'human+agent', human_id: 'human-1', lifecycle_status: 'review-pending',
      execution_bindings: [
        { execution_id: 'execution-1', node_id: 'agent-1', task_id: 'task-stage-1', commit_sha: 'a'.repeat(40), worktree_ref: 'worktree:agent-1' },
        { execution_id: 'execution-2', node_id: 'agent-2', task_id: 'task-stage-2', commit_sha: 'a'.repeat(40), worktree_ref: 'worktree:agent-2' },
      ],
      resource_isolation: [
        { node_id: 'agent-1', resource_id: 'repo', strategy: 'git-branch-worktree', isolation_ref: 'worktree:agent-1' },
        { node_id: 'agent-2', resource_id: 'repo', strategy: 'git-branch-worktree-read-only', isolation_ref: 'worktree:agent-2' },
      ],
    },
  });
  assert.equal(aggregation.graph.lifecycle_status, 'review-pending');
  assert.equal(aggregation.graph.execution_bindings[1].commit_sha, 'a'.repeat(40));
  assert.match(nativeOpnTracerAggregationDigest(aggregation), /^sha256:[0-9a-f]{64}$/);
  assert.throws(() => createNativeOpnTracerAggregation({
    ...aggregation,
    graph: { ...aggregation.graph, resource_isolation: aggregation.graph.resource_isolation.slice(0, 1) },
  }), /native-opn-tracer-aggregation-graph-invalid/);
});

test('Native OPN Tracer Verification consumes persisted Aggregation and rejects self-verification', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-native-opn-tracer-verification-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-31T00:00:00.000Z' });
    const stage1 = createNativeOpnTracerExecution({ network_id: 'network-1', event_id: 'event-graph-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('1'), node_id: 'agent-1', task_id: 'task-stage-1', execution_id: 'execution-1', assigned_node: 'agent-1', status: 'succeeded', input_evidence_digests: [], output_evidence_digest: digest('2'), recorded_at: '2026-07-31T10:00:00.000Z' });
    const stage2 = createNativeOpnTracerExecution({ network_id: 'network-1', event_id: 'event-graph-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('1'), node_id: 'agent-2', task_id: 'task-stage-2', execution_id: 'execution-2', assigned_node: 'agent-2', status: 'succeeded', input_evidence_digests: [digest('2')], output_evidence_digest: digest('3'), recorded_at: '2026-07-31T10:01:00.000Z' });
    await recordNativeOpnTracerExecution({ stateStore, expected_revision: 1, execution: stage1, now: stage1.recorded_at });
    await recordNativeOpnTracerExecution({ stateStore, expected_revision: 2, execution: stage2, now: stage2.recorded_at });
    const aggregation = createNativeOpnTracerAggregation({ network_id: 'network-1', event_id: 'event-graph-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('1'), aggregation_id: 'aggregation-1', execution_ids: ['execution-1', 'execution-2'], input_evidence_digests: [digest('2'), digest('3')], output_evidence_digest: digest('4'), aggregated_at: '2026-07-31T10:02:00.000Z' });
    await recordNativeOpnTracerAggregation({ stateStore, expected_revision: 3, aggregation, now: aggregation.aggregated_at });
    const verification = createNativeOpnTracerVerification({ network_id: 'network-1', event_id: 'event-graph-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('1'), aggregation_id: aggregation.aggregation_id, aggregation_digest: aggregation.aggregation_digest, verifier_id: 'verifier-1', excluded_node_ids: ['agent-1', 'agent-2', 'aggregation-1'], status: 'passed', conditions: ['combined-output-valid'], satisfied_conditions: ['combined-output-valid'], failed_conditions: [], evidence_digest: digest('5'), checked_at: '2026-07-31T10:03:00.000Z' });
    const result = await recordNativeOpnTracerVerification({ stateStore, expected_revision: 4, verification, now: verification.checked_at });
    assert.equal(result.status, 'recorded');
    assert.equal(result.side_effects_executed, false);
    const retry = await recordNativeOpnTracerVerification({ stateStore, expected_revision: 5, verification, now: '2026-07-31T10:04:00.000Z' });
    assert.equal(retry.status, 'duplicate');
    assert.throws(() => createNativeOpnTracerVerification({ ...verification, verifier_id: 'agent-1' }), /native-opn-tracer-verifier-invalid/);
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('Native OPN Tracer Verification requires an independent Graph verifier input binding', () => {
  const verification = createNativeOpnTracerVerification({
    network_id: 'network-1', event_id: 'event-graph-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('1'),
    aggregation_id: 'aggregation-1', aggregation_digest: digest('4'), verifier_id: 'verifier-1', excluded_node_ids: ['agent-1', 'agent-2', 'aggregation-1'],
    status: 'passed', conditions: ['combined-output-valid'], satisfied_conditions: ['combined-output-valid'], failed_conditions: [], evidence_digest: digest('5'), checked_at: '2026-07-31T10:03:00.000Z',
    graph: {
      verifier_execution_id: 'verifier-execution-1', source_commit_sha: 'a'.repeat(40), source_execution_ids: ['execution-1', 'execution-2'],
      verifier_worktree_ref: 'worktree:agent-2-verifier',
    },
  });
  assert.equal(verification.graph.source_commit_sha, 'a'.repeat(40));
  assert.throws(() => createNativeOpnTracerVerification({
    ...verification,
    graph: { ...verification.graph, source_execution_ids: ['execution-1', 'execution-1'] },
  }), /native-opn-tracer-verifier-graph-invalid/);
});

test('Native OPN Tracer Verification rejects a verifier input bound to an unverified source commit', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-native-opn-tracer-verifier-binding-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-31T00:00:00.000Z' });
    const stage1 = createNativeOpnTracerExecution({ network_id: 'network-1', event_id: 'event-graph-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('1'), node_id: 'agent-1', task_id: 'task-stage-1', execution_id: 'execution-1', assigned_node: 'agent-1', status: 'succeeded', input_evidence_digests: [], output_evidence_digest: digest('2'), recorded_at: '2026-07-31T10:00:00.000Z' });
    const stage2 = createNativeOpnTracerExecution({ network_id: 'network-1', event_id: 'event-graph-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('1'), node_id: 'agent-2', task_id: 'task-stage-2', execution_id: 'execution-2', assigned_node: 'agent-2', status: 'succeeded', input_evidence_digests: [digest('2')], output_evidence_digest: digest('3'), recorded_at: '2026-07-31T10:01:00.000Z' });
    await recordNativeOpnTracerExecution({ stateStore, expected_revision: 1, execution: stage1, now: stage1.recorded_at });
    await recordNativeOpnTracerExecution({ stateStore, expected_revision: 2, execution: stage2, now: stage2.recorded_at });
    const aggregation = createNativeOpnTracerAggregation({
      network_id: 'network-1', event_id: 'event-graph-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('1'), aggregation_id: 'aggregation-1', execution_ids: ['execution-1', 'execution-2'], input_evidence_digests: [digest('2'), digest('3')], output_evidence_digest: digest('4'), aggregated_at: '2026-07-31T10:02:00.000Z',
      graph: { responsibility_unit: 'human+agent', human_id: 'human-1', lifecycle_status: 'review-pending', execution_bindings: [{ execution_id: 'execution-1', node_id: 'agent-1', task_id: 'task-stage-1', commit_sha: 'a'.repeat(40), worktree_ref: 'worktree:agent-1' }, { execution_id: 'execution-2', node_id: 'agent-2', task_id: 'task-stage-2', commit_sha: 'a'.repeat(40), worktree_ref: 'worktree:agent-2-verifier' }], resource_isolation: [{ node_id: 'agent-1', resource_id: 'repo', strategy: 'git-branch-worktree', isolation_ref: 'worktree:agent-1' }, { node_id: 'agent-2', resource_id: 'repo', strategy: 'git-branch-worktree-read-only', isolation_ref: 'worktree:agent-2-verifier' }] },
    });
    await recordNativeOpnTracerAggregation({ stateStore, expected_revision: 3, aggregation, now: aggregation.aggregated_at });
    const verification = createNativeOpnTracerVerification({ network_id: 'network-1', event_id: 'event-graph-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('1'), aggregation_id: aggregation.aggregation_id, aggregation_digest: aggregation.aggregation_digest, verifier_id: 'verifier-1', excluded_node_ids: ['agent-1', 'agent-2', 'aggregation-1'], status: 'passed', conditions: ['combined-output-valid'], satisfied_conditions: ['combined-output-valid'], failed_conditions: [], evidence_digest: digest('5'), checked_at: '2026-07-31T10:03:00.000Z', graph: { verifier_execution_id: 'verifier-execution-1', source_commit_sha: 'b'.repeat(40), source_execution_ids: ['execution-1', 'execution-2'], verifier_worktree_ref: 'worktree:agent-2-verifier' } });
    const result = await recordNativeOpnTracerVerification({ stateStore, expected_revision: 4, verification, now: verification.checked_at });
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'verification-graph-binding-mismatch');
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('Native OPN Graph Verification enters the shared Review Handoff boundary', async () => {
  const verification = createNativeOpnTracerVerification({ network_id: 'network-1', event_id: 'event-graph-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('1'), aggregation_id: 'aggregation-1', aggregation_digest: digest('4'), verifier_id: 'verifier-1', excluded_node_ids: ['agent-1', 'agent-2', 'aggregation-1'], status: 'passed', conditions: ['combined-output-valid'], satisfied_conditions: ['combined-output-valid'], failed_conditions: [], evidence_digest: digest('5'), checked_at: '2026-07-31T10:03:00.000Z' });
  const handoff = createNativeOpnTracerReviewHandoff({ verification, dependencies_closed: true, remaining_risks: [], external_resource_states: [{ resource_id: 'repo', last_known_status: 'merged-in-fixture', responsible_party: 'human-1' }], responsible_party: 'human-1', accepted_at: '2026-07-31T10:04:00.000Z' });
  assert.equal(handoff.status, 'accepted');
  assert.equal(handoff.verification_source, 'native-opn-graph');
  assert.equal(handoff.aggregation_digest, digest('4'));
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-native-opn-tracer-handoff-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-31T00:00:00.000Z' });
    const recorded = await recordReviewHandoff({ stateStore, expected_revision: 1, handoff, now: handoff.accepted_at });
    assert.equal(recorded.status, 'recorded');
    assert.equal((await stateStore.readEvents({ network_id: 'network-1', after_revision: 1 })).events[0].event_type, 'review-handoff.accepted');
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});
