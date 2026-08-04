import assert from 'node:assert/strict';
import { test } from 'node:test';
import { executeNativeOpnGraphMerge, evaluateNativeOpnGraphMergeAdmission, evaluateNativeOpnGraphPostMergeGate, nativeOpnTracerMergeAuthorizationDigest } from '../dist/native-opn-graph-merge.js';

const digest = (value) => `sha256:${value.repeat(64)}`;
const authorization = {
  source_commit_sha: 'a'.repeat(40),
  target_ref: 'refs/heads/main',
  target_worktree_ref: 'worktree:graph-merge-target',
  strategy: 'fast-forward-only',
  scope_digest: digest('1'),
  deterministic_gate_digest: digest('2'),
};

test('provider-neutral Graph merge admission accepts only the Human-approved exact source and target', () => {
  const result = evaluateNativeOpnGraphMergeAdmission({
    authorization,
    human_acceptance: { decision: 'accepted', merge_authorization_digest: nativeOpnTracerMergeAuthorizationDigest(authorization) },
    observed: { target_ref: 'refs/heads/main', target_worktree_ref: 'worktree:graph-merge-target', target_head: 'b'.repeat(40), source_commit_reachable: true, fast_forward_possible: true, target_clean: true, scope_digest: digest('1') },
  });
  assert.deepEqual(result, { status: 'ready', side_effects_executed: false });
});

test('provider-neutral Graph merge admission blocks target ref drift before side effects', () => {
  const result = evaluateNativeOpnGraphMergeAdmission({
    authorization,
    human_acceptance: { decision: 'accepted', merge_authorization_digest: nativeOpnTracerMergeAuthorizationDigest(authorization) },
    observed: { target_ref: 'refs/heads/release', target_worktree_ref: 'worktree:graph-merge-target', target_head: 'b'.repeat(40), source_commit_reachable: true, fast_forward_possible: true, target_clean: true, scope_digest: digest('1') },
  });
  assert.deepEqual(result, { status: 'blocked', side_effects_executed: false, reason: 'target-ref-mismatch' });
});

test('provider-neutral Graph merge admission stops with outcome-uncertain when adapter facts are incomplete', () => {
  const result = evaluateNativeOpnGraphMergeAdmission({
    authorization,
    human_acceptance: { decision: 'accepted', merge_authorization_digest: nativeOpnTracerMergeAuthorizationDigest(authorization) },
    observed: { target_ref: 'refs/heads/main', target_worktree_ref: 'worktree:graph-merge-target', target_head: 'b'.repeat(40), source_commit_reachable: true, target_clean: true, scope_digest: digest('1') },
  });
  assert.deepEqual(result, { status: 'outcome-uncertain', side_effects_executed: false, reason: 'merge-observation-uncertain' });
});

test('provider-neutral Graph merge admission blocks a target worktree identity mismatch', () => {
  const result = evaluateNativeOpnGraphMergeAdmission({
    authorization,
    human_acceptance: { decision: 'accepted', merge_authorization_digest: nativeOpnTracerMergeAuthorizationDigest(authorization) },
    observed: { target_ref: 'refs/heads/main', target_worktree_ref: 'worktree:other-target', target_head: 'b'.repeat(40), source_commit_reachable: true, fast_forward_possible: true, target_clean: true, scope_digest: digest('1') },
  });
  assert.deepEqual(result, { status: 'blocked', side_effects_executed: false, reason: 'target-worktree-ref-mismatch' });
});

test('provider-neutral Graph merge admission treats a missing target worktree identity as uncertain', () => {
  const result = evaluateNativeOpnGraphMergeAdmission({
    authorization,
    human_acceptance: { decision: 'accepted', merge_authorization_digest: nativeOpnTracerMergeAuthorizationDigest(authorization) },
    observed: { target_ref: 'refs/heads/main', target_head: 'b'.repeat(40), source_commit_reachable: true, fast_forward_possible: true, target_clean: true, scope_digest: digest('1') },
  });
  assert.deepEqual(result, { status: 'outcome-uncertain', side_effects_executed: false, reason: 'merge-observation-uncertain' });
});

test('provider-neutral Graph merge execution observes before admission and binds execute to the observed target head', async () => {
  const calls = [];
  const result = await executeNativeOpnGraphMerge({
    authorization,
    human_acceptance: { decision: 'accepted', merge_authorization_digest: nativeOpnTracerMergeAuthorizationDigest(authorization) },
    adapter: {
      async observe() {
        calls.push('observe');
        return { target_ref: 'refs/heads/main', target_worktree_ref: 'worktree:graph-merge-target', target_head: 'b'.repeat(40), source_commit_reachable: true, fast_forward_possible: true, target_clean: true, scope_digest: digest('1') };
      },
      async execute(input) {
        calls.push(`execute:${input.expected_target_head}`);
        return { status: 'merged', target_head: 'c'.repeat(40), side_effects_executed: true };
      },
    },
  });
  assert.deepEqual(calls, ['observe', `execute:${'b'.repeat(40)}`]);
  assert.deepEqual(result, { status: 'merged', target_head: 'c'.repeat(40), side_effects_executed: true });
});

test('provider-neutral Graph merge execution never calls adapter execute after blocked admission', async () => {
  let executeCalls = 0;
  const result = await executeNativeOpnGraphMerge({
    authorization,
    human_acceptance: { decision: 'accepted', merge_authorization_digest: nativeOpnTracerMergeAuthorizationDigest(authorization) },
    adapter: {
      async observe() { return { target_ref: 'refs/heads/release', target_worktree_ref: 'worktree:graph-merge-target', target_head: 'b'.repeat(40), source_commit_reachable: true, fast_forward_possible: true, target_clean: true, scope_digest: digest('1') }; },
      async execute() { executeCalls += 1; return { status: 'merged', side_effects_executed: true }; },
    },
  });
  assert.equal(executeCalls, 0);
  assert.deepEqual(result, { status: 'blocked', side_effects_executed: false, reason: 'target-ref-mismatch' });
});

test('provider-neutral Graph post-merge gate passes only when target equals the verified source and deterministic checks pass', () => {
  const result = evaluateNativeOpnGraphPostMergeGate({
    authorization,
    observed: { target_ref: 'refs/heads/main', target_head: authorization.source_commit_sha, source_commit_sha: authorization.source_commit_sha, fast_forward_confirmed: true, target_clean: true, scope_digest: digest('1'), diff_check_passed: true, project_verification: 'passed' },
  });
  assert.deepEqual(result, { status: 'passed', side_effects_executed: false });
});

test('provider-neutral Graph post-merge gate blocks target/source drift', () => {
  const result = evaluateNativeOpnGraphPostMergeGate({
    authorization,
    observed: { target_ref: 'refs/heads/main', target_head: 'c'.repeat(40), source_commit_sha: authorization.source_commit_sha, fast_forward_confirmed: true, target_clean: true, scope_digest: digest('1'), diff_check_passed: true, project_verification: 'passed' },
  });
  assert.deepEqual(result, { status: 'blocked', side_effects_executed: false, reason: 'target-source-binding-mismatch' });
});

test('provider-neutral Graph post-merge gate marks unknown project verification as outcome-uncertain', () => {
  const result = evaluateNativeOpnGraphPostMergeGate({
    authorization,
    observed: { target_ref: 'refs/heads/main', target_head: authorization.source_commit_sha, source_commit_sha: authorization.source_commit_sha, fast_forward_confirmed: true, target_clean: true, scope_digest: digest('1'), diff_check_passed: true, project_verification: 'unknown' },
  });
  assert.deepEqual(result, { status: 'outcome-uncertain', side_effects_executed: false, reason: 'post-merge-observation-uncertain' });
});
