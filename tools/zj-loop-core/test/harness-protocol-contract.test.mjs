import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  renderLoopProtocolOutputMarkdown,
  recordLoopRunMetrics,
  runHarnessProtocolCli,
  validateLoopProtocolInput,
  validateLoopProtocolOutput,
} from '../dist/index.js';

test('loop protocol input accepts explicit envelopes and rejects natural language commands', () => {
  const valid = validateLoopProtocolInput({
    schema: 'zj-loop.harness_input.v1',
    schema_version: 1,
    envelope_type: 'slash_command',
    intent: 'run_route',
    source: { kind: 'codex-conversation', id: 'thread-1' },
    payload: { route_id: 'roadmap-sliced-development', target: 'github-issue:123' },
  });

  assert.equal(valid.ok, true);
  assert.deepEqual(valid.errors, []);

  const naturalLanguage = validateLoopProtocolInput('start route for issue 123');

  assert.equal(naturalLanguage.ok, false);
  assert.match(naturalLanguage.errors.join('\n'), /protocol input must be an object/);
});

test('loop protocol output accepts canonical JSON and rejects natural language commands', () => {
  const valid = validateLoopProtocolOutput({
    schema: 'zj-loop.harness_output.v1',
    schema_version: 1,
    status: 'completed',
    summary: 'Created a reviewable PR.',
    next_actions: [
      {
        type: 'perform_closeout',
        target: 'github-pr:123',
        label: 'Run post-merge closeout after merge',
      },
    ],
    evidence: [{ kind: 'github-comment', url: 'https://example.test/issues/1#comment-1' }],
    artifacts: [{ kind: 'github-pr', url: 'https://example.test/pull/123' }],
  });

  assert.equal(valid.ok, true);
  assert.deepEqual(valid.errors, []);

  const naturalLanguage = validateLoopProtocolOutput('continue and fix this');

  assert.equal(naturalLanguage.ok, false);
  assert.match(naturalLanguage.errors.join('\n'), /protocol output must be an object/);
});

test('loop protocol output enforces status-specific required fields', () => {
  const stopped = validateLoopProtocolOutput({
    schema: 'zj-loop.harness_output.v1',
    schema_version: 1,
    status: 'stopped',
    summary: 'Stopped because the branch is dirty.',
    next_actions: [
      {
        type: 'stop',
        target: 'workspace',
        label: 'Stop until workspace is clean',
      },
    ],
    evidence: [],
    artifacts: [],
  });

  assert.equal(stopped.ok, false);
  assert.match(stopped.errors.join('\n'), /stopped status requires stop_signal/);
});

test('loop protocol output validates confirmation envelope for human gates', () => {
  const invalid = validateLoopProtocolOutput({
    schema: 'zj-loop.harness_output.v1',
    schema_version: 1,
    status: 'needs_confirmation',
    summary: 'Needs maintainer confirmation before cleanup.',
    next_actions: [
      {
        type: 'request_confirmation',
        target: 'confirmation:closeout-1',
        label: 'Ask maintainer to confirm closeout',
      },
    ],
    evidence: [],
    artifacts: [],
    stop_signal: { reason: 'requires-human-confirmation' },
    confirmation: {
      kind: 'confirmation',
      required_phrase: 'DELETE_MERGED_BRANCH',
    },
  });

  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join('\n'), /confirmation.confirmation_id is required/);
  assert.match(invalid.errors.join('\n'), /confirmation.scope is required/);
});

test('loop protocol output rejects unknown next action types', () => {
  const invalid = validateLoopProtocolOutput({
    schema: 'zj-loop.harness_output.v1',
    schema_version: 1,
    status: 'continued',
    summary: 'Route decision completed.',
    next_actions: [
      {
        type: 'do_whatever_the_agent_thinks',
        target: 'github-issue:123',
        label: 'Guess the next step',
      },
    ],
    evidence: [],
    artifacts: [],
  });

  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join('\n'), /unsupported next_actions\[0\]\.type do_whatever_the_agent_thinks/);
});

test('loop protocol output renderer produces deterministic human Markdown from canonical JSON', () => {
  const rendered = renderLoopProtocolOutputMarkdown({
    schema: 'zj-loop.harness_output.v1',
    schema_version: 1,
    status: 'completed',
    summary: 'Created a reviewable PR.',
    next_actions: [
      {
        type: 'perform_closeout',
        target: 'github-pr:123',
        label: 'Run post-merge closeout after merge',
      },
    ],
    evidence: [{ kind: 'github-comment', url: 'https://example.test/issues/1#comment-1' }],
    artifacts: [{ kind: 'github-pr', url: 'https://example.test/pull/123' }],
  });

  assert.match(rendered, /^## ZJ Loop Protocol Output/m);
  assert.match(rendered, /Status: `completed`/);
  assert.match(rendered, /Structured JSON is the source of truth/);
  assert.match(rendered, /perform_closeout/);
});

test('harness protocol CLI validates and renders output files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zj-loop-harness-protocol-'));
  const file = join(dir, 'output.json');
  await writeFile(file, JSON.stringify({
    schema: 'zj-loop.harness_output.v1',
    schema_version: 1,
    status: 'completed',
    summary: 'Created a reviewable PR.',
    next_actions: [],
    evidence: [],
    artifacts: [{ kind: 'github-pr', url: 'https://example.test/pull/123' }],
  }));

  const stdout = [];
  const stderr = [];
  const io = {
    stdout(message) {
      stdout.push(message);
    },
    stderr(message) {
      stderr.push(message);
    },
  };

  assert.equal(await runHarnessProtocolCli(['render-output', file], io), 0);
  assert.match(stdout.join('\n'), /ZJ Loop Protocol Output/);
  assert.deepEqual(stderr, []);

  const invalidStdout = [];
  const invalidStderr = [];
  const invalidIo = {
    stdout(message) {
      invalidStdout.push(message);
    },
    stderr(message) {
      invalidStderr.push(message);
    },
  };

  assert.equal(await runHarnessProtocolCli(['validate-output', file, '--expect-status', 'failed'], invalidIo), 1);
  assert.deepEqual(invalidStdout, []);
  assert.match(invalidStderr.join('\n'), /status must be failed/);
});

test('harness protocol CLI records run metrics from structured output files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zj-loop-harness-protocol-'));
  const file = join(dir, 'run.json');
  await writeFile(file, JSON.stringify({
    run_id: 'dogfood-cli-1',
    outputs: [
      {
        schema: 'zj-loop.harness_output.v1',
        schema_version: 1,
        status: 'completed',
        summary: 'Created PR.',
        next_actions: [
          {
            type: 'perform_closeout',
            target: 'github-pr:123',
            label: 'Close out after merge',
          },
        ],
        evidence: [{ kind: 'post-merge-closeout', url: 'https://example.test/issues/123#comment-2' }],
        artifacts: [{ kind: 'github-pr', url: 'https://example.test/pull/123' }],
      },
    ],
  }));

  const stdout = [];
  const stderr = [];
  const io = {
    stdout(message) {
      stdout.push(message);
    },
    stderr(message) {
      stderr.push(message);
    },
  };

  assert.equal(await runHarnessProtocolCli(['record-metrics', file], io), 0);
  assert.deepEqual(stderr, []);

  const metrics = JSON.parse(stdout.join('\n'));
  assert.equal(metrics.schema, 'zj-loop.run_metrics.v1');
  assert.equal(metrics.run_id, 'dogfood-cli-1');
  assert.equal(metrics.signal_to_review_artifact_completed, true);
  assert.equal(metrics.post_merge_closeout_evidence_count, 1);
});

test('harness protocol CLI validates no-provider local protocol inputs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zj-loop-harness-protocol-'));
  const file = join(dir, 'input.json');
  await writeFile(file, JSON.stringify({
    schema: 'zj-loop.harness_input.v1',
    schema_version: 1,
    envelope_type: 'fenced_protocol_block',
    intent: 'run_route',
    source: { kind: 'local-codex-session', id: 'codex-thread-1' },
    payload: {
      route_id: 'roadmap-sliced-development',
      carrier: { kind: 'local-file', path: 'zj-loop/requests/local-activation.json' },
    },
  }));

  const stdout = [];
  const stderr = [];
  const io = {
    stdout(message) {
      stdout.push(message);
    },
    stderr(message) {
      stderr.push(message);
    },
  };

  assert.equal(await runHarnessProtocolCli(['validate-input', file], io), 0);
  assert.match(stdout.join('\n'), /"ok": true/);
  assert.deepEqual(stderr, []);
});

test('run metrics recorder summarizes structured harness outputs deterministically', () => {
  const metrics = recordLoopRunMetrics({
    run_id: 'dogfood-1',
    outputs: [
      {
        schema: 'zj-loop.harness_output.v1',
        schema_version: 1,
        status: 'needs_confirmation',
        summary: 'Needs maintainer confirmation.',
        next_actions: [
          {
            type: 'request_confirmation',
            target: 'github-issue:123#comment-1',
            label: 'Confirm roadmap activation',
          },
        ],
        evidence: [{ kind: 'github-comment', url: 'https://example.test/issues/123#comment-1' }],
        artifacts: [],
        stop_signal: { reason: 'human-gate' },
        confirmation: {
          kind: 'confirmation',
          confirmation_id: 'confirm-1',
          required_phrase: 'CONFIRM_TRIAGE_TRANSITION',
          scope: 'roadmap activation',
          side_effects: ['create-branch', 'open-pr'],
          location: 'github-comment',
          valid_until_state: 'activation-request-open',
          actor_requirement: 'maintainer',
        },
      },
      {
        schema: 'zj-loop.harness_output.v1',
        schema_version: 1,
        status: 'completed',
        summary: 'Created PR.',
        next_actions: [
          {
            type: 'perform_closeout',
            target: 'github-pr:123',
            label: 'Close out after merge',
          },
        ],
        evidence: [{ kind: 'github-comment', url: 'https://example.test/issues/123#comment-2' }],
        artifacts: [{ kind: 'github-pr', url: 'https://example.test/pull/123' }],
      },
    ],
  });

  assert.equal(metrics.schema, 'zj-loop.run_metrics.v1');
  assert.equal(metrics.schema_version, 1);
  assert.equal(metrics.run_id, 'dogfood-1');
  assert.equal(metrics.human_handoff_count, 1);
  assert.equal(metrics.unnecessary_confirmation_count, 0);
  assert.equal(metrics.ambiguous_natural_language_next_step_count, 0);
  assert.equal(metrics.signal_to_review_artifact_completed, true);
  assert.deepEqual(metrics.surfaces, ['github-issue', 'github-pr']);
  assert.equal(metrics.location_switch_count, 1);
});
