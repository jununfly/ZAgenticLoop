import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../dist/dispatch-cli.js', import.meta.url));

const ROUTE_TABLE = `schemaVersion: 1
kind: zj-loop-route-table
routes:
  - route_id: "issue-backlog-triage"
    enabled: true
    request_kind: "report-only"
    consumer: "issue-triage"
    consumer_kind: "report-consumer"
    execution:
      mode: "report-only"
      side_effect_level: "evidence"
      completion_forms: ["report-evidence"]
    maturity:
      protocol: "replayed"
      runner: "missing"
    capabilities:
      scopes: ["issue-backlog", "triage-observation"]
      verifiers: ["route-replay", "forbidden-side-effect-check"]
      max_side_effect_level: "evidence"
    evidence_store: "zj-loop/issue-triage-state.md"
  - route_id: "roadmap-sliced-development"
    enabled: true
    request_kind: "activation-comment"
    consumer: "roadmap-activation"
    consumer_kind: "activation-consumer"
    execution:
      mode: "request-only"
      side_effect_level: "branch"
      completion_forms: ["roadmap-branch-pr", "activation-failed", "activation-resumable"]
      recent_success_evidence:
        - "https://example.test/run/roadmap"
    maturity:
      protocol: "execution-ready"
      runner: "execution-ready"
    capabilities:
      scopes: ["roadmap-activation", "branch-pr"]
      verifiers: ["activation-contract", "roadmap-branch-contract"]
      max_side_effect_level: "branch"
`;

async function setupProject() {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-dispatch-'));
  await mkdir(path.join(dir, 'zj-loop'), { recursive: true });
  await writeFile(path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'), ROUTE_TABLE);
  return dir;
}

test('zj-loop-dispatch turns a structured issue signal into a persisted orchestration envelope', async () => {
  const dir = await setupProject();
  try {
    const signalPath = path.join(dir, 'signal.json');
    await writeFile(signalPath, JSON.stringify({
      schema: 'zj-loop.signal.v1',
      signal_id: 'sig-issue-42',
      source: 'github_issue',
      provider: 'github',
      subject: {
        kind: 'issue',
        id: '42',
        url: 'https://github.com/jununfly/ZAgenticLoop/issues/42',
      },
      intent: 'triage',
      payload: {},
    }, null, 2));

    const result = spawnSync(process.execPath, [
      CLI,
      '--root',
      dir,
      '--signal',
      signalPath,
      '--mode',
      'auto',
      '--now',
      '2026-07-13T00:00:00.000Z',
    ], { encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.schema, 'zj-loop.orchestration.v1');
    assert.equal(output.status, 'planned');
    assert.equal(output.signal.signal_id, 'sig-issue-42');
    assert.equal(output.route_decision.route, 'issue-backlog-triage');
    assert.equal(output.consumer_run_plan.status, 'report-only');
    assert.equal(output.carrier_plan.action, 'reuse-source-carrier');
    assert.equal(output.review_artifact.kind, 'report-evidence');
    assert.equal(output.storage.path, `zj-loop/orchestrations/${output.orchestration_id}.json`);

    const persisted = JSON.parse(await readFile(path.join(dir, output.storage.path), 'utf8'));
    assert.deepEqual(persisted, output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-dispatch returns duplicate for the same signal and route', async () => {
  const dir = await setupProject();
  try {
    const signalPath = path.join(dir, 'signal.json');
    await writeFile(signalPath, JSON.stringify({
      schema: 'zj-loop.signal.v1',
      signal_id: 'sig-issue-42',
      source: 'github_issue',
      provider: 'github',
      subject: {
        kind: 'issue',
        id: '42',
        url: 'https://github.com/jununfly/ZAgenticLoop/issues/42',
      },
      intent: 'triage',
      payload: {},
    }, null, 2));

    const first = spawnSync(process.execPath, [
      CLI,
      '--root',
      dir,
      '--signal',
      signalPath,
      '--now',
      '2026-07-13T00:00:00.000Z',
    ], { encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    const firstOutput = JSON.parse(first.stdout);

    const second = spawnSync(process.execPath, [
      CLI,
      '--root',
      dir,
      '--signal',
      signalPath,
      '--now',
      '2026-07-13T00:01:00.000Z',
    ], { encoding: 'utf8' });
    assert.equal(second.status, 0, second.stderr);
    const secondOutput = JSON.parse(second.stdout);

    assert.equal(secondOutput.status, 'duplicate');
    assert.equal(secondOutput.orchestration_id, firstOutput.orchestration_id);
    assert.equal(secondOutput.duplicate_of, firstOutput.orchestration_id);
    assert.equal(secondOutput.storage.path, firstOutput.storage.path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-dispatch auto mode reaches a review artifact for execution-ready roadmap activation', async () => {
  const dir = await setupProject();
  try {
    const signalPath = path.join(dir, 'activation-signal.json');
    await writeFile(signalPath, JSON.stringify({
      schema: 'zj-loop.signal.v1',
      signal_id: 'sig-roadmap-42',
      source: 'github_issue',
      provider: 'github',
      subject: {
        kind: 'issue',
        id: '42',
        url: 'https://github.com/jununfly/ZAgenticLoop/issues/42',
      },
      intent: 'activate_roadmap',
      payload: {},
    }, null, 2));

    const result = spawnSync(process.execPath, [
      CLI,
      '--root',
      dir,
      '--signal',
      signalPath,
      '--mode',
      'auto',
      '--now',
      '2026-07-13T00:02:00.000Z',
    ], { encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'executed_to_review_artifact');
    assert.equal(output.route_decision.route, 'roadmap-sliced-development');
    assert.equal(output.consumer_run_plan.status, 'ready');
    assert.equal(output.carrier_plan.action, 'reuse-source-carrier');
    assert.equal(output.review_artifact.kind, 'structured-evidence');
    assert.equal(output.review_artifact.path, 'contract-plan.json');
    assert.equal(output.closeout_hint.required, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-dispatch rejects non-envelope input instead of treating natural language as a signal', async () => {
  const dir = await setupProject();
  try {
    const signalPath = path.join(dir, 'natural-language.json');
    await writeFile(signalPath, JSON.stringify('please triage this issue'));

    const result = spawnSync(process.execPath, [
      CLI,
      '--root',
      dir,
      '--signal',
      signalPath,
    ], { encoding: 'utf8' });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Signal envelope must be an object/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-dispatch resume mode returns the stored orchestration as resumable context', async () => {
  const dir = await setupProject();
  try {
    const signalPath = path.join(dir, 'signal.json');
    await writeFile(signalPath, JSON.stringify({
      schema: 'zj-loop.signal.v1',
      signal_id: 'sig-issue-42',
      source: 'github_issue',
      provider: 'github',
      subject: {
        kind: 'issue',
        id: '42',
        url: 'https://github.com/jununfly/ZAgenticLoop/issues/42',
      },
      intent: 'triage',
      payload: {},
    }, null, 2));

    const first = spawnSync(process.execPath, [
      CLI,
      '--root',
      dir,
      '--signal',
      signalPath,
      '--now',
      '2026-07-13T00:00:00.000Z',
    ], { encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    const firstOutput = JSON.parse(first.stdout);

    const resumed = spawnSync(process.execPath, [
      CLI,
      '--root',
      dir,
      '--signal',
      signalPath,
      '--mode',
      'resume',
      '--now',
      '2026-07-13T00:03:00.000Z',
    ], { encoding: 'utf8' });
    assert.equal(resumed.status, 0, resumed.stderr);
    const resumedOutput = JSON.parse(resumed.stdout);

    assert.equal(resumedOutput.status, 'resume');
    assert.equal(resumedOutput.orchestration_id, firstOutput.orchestration_id);
    assert.equal(resumedOutput.resumes, firstOutput.orchestration_id);
    assert.equal(resumedOutput.created_at, firstOutput.created_at);
    assert.equal(resumedOutput.updated_at, '2026-07-13T00:03:00.000Z');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
