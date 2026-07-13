import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dispatchSignal } from '../dist/index.js';

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
  - route_id: "changelog-drafter-draft-request"
    enabled: true
    request_kind: "draft-request"
    consumer: "changelog-drafter"
    consumer_kind: "draft-consumer"
    execution:
      mode: "request-only"
      side_effect_level: "draft-pr"
      completion_forms: ["draft-pr", "draft-evidence", "escalation-issue"]
      recent_success_evidence:
        - "https://example.test/run/changelog-drafter"
    maturity:
      protocol: "execution-ready"
      runner: "execution-ready"
    capabilities:
      scopes: ["release-window", "draft-artifact"]
      verifiers: ["draft-request-contract", "reviewable-draft-outcome"]
      max_side_effect_level: "draft-pr"
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
      payload: {
        activation_request_comment_url: 'https://github.com/jununfly/ZAgenticLoop/issues/42#issuecomment-100',
        title: 'Implement consumer adapter',
        process_roadmap_path: 'docs/plans/value-oriented-product-upgrade-roadmap.md',
      },
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
    assert.equal(output.review_artifact.path, `zj-loop/orchestrations/${output.orchestration_id}/contract-plan.json`);
    assert.equal(output.closeout_hint.required, true);

    assert.equal(output.consumer_adapter_result.schema, 'zj-loop.consumer_adapter_result.v1');
    assert.equal(output.consumer_adapter_result.route_id, 'roadmap-sliced-development');
    assert.equal(output.consumer_adapter_result.consumer, 'roadmap-activation');
    assert.equal(output.consumer_adapter_result.consumer_kind, 'activation-consumer');
    assert.equal(output.consumer_adapter_result.adapter_status, 'executed_to_review_artifact');
    assert.deepEqual(output.consumer_adapter_result.live_side_effects, {
      attempted: false,
      reason: 'review-artifact runner only',
    });
    assert.equal(output.consumer_adapter_result.review_artifacts[0].path, output.review_artifact.path);
    assert.equal(output.consumer_adapter_result.review_artifacts[0].kind, 'contract-plan');
    assert.equal(output.consumer_adapter_result.review_artifacts[0].schema, 'zj-loop.roadmap_activation_contract_plan.v1');

    const contractPlan = JSON.parse(await readFile(path.join(dir, output.review_artifact.path), 'utf8'));
    assert.equal(contractPlan.schema, 'zj-loop.roadmap_activation_contract_plan.v1');
    assert.equal(contractPlan.provider, 'github');
    assert.equal(contractPlan.activationRequestId, 'sig-roadmap-42');
    assert.equal(contractPlan.branchName.startsWith('zjal-'), true);
    assert.equal(contractPlan.reviewTitle, 'Roadmap Activation: Implement consumer adapter');
    assert.equal(contractPlan.prTitle, 'Roadmap Activation: Implement consumer adapter');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-dispatch auto mode creates a Changelog Drafter draft-plan review artifact', async () => {
  const dir = await setupProject();
  try {
    const signalPath = path.join(dir, 'changelog-signal.json');
    await writeFile(signalPath, JSON.stringify({
      schema: 'zj-loop.signal.v1',
      signal_id: 'sig-changelog-v0.1.2-v0.1.3',
      source: 'workflow_dispatch',
      provider: 'github',
      subject: {
        kind: 'local_goal',
        id: 'release-window-v0.1.2-v0.1.3',
      },
      intent: 'draft_changelog',
      payload: {
        changelog_draft_request: {
          schema: 'zj-loop.changelog_draft_request.v1',
          route_id: 'changelog-drafter-draft-request',
          status: 'draft-request-candidate',
          dedupe_key: 'changelog:main:v0.1.2..v0.1.3',
          summary: 'Draft release notes for the next package release.',
          release_window: {
            repo: 'jununfly/ZAgenticLoop',
            base_branch: 'main',
            since_ref: 'v0.1.2',
            until_ref: 'v0.1.3',
            item_count: 4,
          },
          human_gate: {
            required: false,
          },
          side_effects: {
            tag_created: false,
            release_created: false,
            package_published: false,
          },
        },
      },
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
      '2026-07-13T00:03:00.000Z',
    ], { encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'executed_to_review_artifact');
    assert.equal(output.route_decision.route, 'changelog-drafter-draft-request');
    assert.equal(output.consumer_run_plan.status, 'ready');
    assert.equal(output.review_artifact.kind, 'structured-evidence');
    assert.equal(output.review_artifact.path, `zj-loop/orchestrations/${output.orchestration_id}/draft-plan.json`);
    assert.equal(output.closeout_hint.required, true);

    assert.equal(output.consumer_adapter_result.schema, 'zj-loop.consumer_adapter_result.v1');
    assert.equal(output.consumer_adapter_result.route_id, 'changelog-drafter-draft-request');
    assert.equal(output.consumer_adapter_result.consumer, 'changelog-drafter');
    assert.equal(output.consumer_adapter_result.consumer_kind, 'draft-consumer');
    assert.equal(output.consumer_adapter_result.adapter_status, 'executed_to_review_artifact');
    assert.deepEqual(output.consumer_adapter_result.live_side_effects, {
      attempted: false,
      reason: 'review-artifact runner only',
    });
    assert.equal(output.consumer_adapter_result.review_artifacts[0].path, output.review_artifact.path);
    assert.equal(output.consumer_adapter_result.review_artifacts[0].kind, 'draft-plan');
    assert.equal(output.consumer_adapter_result.review_artifacts[0].schema, 'zj-loop.changelog_drafter_live_runner_plan.v1');

    const draftPlan = JSON.parse(await readFile(path.join(dir, output.review_artifact.path), 'utf8'));
    assert.equal(draftPlan.kind, 'zj-loop.changelog-drafter-live-runner-plan');
    assert.equal(draftPlan.route_id, 'changelog-drafter-draft-request');
    assert.equal(draftPlan.mode, 'dry-run');
    assert.equal(draftPlan.draft_mode, 'evidence');
    assert.equal(draftPlan.status, 'dry-run');
    assert.equal(draftPlan.release_window.repo, 'jununfly/ZAgenticLoop');
    assert.equal(draftPlan.release_window.since_ref, 'v0.1.2');
    assert.equal(draftPlan.release_window.until_ref, 'v0.1.3');
    assert.deepEqual(draftPlan.actions.map((action) => action.name), ['write-draft-evidence']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-dispatch hard stops Changelog Drafter when draft request carrier is missing', async () => {
  const dir = await setupProject();
  try {
    const signalPath = path.join(dir, 'changelog-signal.json');
    await writeFile(signalPath, JSON.stringify({
      schema: 'zj-loop.signal.v1',
      signal_id: 'sig-changelog-missing-request',
      source: 'workflow_dispatch',
      provider: 'github',
      subject: {
        kind: 'local_goal',
        id: 'release-window-v0.1.2-v0.1.3',
      },
      intent: 'draft_changelog',
      payload: {
        release_window: {
          repo: 'jununfly/ZAgenticLoop',
          base_branch: 'main',
          since_ref: 'v0.1.2',
          until_ref: 'v0.1.3',
        },
      },
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
      '2026-07-13T00:04:00.000Z',
    ], { encoding: 'utf8' });

    assert.equal(result.status, 2);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'hard_stopped');
    assert.equal(output.route_decision.route, 'changelog-drafter-draft-request');
    assert.equal(output.review_artifact.kind, 'hard-stop');
    assert.match(output.review_artifact.description, /missing-changelog-draft-request/);
    assert.equal(output.consumer_adapter_result.route_id, 'changelog-drafter-draft-request');
    assert.equal(output.consumer_adapter_result.adapter_status, 'hard_stopped');
    assert.equal(output.consumer_adapter_result.stop_signal.reason, 'missing-changelog-draft-request');
    assert.deepEqual(output.consumer_adapter_result.review_artifacts, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-dispatch execute mode reuses roadmap activation contract-plan and records GitHub live side effects', async () => {
  const dir = await setupProject();
  try {
    const signal = {
      schema: 'zj-loop.signal.v1',
      signal_id: 'sig-roadmap-live-github',
      source: 'github_issue',
      provider: 'github',
      subject: {
        kind: 'issue',
        id: '42',
        url: 'https://github.com/jununfly/ZAgenticLoop/issues/42',
      },
      intent: 'activate_roadmap',
      payload: {
        activation_request_comment_url: 'https://github.com/jununfly/ZAgenticLoop/issues/42#issuecomment-300',
        title: 'Live GitHub roadmap activation',
        repository: 'jununfly/ZAgenticLoop',
        target_branch: 'main',
      },
    };
    const auto = await dispatchSignal({
      root: dir,
      signal,
      mode: 'auto',
      now: '2026-07-13T00:06:00.000Z',
    });
    assert.equal(auto.status, 'executed_to_review_artifact');

    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      const text = String(url);
      if (text.endsWith('/git/ref/heads/main')) {
        return jsonResponse({ object: { sha: 'base-sha' } });
      }
      if (text.includes('/git/ref/heads/zjal-')) {
        return jsonResponse({}, 404);
      }
      if (text.endsWith('/git/refs')) {
        return jsonResponse({ ref: 'refs/heads/zjal-sig-roadmap-live-github-issue-42' }, 201);
      }
      if (text.includes('/pulls?')) {
        return jsonResponse([]);
      }
      if (text.endsWith('/pulls')) {
        return jsonResponse({
          number: 123,
          html_url: 'https://github.com/jununfly/ZAgenticLoop/pull/123',
        }, 201);
      }
      return jsonResponse({ message: `unexpected ${text}` }, 500);
    };

    const executed = await dispatchSignal({
      root: dir,
      signal,
      mode: 'execute',
      now: '2026-07-13T00:07:00.000Z',
      env: { GITHUB_TOKEN: 'token' },
      fetchImpl,
    });

    assert.equal(executed.orchestration_id, auto.orchestration_id);
    assert.equal(executed.status, 'executed_to_review_artifact');
    assert.equal(executed.consumer_adapter_result.live_side_effects.attempted, true);
    assert.equal(executed.consumer_adapter_result.live_side_effects.execution_scope, 'external_tool');
    assert.equal(executed.consumer_adapter_result.live_side_effects.external_tool, 'github');
    assert.equal(executed.consumer_adapter_result.live_side_effects.side_effect_level, 'branch_pr');
    assert.equal(executed.consumer_adapter_result.live_side_effects.status, 'completed');
    assert.equal(executed.consumer_adapter_result.live_side_effects.review.kind, 'pull-request');
    assert.equal(executed.consumer_adapter_result.live_side_effects.review.number, 123);
    assert.equal(executed.consumer_adapter_result.live_side_effects.review.url, 'https://github.com/jununfly/ZAgenticLoop/pull/123');
    assert.equal(executed.consumer_adapter_result.live_side_effects.branch.target, 'main');
    assert.equal(executed.consumer_adapter_result.live_side_effects.branch.name.startsWith('zjal-'), true);
    const closeoutHandoffArtifact = executed.consumer_adapter_result.review_artifacts.find((artifact) => artifact.kind === 'post-merge-closeout-handoff');
    assert.equal(closeoutHandoffArtifact.schema, 'zj-loop.post_merge_closeout_handoff.v1');
    const closeoutHandoff = JSON.parse(await readFile(path.join(dir, closeoutHandoffArtifact.path), 'utf8'));
    assert.equal(closeoutHandoff.route_id, 'post-merge-roadmap-closeout');
    assert.equal(closeoutHandoff.provider, 'github');
    assert.equal(closeoutHandoff.review.kind, 'pull-request');
    assert.equal(closeoutHandoff.review.number, 123);
    assert.equal(closeoutHandoff.review.url, 'https://github.com/jununfly/ZAgenticLoop/pull/123');
    assert.equal(closeoutHandoff.repository, 'jununfly/ZAgenticLoop');
    assert.equal(closeoutHandoff.carrier_issue, '42');
    assert.equal(closeoutHandoff.branch.target, 'main');
    assert.equal(closeoutHandoff.contract_source, 'review_body');
    assert.deepEqual(closeoutHandoff.dry_run_command.args, [
      'zj-loop-post-merge-closeout',
      'closeout-plan',
      '--provider',
      'github',
      '--repo',
      'jununfly/ZAgenticLoop',
      '--pr',
      '123',
      '--carrier-issue',
      '42',
    ]);
    assert.deepEqual(closeoutHandoff.live_closeout_command.args, [
      'zj-loop-post-merge-closeout',
      'live-closeout',
      '--repo',
      'jununfly/ZAgenticLoop',
      '--pr',
      '123',
      '--carrier-issue',
      '42',
    ]);
    assert.equal(closeoutHandoff.live_closeout_command.available, true);
    assert.equal(calls.some((call) => call.options.method === 'POST' && call.url.endsWith('/git/refs')), true);
    assert.equal(calls.some((call) => call.options.method === 'POST' && call.url.endsWith('/pulls')), true);

    const persisted = JSON.parse(await readFile(path.join(dir, executed.storage.path), 'utf8'));
    assert.deepEqual(persisted.consumer_adapter_result.live_side_effects, executed.consumer_adapter_result.live_side_effects);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-dispatch execute mode hard stops when no replayable orchestration exists', async () => {
  const dir = await setupProject();
  try {
    const signal = {
      schema: 'zj-loop.signal.v1',
      signal_id: 'sig-roadmap-no-existing',
      source: 'github_issue',
      provider: 'github',
      subject: {
        kind: 'issue',
        id: '42',
        url: 'https://github.com/jununfly/ZAgenticLoop/issues/42',
      },
      intent: 'activate_roadmap',
      payload: {
        activation_request_comment_url: 'https://github.com/jununfly/ZAgenticLoop/issues/42#issuecomment-400',
        repository: 'jununfly/ZAgenticLoop',
        target_branch: 'main',
      },
    };

    const output = await dispatchSignal({
      root: dir,
      signal,
      mode: 'execute',
      now: '2026-07-13T00:08:00.000Z',
      env: { GITHUB_TOKEN: 'token' },
      fetchImpl: async () => {
        throw new Error('execute without existing orchestration must not call provider API');
      },
    });

    assert.equal(output.status, 'hard_stopped');
    assert.equal(output.stop_signal.reason, 'missing-existing-orchestration-for-execute');
    assert.equal(output.consumer_adapter_result.live_side_effects.attempted, false);
    assert.deepEqual(output.consumer_adapter_result.review_artifacts, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-dispatch execute mode normalizes GitLab roadmap activation live side effects', async () => {
  const dir = await setupProject();
  try {
    const signal = {
      schema: 'zj-loop.signal.v1',
      signal_id: 'sig-roadmap-live-gitlab',
      source: 'gitlab_issue',
      provider: 'gitlab',
      subject: {
        kind: 'issue',
        id: '9',
      },
      intent: 'activate_roadmap',
      payload: {
        project_url: 'https://gitlab.com/group/project',
        source_comment_url: 'https://gitlab.com/group/project/-/issues/9#note_1',
        title: 'Live GitLab roadmap activation',
        project_path: 'group/project',
        target_branch: 'main',
      },
    };
    const auto = await dispatchSignal({
      root: dir,
      signal,
      mode: 'auto',
      now: '2026-07-13T00:09:00.000Z',
    });
    assert.equal(auto.status, 'executed_to_review_artifact');

    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      const text = String(url);
      if (text.includes('/repository/branches/')) return jsonResponse({}, 404);
      if (text.endsWith('/repository/branches')) return jsonResponse({}, 201);
      if (text.includes('/merge_requests?')) return jsonResponse([]);
      if (text.endsWith('/merge_requests')) {
        return jsonResponse({ iid: 5, web_url: 'https://gitlab.com/group/project/-/merge_requests/5' }, 201);
      }
      return jsonResponse({ message: `unexpected ${text}` }, 500);
    };

    const executed = await dispatchSignal({
      root: dir,
      signal,
      mode: 'execute',
      now: '2026-07-13T00:10:00.000Z',
      env: { GITLAB_TOKEN: 'token' },
      fetchImpl,
    });

    assert.equal(executed.orchestration_id, auto.orchestration_id);
    assert.equal(executed.consumer_adapter_result.live_side_effects.attempted, true);
    assert.equal(executed.consumer_adapter_result.live_side_effects.external_tool, 'gitlab');
    assert.equal(executed.consumer_adapter_result.live_side_effects.status, 'completed');
    assert.equal(executed.consumer_adapter_result.live_side_effects.review.kind, 'merge-request');
    assert.equal(executed.consumer_adapter_result.live_side_effects.review.number, 5);
    assert.equal(executed.consumer_adapter_result.live_side_effects.review.url, 'https://gitlab.com/group/project/-/merge_requests/5');
    assert.equal(executed.consumer_adapter_result.live_side_effects.branch.target, 'main');
    const closeoutHandoffArtifact = executed.consumer_adapter_result.review_artifacts.find((artifact) => artifact.kind === 'post-merge-closeout-handoff');
    assert.equal(closeoutHandoffArtifact.schema, 'zj-loop.post_merge_closeout_handoff.v1');
    const closeoutHandoff = JSON.parse(await readFile(path.join(dir, closeoutHandoffArtifact.path), 'utf8'));
    assert.equal(closeoutHandoff.provider, 'gitlab');
    assert.equal(closeoutHandoff.review.kind, 'merge-request');
    assert.equal(closeoutHandoff.review.number, 5);
    assert.equal(closeoutHandoff.project_path, 'group/project');
    assert.deepEqual(closeoutHandoff.dry_run_command.args, [
      'zj-loop-post-merge-closeout',
      'closeout-plan',
      '--provider',
      'gitlab',
      '--repo',
      'group/project',
      '--merge-request',
      '5',
      '--carrier-issue',
      '9',
    ]);
    assert.equal(closeoutHandoff.live_closeout_command.available, true);
    assert.deepEqual(closeoutHandoff.live_closeout_command.args, [
      'zj-loop-post-merge-closeout',
      'live-closeout',
      '--provider',
      'gitlab',
      '--repo',
      'group/project',
      '--merge-request',
      '5',
      '--carrier-issue',
      '9',
    ]);
    assert.equal(calls.some((call) => call.options.method === 'POST' && call.url.endsWith('/repository/branches')), true);
    assert.equal(calls.some((call) => call.options.method === 'POST' && call.url.endsWith('/merge_requests')), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-dispatch execute mode records missing token as resumable activation evidence', async () => {
  const dir = await setupProject();
  try {
    const signal = {
      schema: 'zj-loop.signal.v1',
      signal_id: 'sig-roadmap-live-missing-token',
      source: 'github_issue',
      provider: 'github',
      subject: {
        kind: 'issue',
        id: '43',
        url: 'https://github.com/jununfly/ZAgenticLoop/issues/43',
      },
      intent: 'activate_roadmap',
      payload: {
        activation_request_comment_url: 'https://github.com/jununfly/ZAgenticLoop/issues/43#issuecomment-500',
        repository: 'jununfly/ZAgenticLoop',
        target_branch: 'main',
      },
    };
    await dispatchSignal({
      root: dir,
      signal,
      mode: 'auto',
      now: '2026-07-13T00:11:00.000Z',
    });

    const executed = await dispatchSignal({
      root: dir,
      signal,
      mode: 'execute',
      now: '2026-07-13T00:12:00.000Z',
      fetchImpl: async () => {
        throw new Error('missing-token refusal must happen before provider API calls');
      },
    });

    assert.equal(executed.status, 'executed_to_review_artifact');
    assert.equal(executed.consumer_adapter_result.adapter_status, 'resumable');
    assert.equal(executed.consumer_adapter_result.live_side_effects.attempted, false);
    assert.equal(executed.consumer_adapter_result.live_side_effects.status, 'refused');
    assert.equal(executed.consumer_adapter_result.live_side_effects.attempts.length, 1);
    assert.equal(executed.consumer_adapter_result.live_side_effects.attempts[0].failure_class, 'recoverable');
    assert.equal(executed.consumer_adapter_result.live_side_effects.attempts[0].retry_consumed, false);
    assert.equal(executed.consumer_adapter_result.activation_lifecycle.activation_state, 'resumable');
    assert.equal(executed.consumer_adapter_result.activation_lifecycle.retry_budget_remaining, 3);
    assert.equal(executed.consumer_adapter_result.activation_lifecycle.next_command, 'zj-loop-dispatch --mode execute');
    const lifecycleArtifact = executed.consumer_adapter_result.review_artifacts.find((artifact) => artifact.kind === 'activation-lifecycle');
    assert.equal(lifecycleArtifact.schema, 'zj-loop.activation_lifecycle_evidence.v1');
    const lifecycleEvidence = JSON.parse(await readFile(path.join(dir, lifecycleArtifact.path), 'utf8'));
    assert.equal(lifecycleEvidence.activation_state, 'resumable');
    assert.equal(lifecycleEvidence.failure_class, 'recoverable');
    assert.equal(lifecycleEvidence.resume_allowed, true);
    assert.equal(
      executed.consumer_adapter_result.live_side_effects.refusals.some((refusal) => refusal.reason === 'github-token-required-for-live-execution'),
      true,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-dispatch execute mode resumes partial GitHub branch success without duplicating branch creation', async () => {
  const dir = await setupProject();
  try {
    const signal = {
      schema: 'zj-loop.signal.v1',
      signal_id: 'sig-roadmap-partial-github',
      source: 'github_issue',
      provider: 'github',
      subject: {
        kind: 'issue',
        id: '44',
        url: 'https://github.com/jununfly/ZAgenticLoop/issues/44',
      },
      intent: 'activate_roadmap',
      payload: {
        activation_request_comment_url: 'https://github.com/jununfly/ZAgenticLoop/issues/44#issuecomment-600',
        title: 'Partial GitHub roadmap activation',
        repository: 'jununfly/ZAgenticLoop',
        target_branch: 'main',
      },
    };
    await dispatchSignal({
      root: dir,
      signal,
      mode: 'auto',
      now: '2026-07-13T00:13:00.000Z',
    });

    const firstCalls = [];
    const firstFetchImpl = async (url, options = {}) => {
      firstCalls.push({ url: String(url), options });
      const text = String(url);
      if (text.endsWith('/git/ref/heads/main')) return jsonResponse({ object: { sha: 'base-sha' } });
      if (text.includes('/git/ref/heads/zjal-')) return jsonResponse({}, 404);
      if (text.endsWith('/git/refs')) return jsonResponse({}, 201);
      if (text.includes('/pulls?')) return jsonResponse([]);
      if (text.endsWith('/pulls')) return jsonResponse({ message: 'temporary outage' }, 500);
      return jsonResponse({ message: `unexpected ${text}` }, 500);
    };

    const first = await dispatchSignal({
      root: dir,
      signal,
      mode: 'execute',
      now: '2026-07-13T00:14:00.000Z',
      env: { GITHUB_TOKEN: 'token' },
      fetchImpl: firstFetchImpl,
    });

    assert.equal(first.status, 'executed_to_review_artifact');
    assert.equal(first.consumer_adapter_result.adapter_status, 'resumable');
    assert.equal(first.consumer_adapter_result.activation_lifecycle.activation_state, 'resumable');
    assert.equal(first.consumer_adapter_result.live_side_effects.attempts[0].operation, 'create-pull-request');
    assert.equal(first.consumer_adapter_result.live_side_effects.attempts[0].http_status, 500);
    assert.equal(first.consumer_adapter_result.live_side_effects.attempts[0].retry_consumed, true);
    assert.equal(first.consumer_adapter_result.activation_lifecycle.retry_budget_remaining, 2);

    const secondCalls = [];
    const secondFetchImpl = async (url, options = {}) => {
      secondCalls.push({ url: String(url), options });
      const text = String(url);
      if (text.endsWith('/git/ref/heads/main')) return jsonResponse({ object: { sha: 'base-sha' } });
      if (text.includes('/git/ref/heads/zjal-')) return jsonResponse({ object: { sha: 'base-sha' } });
      if (text.includes('/pulls?')) return jsonResponse([]);
      if (text.endsWith('/pulls')) {
        return jsonResponse({
          number: 124,
          html_url: 'https://github.com/jununfly/ZAgenticLoop/pull/124',
        }, 201);
      }
      return jsonResponse({ message: `unexpected ${text}` }, 500);
    };

    const second = await dispatchSignal({
      root: dir,
      signal,
      mode: 'execute',
      now: '2026-07-13T00:15:00.000Z',
      env: { GITHUB_TOKEN: 'token' },
      fetchImpl: secondFetchImpl,
    });

    assert.equal(second.consumer_adapter_result.adapter_status, 'executed_to_live_side_effects');
    assert.equal(second.consumer_adapter_result.live_side_effects.status, 'completed');
    assert.equal(second.consumer_adapter_result.live_side_effects.attempts.length, 2);
    assert.equal(second.consumer_adapter_result.live_side_effects.attempts[1].status, 'completed');
    assert.equal(second.consumer_adapter_result.live_side_effects.review.url, 'https://github.com/jununfly/ZAgenticLoop/pull/124');
    assert.equal(secondCalls.some((call) => call.options.method === 'POST' && call.url.endsWith('/git/refs')), false);
    assert.equal(secondCalls.some((call) => call.options.method === 'POST' && call.url.endsWith('/pulls')), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-dispatch execute mode treats invalid contract-plan schema as terminal activation failure', async () => {
  const dir = await setupProject();
  try {
    const signal = {
      schema: 'zj-loop.signal.v1',
      signal_id: 'sig-roadmap-terminal-schema',
      source: 'github_issue',
      provider: 'github',
      subject: {
        kind: 'issue',
        id: '45',
        url: 'https://github.com/jununfly/ZAgenticLoop/issues/45',
      },
      intent: 'activate_roadmap',
      payload: {
        activation_request_comment_url: 'https://github.com/jununfly/ZAgenticLoop/issues/45#issuecomment-700',
        repository: 'jununfly/ZAgenticLoop',
        target_branch: 'main',
      },
    };
    const auto = await dispatchSignal({
      root: dir,
      signal,
      mode: 'auto',
      now: '2026-07-13T00:16:00.000Z',
    });
    const contractPlanPath = auto.consumer_adapter_result.review_artifacts.find((artifact) => artifact.kind === 'contract-plan').path;
    const contractPlan = JSON.parse(await readFile(path.join(dir, contractPlanPath), 'utf8'));
    await writeFile(path.join(dir, contractPlanPath), JSON.stringify({ ...contractPlan, schema: 'broken.schema' }, null, 2));

    const executed = await dispatchSignal({
      root: dir,
      signal,
      mode: 'execute',
      now: '2026-07-13T00:17:00.000Z',
      env: { GITHUB_TOKEN: 'token' },
      fetchImpl: async () => {
        throw new Error('terminal contract failure must happen before provider API calls');
      },
    });

    assert.equal(executed.status, 'hard_stopped');
    assert.equal(executed.consumer_adapter_result.adapter_status, 'failed');
    assert.equal(executed.consumer_adapter_result.activation_lifecycle.activation_state, 'failed');
    assert.equal(executed.consumer_adapter_result.activation_lifecycle.failure_class, 'terminal');
    assert.equal(executed.consumer_adapter_result.activation_lifecycle.resume_allowed, false);
    assert.equal(executed.consumer_adapter_result.live_side_effects.attempts[0].failure_class, 'terminal');
    assert.equal(executed.consumer_adapter_result.live_side_effects.attempts[0].next_retry_allowed, false);
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

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('zj-loop-dispatch hard stops roadmap activation when activation comment URL is missing', async () => {
  const dir = await setupProject();
  try {
    const signalPath = path.join(dir, 'activation-signal.json');
    await writeFile(signalPath, JSON.stringify({
      schema: 'zj-loop.signal.v1',
      signal_id: 'sig-roadmap-missing-comment',
      source: 'github_issue',
      provider: 'github',
      subject: {
        kind: 'issue',
        id: '77',
        url: 'https://github.com/jununfly/ZAgenticLoop/issues/77',
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
      '2026-07-13T00:04:00.000Z',
    ], { encoding: 'utf8' });

    assert.equal(result.status, 2, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'hard_stopped');
    assert.equal(output.consumer_adapter_result.adapter_status, 'hard_stopped');
    assert.equal(output.consumer_adapter_result.stop_signal.reason, 'missing-activation-request-comment-url');
    assert.deepEqual(output.consumer_adapter_result.review_artifacts, []);
    assert.deepEqual(output.consumer_adapter_result.live_side_effects, {
      attempted: false,
      reason: 'hard stop before live side effects',
    });
    assert.equal(output.stop_signal.reason, 'missing-activation-request-comment-url');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-dispatch records low-risk roadmap activation input repairs', async () => {
  const dir = await setupProject();
  try {
    const signalPath = path.join(dir, 'activation-signal.json');
    await writeFile(signalPath, JSON.stringify({
      schema: 'zj-loop.signal.v1',
      signal_id: 'sig-roadmap-repaired',
      source: 'github_issue',
      provider: 'github',
      subject: {
        kind: 'issue',
        id: '88',
      },
      intent: 'activate_roadmap',
      payload: {
        repository: 'jununfly/ZAgenticLoop',
        source_comment_url: 'https://github.com/jununfly/ZAgenticLoop/issues/88#issuecomment-200',
      },
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
      '2026-07-13T00:05:00.000Z',
    ], { encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'executed_to_review_artifact');
    assert.deepEqual(
      output.consumer_adapter_result.repairs_applied.map((repair) => repair.field),
      ['activation_request_id', 'source_issue_url'],
    );

    const contractPlan = JSON.parse(await readFile(path.join(dir, output.review_artifact.path), 'utf8'));
    assert.equal(contractPlan.activationRequestId, 'sig-roadmap-repaired');
    assert.match(contractPlan.reviewContract, /"source_issue_url": "https:\/\/github\.com\/jununfly\/ZAgenticLoop\/issues\/88"/);
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
