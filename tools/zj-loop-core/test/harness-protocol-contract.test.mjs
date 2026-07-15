import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  renderLoopProtocolOutputMarkdown,
  recordLoopRunMetrics,
  evaluateLoopRunMetricsGate,
  runHarnessProtocolCli,
  buildHarnessRunStateRecord,
  findHarnessResumeEnvelope,
  getHarnessRunStatePath,
  normalizeLoopProtocolInput,
  validateLoopProtocolInput,
  validateLoopProtocolOutput,
} from '../dist/index.js';

function harnessOutput(overrides = {}) {
  const machineOverrides = overrides.machine_envelope ?? {};
  const { machine_envelope: _machineEnvelope, ...topLevelOverrides } = overrides;
  return {
    schema: 'zj-loop.harness_output.v1',
    schema_version: 1,
    human_summary: 'Created a reviewable PR.',
    machine_envelope: {
      status: 'completed',
      run_id: 'run-1',
      route_id: 'roadmap-sliced-development',
      consumer: 'roadmap-sliced-development',
      completed_steps: ['created-pr'],
      next_action: {
        type: 'perform_closeout',
        target: 'github-pr:123',
        label: 'Run post-merge closeout after merge',
      },
      evidence: [{ kind: 'github-comment', url: 'https://example.test/issues/1#comment-1' }],
      artifacts: [{ kind: 'github-pr', url: 'https://example.test/pull/123' }],
      closeout: { required: true, target: 'github-pr:123' },
      ...machineOverrides,
    },
    ...topLevelOverrides,
  };
}

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

test('loop protocol input normalizer autofills low-risk fields and returns repair requests for missing authority', () => {
  const normalized = normalizeLoopProtocolInput({
    schema: 'zj-loop.harness_input.v1',
    schema_version: 1,
    envelope_type: 'deterministic_cli_output',
    intent: 'run_route',
    source: { kind: 'codex-conversation', id: 'thread-1' },
    payload: {
      route_id: 'roadmap-sliced-development',
      consumer: 'roadmap-sliced-development',
      authority: { actor: 'maintainer', mode: 'local' },
      review_artifact_target: { kind: 'pull-request' },
    },
  }, {
    run_id: 'run-1',
    created_at: '2026-07-12T13:00:00.000Z',
    repo: { provider: 'github', owner: 'jununfly', name: 'ZAgenticLoop', branch: 'main' },
  });

  assert.equal(normalized.ok, true);
  assert.equal(normalized.input.payload.run_id, 'run-1');
  assert.equal(normalized.input.payload.tool, 'codex');
  assert.equal(normalized.input.payload.max_slices, 30);
  assert.deepEqual(normalized.input.payload.repo, {
    provider: 'github',
    owner: 'jununfly',
    name: 'ZAgenticLoop',
    branch: 'main',
  });
  assert.deepEqual(normalized.autofill_attempted.sort(), [
    'closeout_strategy',
    'created_at',
    'evidence_target',
    'max_slices',
    'repo',
    'resume_policy',
    'run_id',
    'tool',
  ].sort());

  const repair = normalizeLoopProtocolInput({
    schema: 'zj-loop.harness_input.v1',
    schema_version: 1,
    envelope_type: 'deterministic_cli_output',
    intent: 'run_route',
    source: { kind: 'codex-conversation', id: 'thread-1' },
    payload: { route_id: 'roadmap-sliced-development' },
  }, { run_id: 'run-2' });

  assert.equal(repair.ok, false);
  assert.deepEqual(repair.protocol_repair_request.missing_fields, [
    'payload.consumer',
    'payload.authority',
    'payload.review_artifact_target',
  ]);
  assert.equal(repair.protocol_repair_request.next_command_hint, 'Provide a complete harness input envelope and resume with the included resume_envelope.');
  assert.equal(repair.protocol_repair_request.repair_location, 'protocol-input');
  assert.deepEqual(repair.protocol_repair_request.next_action, {
    type: 'resume_loop',
    target: `protocol-repair:${repair.protocol_repair_request.resume_envelope.resume_id}`,
    label: 'Repair protocol input and resume',
  });
  assert.equal(repair.protocol_repair_request.confirmation_required, false);
});

test('loop protocol output accepts canonical JSON and rejects natural language commands', () => {
  const valid = validateLoopProtocolOutput(harnessOutput());

  assert.equal(valid.ok, true);
  assert.deepEqual(valid.errors, []);

  const naturalLanguage = validateLoopProtocolOutput('continue and fix this');

  assert.equal(naturalLanguage.ok, false);
  assert.match(naturalLanguage.errors.join('\n'), /protocol output must be an object/);

  const oldStatus = validateLoopProtocolOutput(harnessOutput({
    human_summary: 'Continuing route.',
    machine_envelope: {
      status: 'continued',
      completed_steps: [],
      next_action: { type: 'continue_loop', target: 'route:roadmap-sliced-development', label: 'Continue' },
      evidence: [],
      artifacts: [],
    },
  }));

  assert.equal(oldStatus.ok, false);
  assert.match(oldStatus.errors.join('\n'), /unsupported machine_envelope.status continued/);
});

test('loop protocol output enforces status-specific required fields', () => {
  const stopped = validateLoopProtocolOutput(harnessOutput({
    human_summary: 'Stopped because the branch is dirty.',
    machine_envelope: {
      status: 'stopped',
      next_action: {
        type: 'stop',
        target: 'workspace',
        label: 'Stop until workspace is clean',
      },
      evidence: [],
      artifacts: [],
    },
  }));

  assert.equal(stopped.ok, false);
  assert.match(stopped.errors.join('\n'), /stopped status requires machine_envelope\.stop_signal/);
  assert.match(stopped.errors.join('\n'), /stopped status requires machine_envelope\.resume/);
});

test('loop protocol output validates protocol repair requests for repairable envelopes', () => {
  const invalid = validateLoopProtocolOutput(harnessOutput({
    human_summary: 'Protocol input needs repair.',
    machine_envelope: {
      status: 'needs_protocol_repair',
      next_action: {
        type: 'resume_loop',
        target: 'resume:run-1',
        label: 'Resume after protocol repair',
      },
      evidence: [],
      artifacts: [],
    },
  }));

  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join('\n'), /needs_protocol_repair status requires machine_envelope\.protocol_repair_request/);
});

test('loop protocol output rejects unknown next action types', () => {
  const invalid = validateLoopProtocolOutput(harnessOutput({
    human_summary: 'Route decision completed.',
    machine_envelope: {
      status: 'in_progress',
      next_action: {
        type: 'do_whatever_the_agent_thinks',
        target: 'github-issue:123',
        label: 'Guess the next step',
      },
      evidence: [],
      artifacts: [],
    },
  }));

  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join('\n'), /unsupported machine_envelope\.next_action\.type do_whatever_the_agent_thinks/);
});

test('loop protocol output renderer produces deterministic human Markdown from canonical JSON', () => {
  const rendered = renderLoopProtocolOutputMarkdown(harnessOutput());

  assert.match(rendered, /^## ZJ Loop Protocol Output/m);
  assert.match(rendered, /Status: `completed`/);
  assert.match(rendered, /Structured JSON is the source of truth/);
  assert.match(rendered, /perform_closeout/);
});

test('harness protocol CLI validates and renders output files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zj-loop-harness-protocol-'));
  const file = join(dir, 'output.json');
  await writeFile(file, JSON.stringify(harnessOutput({
    machine_envelope: {
      next_action: { type: 'perform_closeout', target: 'github-pr:123', label: 'Close out after merge' },
      evidence: [],
      artifacts: [{ kind: 'github-pr', url: 'https://example.test/pull/123' }],
    },
  })));

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
      harnessOutput({
        human_summary: 'Created PR.',
        machine_envelope: {
          run_id: 'dogfood-cli-1',
          next_action: {
            type: 'perform_closeout',
            target: 'github-pr:123',
            label: 'Close out after merge',
          },
          evidence: [{ kind: 'post-merge-closeout', url: 'https://example.test/issues/123#comment-2' }],
          artifacts: [{ kind: 'github-pr', url: 'https://example.test/pull/123' }],
        },
      }),
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

test('harness protocol CLI normalizes input files and emits protocol repair requests', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zj-loop-harness-protocol-'));
  const file = join(dir, 'input.json');
  await writeFile(file, JSON.stringify({
    schema: 'zj-loop.harness_input.v1',
    schema_version: 1,
    envelope_type: 'deterministic_cli_output',
    intent: 'run_route',
    source: { kind: 'codex-conversation', id: 'thread-1' },
    payload: {
      route_id: 'roadmap-sliced-development',
      consumer: 'roadmap-sliced-development',
      authority: { actor: 'maintainer', mode: 'local' },
      review_artifact_target: { kind: 'pull-request' },
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

  assert.equal(await runHarnessProtocolCli([
    'normalize-input',
    file,
    '--default-run-id',
    'run-cli-1',
    '--created-at',
    '2026-07-12T13:00:00.000Z',
  ], io), 0);
  assert.deepEqual(stderr, []);
  const normalized = JSON.parse(stdout.join('\n'));
  assert.equal(normalized.ok, true);
  assert.equal(normalized.input.payload.run_id, 'run-cli-1');

  const repairFile = join(dir, 'repair.json');
  await writeFile(repairFile, JSON.stringify({
    schema: 'zj-loop.harness_input.v1',
    schema_version: 1,
    envelope_type: 'deterministic_cli_output',
    intent: 'run_route',
    source: { kind: 'codex-conversation', id: 'thread-2' },
    payload: { route_id: 'roadmap-sliced-development' },
  }));

  const repairStdout = [];
  const repairStderr = [];
  const repairIo = {
    stdout(message) {
      repairStdout.push(message);
    },
    stderr(message) {
      repairStderr.push(message);
    },
  };

  assert.equal(await runHarnessProtocolCli(['normalize-input', repairFile, '--default-run-id', 'run-cli-2'], repairIo), 1);
  assert.deepEqual(repairStderr, []);
  const repair = JSON.parse(repairStdout.join('\n'));
  assert.equal(repair.ok, false);
  assert.deepEqual(repair.protocol_repair_request.missing_fields, [
    'payload.consumer',
    'payload.authority',
    'payload.review_artifact_target',
  ]);
});

test('run metrics recorder summarizes structured harness outputs deterministically', () => {
  const metrics = recordLoopRunMetrics({
    run_id: 'dogfood-1',
    outputs: [
      harnessOutput({
        human_summary: 'Needs maintainer confirmation.',
        machine_envelope: {
          status: 'stopped',
          run_id: 'dogfood-1',
          completed_steps: [],
          next_action: {
            type: 'request_confirmation',
            target: 'github-issue:123#comment-1',
            label: 'Confirm roadmap activation',
          },
          evidence: [{ kind: 'github-comment', url: 'https://example.test/issues/123#comment-1' }],
          artifacts: [],
          stop_signal: { reason: 'human-gate' },
          resume: { resume_id: 'resume-1', next_safe_step: 'confirm transition' },
        },
      }),
      harnessOutput({
        human_summary: 'Created PR.',
        machine_envelope: {
          run_id: 'dogfood-1',
          next_action: {
            type: 'perform_closeout',
            target: 'github-pr:123',
            label: 'Close out after merge',
          },
          evidence: [{ kind: 'github-comment', url: 'https://example.test/issues/123#comment-2' }],
          artifacts: [{ kind: 'github-pr', url: 'https://example.test/pull/123' }],
        },
      }),
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
  assert.deepEqual(evaluateLoopRunMetricsGate(metrics), {
    schema: 'zj-loop.run_metrics_gate.v1',
    status: 'pass',
    violations: [],
  });
});

test('run metrics gate rejects confirmations without a stopped resume boundary', () => {
  const metrics = recordLoopRunMetrics({
    run_id: 'invalid-confirmation',
    outputs: [harnessOutput({
      machine_envelope: {
        status: 'in_progress',
        run_id: 'invalid-confirmation',
        completed_steps: [],
        next_action: { type: 'request_confirmation', target: 'terminal', label: 'Confirm' },
        evidence: [],
        artifacts: [],
      },
    })],
  });
  assert.equal(metrics.unnecessary_confirmation_count, 1);
  assert.deepEqual(evaluateLoopRunMetricsGate(metrics), {
    schema: 'zj-loop.run_metrics_gate.v1',
    status: 'fail',
    violations: ['unnecessary-confirmation'],
  });
});

test('harness run state records expose deterministic resume lookup and local storage paths', () => {
  const stoppedOutput = harnessOutput({
    human_summary: 'Stopped until maintainer confirmation is available.',
    machine_envelope: {
      status: 'stopped',
      run_id: 'run-resume-1',
      route_id: 'roadmap-sliced-development',
      consumer: 'roadmap-sliced-development',
      completed_steps: ['created-activation-request'],
      next_action: {
        type: 'request_confirmation',
        target: 'github-issue:123#comment-1',
        label: 'Confirm roadmap activation',
      },
      evidence: [{ kind: 'github-comment', url: 'https://example.test/issues/123#comment-1' }],
      artifacts: [],
      stop_signal: { reason: 'requires-maintainer-confirmation' },
      resume: {
        resume_id: 'resume-123',
        original_input: { source: { kind: 'github-issue', id: '123' } },
        current_route: 'roadmap-sliced-development',
        consumer_state: { phase: 'awaiting-confirmation' },
        last_completed_step: 'created-activation-request',
        next_safe_step: 'consume-confirmation',
        required_resolution: 'maintainer confirmation',
        resume_preconditions: ['confirmation-comment-present'],
        evidence_index: ['https://example.test/issues/123#comment-1'],
        artifact_links: [],
        budget_remaining: { max_slices: 29 },
        stop_reason: 'requires-maintainer-confirmation',
        can_resume_without_new_authorization: false,
      },
    },
  });

  const record = buildHarnessRunStateRecord({
    source: { kind: 'github-issue', id: '123' },
    output: stoppedOutput,
  });

  assert.equal(record.schema, 'zj-loop.harness_run_state.v1');
  assert.equal(record.run_id, 'run-resume-1');
  assert.equal(record.status, 'stopped');
  assert.equal(record.resume_envelopes.length, 1);
  assert.equal(record.storage.local_path, 'zj-loop/harness/runs/run-resume-1.json');
  assert.deepEqual(findHarnessResumeEnvelope([record], {
    resume_id: 'resume-123',
    source: { kind: 'github-issue', id: '123' },
    route_id: 'roadmap-sliced-development',
    active_run_id: 'run-resume-1',
  }), stoppedOutput.machine_envelope.resume);
  assert.equal(getHarnessRunStatePath('run-resume-1'), 'zj-loop/harness/runs/run-resume-1.json');
});
