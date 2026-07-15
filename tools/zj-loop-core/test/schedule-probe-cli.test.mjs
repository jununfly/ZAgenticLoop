import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { runScheduleProbeCli } from '../dist/schedule-probe-command.js';

function capturedIo() {
  const stdout = [];
  const stderr = [];
  return { stdout, stderr, io: { stdout: (message) => stdout.push(message), stderr: (message) => stderr.push(message) } };
}

function runner() {
  const calls = [];
  return {
    calls,
    async runGitLabScheduleProbe(input) { calls.push({ action: 'start', input }); return { status: 'completed' }; },
    async resumeGitLabScheduleProbe(input) { calls.push({ action: 'resume', input }); return { status: 'completed' }; },
    async restoreGitLabScheduleProbe(input) { calls.push({ action: 'restore', input }); return { status: 'cleaned', probe_id: input.probeId }; },
  };
}

test('schedule probe CLI dispatches start, resume, and restore through their public arguments', async () => {
  for (const [argv, action] of [
    [['start', '--project', 'group/project', '--due-in-minutes', '3', '--confirmation', 'RUN_TEMPORARY_GITLAB_SCHEDULE_PROBE'], 'start'],
    [['resume', '--project', 'group/project', '--probe-id', 'probe-1'], 'resume'],
    [['restore', '--project', 'group/project', '--probe-id', 'probe-1'], 'restore'],
  ]) {
    const output = capturedIo();
    const fakeRunner = runner();
    const exitCode = await runScheduleProbeCli({ argv, io: output.io, env: { GITLAB_TOKEN: 'token' }, signalTarget: new EventEmitter(), runner: fakeRunner });
    assert.equal(exitCode, 0);
    assert.equal(fakeRunner.calls[0].action, action);
    assert.equal(fakeRunner.calls[0].input.project, 'group/project');
    assert.equal(JSON.parse(output.stdout[0]).status, action === 'restore' ? 'cleaned' : 'completed');
  }
});

test('schedule probe CLI restores an armed owned schedule on SIGINT and preserves exit 130', async () => {
  const signals = new EventEmitter();
  const output = capturedIo();
  const fakeRunner = runner();
  fakeRunner.runGitLabScheduleProbe = async (input) => {
    fakeRunner.calls.push({ action: 'start', input });
    input.onArmed({ probe_id: 'probe-1' });
    signals.emit('SIGINT');
    assert.equal(input.signal.aborted, true);
    return { status: 'interrupted', reason: 'signal-received' };
  };

  const exitCode = await runScheduleProbeCli({
    argv: ['start', '--project', 'group/project', '--due-in-minutes', '3', '--confirmation', 'RUN_TEMPORARY_GITLAB_SCHEDULE_PROBE'],
    io: output.io, env: { GITLAB_TOKEN: 'token' }, signalTarget: signals, runner: fakeRunner,
  });

  assert.equal(exitCode, 130);
  assert.equal(fakeRunner.calls.filter((call) => call.action === 'restore').length, 1);
  const result = JSON.parse(output.stdout[0]);
  assert.equal(result.status, 'interrupted');
  assert.equal(result.signal, 'SIGINT');
  assert.equal(result.cleanup.status, 'cleaned');
  assert.equal(result.cleanup.probe_id, 'probe-1');
});

test('schedule probe CLI preserves SIGTERM exit 143 after guarded cleanup', async () => {
  const signals = new EventEmitter();
  const output = capturedIo();
  const fakeRunner = runner();
  fakeRunner.resumeGitLabScheduleProbe = async (input) => {
    fakeRunner.calls.push({ action: 'resume', input });
    signals.emit('SIGTERM');
    return { status: 'interrupted', reason: 'signal-received' };
  };

  const exitCode = await runScheduleProbeCli({
    argv: ['resume', '--project', 'group/project', '--probe-id', 'probe-1'],
    io: output.io, env: { GITLAB_TOKEN: 'token' }, signalTarget: signals, runner: fakeRunner,
  });

  assert.equal(exitCode, 143);
  assert.equal(fakeRunner.calls.filter((call) => call.action === 'restore').length, 1);
  assert.equal(JSON.parse(output.stdout[0]).signal, 'SIGTERM');
});
