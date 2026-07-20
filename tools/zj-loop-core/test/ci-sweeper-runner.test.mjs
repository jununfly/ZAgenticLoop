import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildCiSweeperIssueFixRequestBody,
  buildCiSweeperRepairCommands,
  buildCiSweeperRepairPlan,
  createGitLabCiSweeperIssueFixRequest,
  claimGitLabCiSweeperIssueFixRequest,
  appendGitLabCiSweeperLifecycleEvidence,
  buildCiSweeperVerifierPlan,
  buildCiSweeperRepairActionGate,
  createGitLabCiSweeperRepairMr,
  triggerGitLabCiSweeperConsumerPipeline,
  executeGitLabCiSweeperCloseout,
  formatCommandStep,
  getCiSweeperPackageBuildPlan,
  parseIssueFixRequestComments,
} from '../dist/index.js';


const CI_SWEEPER_CLI = fileURLToPath(new URL('../dist/ci-sweeper-cli.js', import.meta.url));

function gitlabRequestBody(overrides = {}) {
  return buildCiSweeperIssueFixRequestBody({
    repo: 'group/project',
    provider: 'gitlab',
    workflowName: 'zj_loop_ci_sweeper',
    runId: '789',
    sourceUrl: 'https://git.example/group/project/-/pipelines/789',
    routeDecision: {
      schema: 'zj-loop.route_decision.v1',
      decision_id: 'rd_gitlab_pipeline_789',
      signal_id: 'gitlab-pipeline:789',
      source: 'gitlab-pipeline',
      route: 'ci-sweeper',
      request_kind: 'issue-fix-request',
      requested_action: 'dispatch',
      target_consumer: 'ci-sweeper',
      allowed: true,
      status: 'pending',
      reason: 'route matched',
      evidence: ['gitlab_pipeline:789'],
      dedupe_key: 'group/project:ci-sweeper:gitlab-pipeline:789:generated-workflow',
      created_at: '2026-07-09T00:00:00Z',
      ...overrides,
    },
  });
}

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

async function setupPackage() {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-ci-sweeper-'));
  await mkdir(path.join(dir, 'tools', 'example'), { recursive: true });
  await writeFile(path.join(dir, 'tools', 'example', 'package.json'), JSON.stringify({
    name: 'example',
    scripts: { build: 'tsc' },
  }));
  return dir;
}

test('CI Sweeper repair plan is package-list driven', () => {
  assert.deepEqual(getCiSweeperPackageBuildPlan([{ directory: 'tools/example' }]), ['tools/example']);
});

test('buildCiSweeperRepairCommands exposes deterministic command order', async () => {
  const dir = await setupPackage();
  try {
    const commands = await buildCiSweeperRepairCommands({
      root: dir,
      packageDirectories: ['tools/example'],
      rootCommands: [['node', ['scripts/check-zj-loop-init-sync.mjs']]],
    });

    assert.deepEqual(commands, [
      { command: 'npm', args: ['ci'], cwd: 'tools/example' },
      { command: 'npm', args: ['run', 'build'], cwd: 'tools/example' },
      { command: 'npm', args: ['ci', '--ignore-scripts'] },
      { command: 'node', args: ['scripts/check-zj-loop-init-sync.mjs'] },
    ]);
    assert.equal(formatCommandStep(commands[0]), '(cd tools/example && npm ci)');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('buildCiSweeperRepairPlan returns versioned packaged plan', async () => {
  const dir = await setupPackage();
  try {
    const plan = await buildCiSweeperRepairPlan({
      root: dir,
      packageDirectories: ['tools/example'],
      rootInstallCommand: null,
      rootCommands: [],
    });
    assert.equal(plan.schema, 'zj-loop.ci_sweeper_repair_plan.v1');
    assert.deepEqual(plan.package_directories, ['tools/example']);
    assert.deepEqual(plan.commands.map((step) => step.command), ['npm', 'npm']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-ci-sweeper repair-plan CLI prints JSON plan', async () => {
  const dir = await setupPackage();
  try {
    const result = spawnSync(process.execPath, [
      CI_SWEEPER_CLI,
      'repair-plan',
      '--root',
      dir,
      '--packages',
      'tools/example',
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.schema, 'zj-loop.ci_sweeper_repair_plan.v1');
    assert.equal(parsed.commands[0].cwd, 'tools/example');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CI Sweeper request body carries a parseable Issue Fix Request', () => {
  const body = buildCiSweeperIssueFixRequestBody({
    repo: 'example/repo',
    workflowName: 'validate',
    runId: '123',
    sourceUrl: 'https://github.com/example/repo/actions/runs/123',
    routeDecision: {
      schema: 'zj-loop.route_decision.v1',
      decision_id: 'rd_ci_123',
      signal_id: 'ci:123',
      source: 'ci',
      route: 'ci-sweeper',
      request_kind: 'issue-fix-request',
      requested_action: 'dispatch',
      target_consumer: 'ci-sweeper',
      allowed: true,
      status: 'pending',
      reason: 'route matched',
      evidence: ['workflow_run:123'],
      dedupe_key: 'example/repo:ci-sweeper:ci:123:generated-workflow',
      created_at: '2026-07-09T00:00:00Z',
    },
  });
  const parsed = parseIssueFixRequestComments([{ id: 1, body }])[0];

  assert.equal(parsed.validation.ok, true);
  assert.equal(parsed.request.requested_consumer.consumer_id, 'ci-sweeper');
  assert.equal(parsed.request.subject.type, 'ci');
  assert.equal(parsed.request.failure_policy.retry, 'new_request_only');
  assert.deepEqual(parsed.request.fix_scope.files_or_areas, ['scripts/', '.github/workflows/', 'zj-loop/']);
});

test('CI Sweeper request body carries deterministic repair actions when explicitly supplied', () => {
  const actions = [{ action: 'update', file_path: 'zj-loop/dogfood/ci-sweeper-generated-substrate-fixture.yml', content: 'canonical\n' }];
  const body = buildCiSweeperIssueFixRequestBody({
    repo: 'group/project',
    provider: 'gitlab',
    runId: '163',
    sourceUrl: 'https://git.example/group/project/-/pipelines/163',
    repairActions: actions,
    routeDecision: { request_kind: 'issue-fix-request', target_consumer: 'ci-sweeper', dedupe_key: 'fixture-163' },
  });
  const parsed = parseIssueFixRequestComments([{ id: 163, body }])[0];

  assert.equal(parsed.validation.ok, true);
  assert.deepEqual(parsed.request.repair_actions, actions);
});

test('CI Sweeper request body rejects unsafe repair actions before carrier creation', () => {
  assert.throws(() => buildCiSweeperIssueFixRequestBody({
    repo: 'group/project',
    provider: 'gitlab',
    repairActions: [{ action: 'update', file_path: '../outside.yml', content: 'bad' }],
    routeDecision: { request_kind: 'issue-fix-request', target_consumer: 'ci-sweeper', dedupe_key: 'unsafe' },
  }), /repair-actions-invalid/);
});

test('CI Sweeper request body preserves GitLab pipeline provider evidence', () => {
  const body = buildCiSweeperIssueFixRequestBody({
    repo: 'group/subgroup/project',
    workflowName: 'zj_loop_ci_sweeper',
    runId: '789',
    sourceUrl: 'https://gitlab.com/group/subgroup/project/-/pipelines/789',
    routeDecision: {
      schema: 'zj-loop.route_decision.v1',
      decision_id: 'rd_gitlab_pipeline_789',
      signal_id: 'gitlab-pipeline:789',
      source: 'gitlab-pipeline',
      route: 'ci-sweeper',
      request_kind: 'issue-fix-request',
      requested_action: 'dispatch',
      target_consumer: 'ci-sweeper',
      allowed: true,
      status: 'pending',
      reason: 'route matched',
      evidence: ['gitlab_pipeline:789'],
      dedupe_key: 'group/subgroup/project:ci-sweeper:gitlab-pipeline:789:generated-workflow',
      created_at: '2026-07-09T00:00:00Z',
    },
  });
  const parsed = parseIssueFixRequestComments([{ id: 1, body }])[0];

  assert.equal(parsed.validation.ok, true);
  assert.equal(parsed.request.source_signal.provider, 'gitlab');
  assert.equal(parsed.request.subject.provider, 'gitlab');
  assert.equal(parsed.request.subject.source_url, 'https://gitlab.com/group/subgroup/project/-/pipelines/789');
  assert.deepEqual(parsed.request.subject.provider_metadata, {
    pipeline_id: '789',
    pipeline_url: 'https://gitlab.com/group/subgroup/project/-/pipelines/789',
  });
  assert.deepEqual(parsed.request.source_signal.provider_metadata, parsed.request.subject.provider_metadata);
  assert.deepEqual(parsed.request.fix_scope.files_or_areas, [
    'scripts/',
    '.gitlab-ci.yml',
    'zj-loop/gitlab-ci/',
    'zj-loop/',
  ]);
  assert.equal(parsed.request.fix_scope.files_or_areas.includes('.github/workflows/'), false);
});

test('GitLab CI Sweeper creates an independent Issue Fix Request carrier', async () => {
  const calls = [];
  const result = await createGitLabCiSweeperIssueFixRequest({
    projectPath: 'group/project',
    token: 'secret-token',
    title: '[Issue Fix Request] ci-sweeper: zj_loop_ci_sweeper 789',
    requestBody: gitlabRequestBody(),
    pipelineSource: 'web',
    carrierEnabled: 'true',
    carrierConfirmation: 'CREATE_GITLAB_CI_SWEEPER_CARRIER',
    apiBaseUrl: 'https://git.example/api/v4',
    fetchImpl: async (url, init = {}) => {
      calls.push({ url, init });
      if (init.method === 'POST') return response(201, { iid: 42, web_url: 'https://git.example/group/project/-/issues/42', title: 'request' });
      return response(200, []);
    },
  });

  assert.equal(result.schema, 'zj-loop.gitlab_issue_fix_request_live.v1');
  assert.equal(result.status, 'completed');
  assert.equal(result.outcome, 'created');
  assert.equal(result.issue.iid, 42);
  assert.equal(result.audit.auth_source, 'GITLAB_TOKEN');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.method, 'POST');
  assert.equal(JSON.parse(calls[1].init.body).description, gitlabRequestBody());
  assert.equal(calls[1].init.headers['PRIVATE-TOKEN'], 'secret-token');
});

test('GitLab CI Sweeper returns duplicate without creating a second carrier', async () => {
  const calls = [];
  const body = gitlabRequestBody();
  const result = await createGitLabCiSweeperIssueFixRequest({
    projectPath: 'group/project',
    token: 'secret-token',
    title: 'duplicate request',
    requestBody: body,
    pipelineSource: 'web',
    carrierEnabled: 'true',
    carrierConfirmation: 'CREATE_GITLAB_CI_SWEEPER_CARRIER',
    apiBaseUrl: 'https://git.example/api/v4',
    fetchImpl: async (url, init = {}) => {
      calls.push({ url, init });
      return response(200, [{ iid: 42, web_url: 'https://git.example/group/project/-/issues/42', title: 'existing', description: body }]);
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.outcome, 'duplicate');
  assert.equal(result.issue.iid, 42);
  assert.equal(calls.length, 1);
});

test('GitLab CI Sweeper blocks carrier creation without GITLAB_TOKEN', async () => {
  let calls = 0;
  const result = await createGitLabCiSweeperIssueFixRequest({
    projectPath: 'group/project',
    title: 'blocked',
    requestBody: gitlabRequestBody(),
    pipelineSource: 'web',
    carrierEnabled: 'true',
    carrierConfirmation: 'CREATE_GITLAB_CI_SWEEPER_CARRIER',
    fetchImpl: async () => { calls += 1; return response(200, []); },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'gitlab-token-required');
  assert.equal(calls, 0);
});

test('GitLab CI Sweeper recovers an uncertain carrier write by re-reading once', async () => {
  const body = gitlabRequestBody();
  let reads = 0;
  const result = await createGitLabCiSweeperIssueFixRequest({
    projectPath: 'group/project',
    token: 'secret-token',
    title: 'uncertain request',
    requestBody: body,
    pipelineSource: 'web',
    carrierEnabled: 'true',
    carrierConfirmation: 'CREATE_GITLAB_CI_SWEEPER_CARRIER',
    fetchImpl: async (url, init = {}) => {
      if (init.method === 'POST') throw new Error('connection reset after write');
      reads += 1;
      return response(200, reads === 2 ? [{ iid: 43, web_url: 'https://git.example/group/project/-/issues/43', description: body }] : []);
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.outcome, 'recovered-duplicate');
  assert.equal(result.issue.iid, 43);
  assert.equal(reads, 2);
});

test('zj-loop-ci-sweeper request-body CLI writes issue body', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-ci-sweeper-request-body-'));
  const routeDecisionPath = path.join(dir, 'route-decision.json');
  const outPath = path.join(dir, 'issue-body.md');
  await writeFile(routeDecisionPath, JSON.stringify({
    schema: 'zj-loop.route_decision.v1',
    decision_id: 'rd_ci_456',
    signal_id: 'ci:456',
    source: 'ci',
    route: 'ci-sweeper',
    request_kind: 'issue-fix-request',
    requested_action: 'dispatch',
    target_consumer: 'ci-sweeper',
    allowed: true,
    status: 'pending',
    reason: 'route matched',
    evidence: ['workflow_run:456'],
    dedupe_key: 'example/repo:ci-sweeper:ci:456:generated-workflow',
  }));
  try {
    const result = spawnSync(process.execPath, [
      CI_SWEEPER_CLI,
      'request-body',
      '--route-decision',
      routeDecisionPath,
      '--repo',
      'example/repo',
      '--workflow',
      'validate',
      '--run-id',
      '456',
      '--out',
      outPath,
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).written, true);
    const body = await readFile(outPath, 'utf8');
    assert.equal(parseIssueFixRequestComments([{ id: 1, body }])[0].validation.ok, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-ci-sweeper request-body CLI accepts explicit GitLab provider', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-ci-sweeper-gitlab-request-body-'));
  const routeDecisionPath = path.join(dir, 'route-decision.json');
  const outPath = path.join(dir, 'issue-body.md');
  await writeFile(routeDecisionPath, JSON.stringify({
    schema: 'zj-loop.route_decision.v1',
    decision_id: 'rd_gitlab_456',
    signal_id: 'gitlab-pipeline:456',
    source: 'pipeline',
    route: 'ci-sweeper',
    request_kind: 'issue-fix-request',
    requested_action: 'dispatch',
    target_consumer: 'ci-sweeper',
    allowed: true,
    status: 'pending',
    reason: 'route matched',
    evidence: ['pipeline:456'],
    dedupe_key: 'group/project:ci-sweeper:gitlab-pipeline:456:generated-workflow',
  }));
  try {
    const result = spawnSync(process.execPath, [
      CI_SWEEPER_CLI,
      'request-body',
      '--route-decision',
      routeDecisionPath,
      '--repo',
      'group/project',
      '--provider',
      'gitlab',
      '--workflow',
      'validate',
      '--run-id',
      '456',
      '--out',
      outPath,
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const body = await readFile(outPath, 'utf8');
    const parsed = parseIssueFixRequestComments([{ id: 1, body }])[0];
    assert.equal(parsed.validation.ok, true);
    assert.equal(parsed.request.subject.provider, 'gitlab');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-ci-sweeper GitLab carrier CLI fails closed without GITLAB_TOKEN', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-ci-sweeper-gitlab-carrier-cli-'));
  const requestPath = path.join(dir, 'issue-fix-request.md');
  await writeFile(requestPath, gitlabRequestBody());
  try {
    const result = spawnSync(process.execPath, [
      CI_SWEEPER_CLI,
      'gitlab-issue-fix-request',
      '--request-body', requestPath,
      '--project', 'group/project',
      '--title', 'Issue Fix Request',
      '--pipeline-source', 'web',
      '--carrier-enabled', 'true',
      '--carrier-confirmation', 'CREATE_GITLAB_CI_SWEEPER_CARRIER',
      '--json',
    ], { encoding: 'utf8', env: { ...process.env, GITLAB_TOKEN: '' } });
    assert.equal(result.status, 2);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.status, 'blocked');
    assert.equal(parsed.reason, 'gitlab-token-required');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('GitLab CI Sweeper claims a request with an append-only marker and re-read winner check', async () => {
  const body = gitlabRequestBody();
  const requestId = parseIssueFixRequestComments([{ id: null, body }])[0].request.request_id;
  const notes = [];
  const calls = [];
  const result = await claimGitLabCiSweeperIssueFixRequest({
    projectPath: 'group/project',
    issueIid: 42,
    token: 'secret-token',
    requestId,
    claimId: 'claim-42',
    sourcePipelineId: '9001',
    apiBaseUrl: 'https://git.example/api/v4',
    fetchImpl: async (url, init = {}) => {
      calls.push({ url, init });
      if (url.endsWith('/issues/42')) return response(200, { iid: 42, description: body });
      if (url.endsWith('/issues/42/notes') && init.method === 'POST') {
        const note = { id: 100, body: String(JSON.parse(init.body).body) };
        notes.push(note);
        return response(201, note);
      }
      if (url.includes('/issues/42/notes')) return response(200, notes);
      throw new Error(`unexpected url ${url}`);
    },
  });

  assert.equal(result.schema, 'zj-loop.gitlab_ci_sweeper_claim.v1');
  assert.equal(result.status, 'completed');
  assert.equal(result.outcome, 'claimed');
  assert.equal(result.claim.claim_id, 'claim-42');
  assert.equal(result.claim.request_id, requestId);
  assert.equal(calls.filter((call) => call.init.method === 'POST').length, 1);
  assert.match(notes[0].body, /zj-loop:ci-sweeper-claim/);
});

test('GitLab CI Sweeper returns duplicate when a request already has a claim', async () => {
  const body = gitlabRequestBody();
  const requestId = parseIssueFixRequestComments([{ id: null, body }])[0].request.request_id;
  const existingClaim = `<!-- zj-loop:ci-sweeper-claim\n{"schema":"zj-loop.gitlab_ci_sweeper_claim.v1","request_id":"${requestId}","claim_id":"claim-existing","consumer_id":"ci-sweeper","status":"claimed","source_pipeline_id":"8999"}\n-->`;
  let posts = 0;
  const result = await claimGitLabCiSweeperIssueFixRequest({
    projectPath: 'group/project',
    issueIid: 42,
    token: 'secret-token',
    requestId,
    claimId: 'claim-new',
    sourcePipelineId: '9001',
    fetchImpl: async (url, init = {}) => {
      if (url.endsWith('/issues/42')) return response(200, { iid: 42, description: body });
      if (init.method === 'POST') { posts += 1; return response(201, {}); }
      return response(200, [{ id: 99, body: existingClaim }]);
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.outcome, 'duplicate');
  assert.equal(result.claim.claim_id, 'claim-existing');
  assert.equal(posts, 0);
});

test('GitLab CI Sweeper rejects a request whose project does not match the consumer project', async () => {
  const body = buildCiSweeperIssueFixRequestBody({
    repo: 'other/project',
    provider: 'gitlab',
    workflowName: 'ci',
    runId: '1',
    sourceUrl: 'https://git.example/other/project/-/pipelines/1',
    routeDecision: { request_kind: 'issue-fix-request', target_consumer: 'ci-sweeper', dedupe_key: 'other' },
  });
  let posts = 0;
  const result = await claimGitLabCiSweeperIssueFixRequest({
    projectPath: 'group/project',
    issueIid: 42,
    token: 'secret-token',
    requestId: 'ifr_other',
    claimId: 'claim-mismatch',
    sourcePipelineId: '1',
    fetchImpl: async (url, init = {}) => {
      if (url.endsWith('/issues/42')) return response(200, { iid: 42, description: body });
      if (init.method === 'POST') posts += 1;
      return response(200, []);
    },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'request-source-mismatch');
  assert.equal(posts, 0);
});

test('GitLab CI Sweeper refuses claim before verifier gates pass', async () => {
  const body = gitlabRequestBody();
  const requestId = parseIssueFixRequestComments([{ id: null, body }])[0].request.request_id;
  let posts = 0;
  const result = await claimGitLabCiSweeperIssueFixRequest({
    projectPath: 'group/project',
    issueIid: 42,
    token: 'secret-token',
    requestId,
    claimId: 'claim-verifier-blocked',
    sourcePipelineId: '9001',
    route: {
      guards: {
        verification_gate_allowlist: [
          { id: 'zagenticloop-validate', command: 'bash', args: ['scripts/ci-validate-gates.sh'], cwd: '.' },
          { id: 'zagenticloop-audit', command: 'bash', args: ['scripts/ci-audit-gates.sh'], cwd: '.' },
        ],
        repair_actions: ['update'],
        repair_scope: ['zj-loop/'],
      },
    },
    fetchImpl: async (url, init = {}) => {
      if (url.endsWith('/issues/42')) return response(200, { iid: 42, description: body });
      if (init.method === 'POST') posts += 1;
      return response(200, []);
    },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'verifier-blocked');
  assert.equal(result.action_gate.status, 'blocked');
  assert.equal(posts, 0);
});

test('GitLab CI Sweeper appends lifecycle evidence only for an existing claim', async () => {
  const posted = [];
  const requestId = 'ifr_36d6d3ad2d0a';
  const claimBody = `<!-- zj-loop:ci-sweeper-claim\n{"schema":"zj-loop.gitlab_ci_sweeper_claim.v1","request_id":"${requestId}","claim_id":"claim-42","consumer_id":"ci-sweeper","status":"claimed"}\n-->`;
  const result = await appendGitLabCiSweeperLifecycleEvidence({
    projectPath: 'group/project',
    issueIid: 42,
    token: 'secret-token',
    requestId: 'ifr_36d6d3ad2d0a',
    claimId: 'claim-42',
    status: 'completed',
    evidence: { repair_mr: 'https://git.example/group/project/-/merge_requests/5' },
    fetchImpl: async (url, init = {}) => {
      if (url.includes('/issues/42/notes') && !init.method) return response(200, [{ id: 10, body: claimBody }]);
      if (init.method === 'POST') {
        const note = { id: 11, body: JSON.parse(init.body).body };
        posted.push(note);
        return response(201, note);
      }
      throw new Error(`unexpected url ${url}`);
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.outcome, 'lifecycle-appended');
  assert.equal(result.lifecycle.status, 'completed');
  assert.equal(posted.length, 1);
  assert.match(posted[0].body, /zj-loop:ci-sweeper-lifecycle/);
});

test('CI Sweeper verifier plan accepts only the exact request and Route Table gate intersection', () => {
  const gate = { id: 'project-test', command: 'pnpm', args: ['test'], cwd: '.' };
  const result = buildCiSweeperVerifierPlan({
    request: { verification_gate: { commands: [gate] } },
    route: { guards: { verification_gate_allowlist: [gate] } },
  });

  assert.equal(result.schema, 'zj-loop.ci_sweeper_verifier_plan.v1');
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.commands, [gate]);
});

test('CI Sweeper verifier plan refuses an unallowlisted or shell-string gate', () => {
  const result = buildCiSweeperVerifierPlan({
    request: { verification_gate: { commands: ['pnpm test', { id: 'unknown', command: 'npm', args: ['test'], cwd: '.' }] } },
    route: { guards: { verification_gate_allowlist: [{ id: 'project-test', command: 'pnpm', args: ['test'], cwd: '.' }] } },
  });

  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.refusals, ['verification-command-must-be-structured:0', 'verification-command-not-allowlisted:unknown']);
});

test('CI Sweeper repair action gate enforces allowlisted actions and repository-relative files', () => {
  const result = buildCiSweeperRepairActionGate({
    request: {
      repair_actions: [
        { action: 'update', path: 'zj-loop/gitlab-ci/example.yml' },
        { action: 'delete', path: '../secrets.env' },
      ],
    },
    route: { guards: { repair_actions: ['create', 'update', 'delete', 'move', 'chmod'], repair_scope: ['zj-loop/'] } },
    changedFiles: ['zj-loop/gitlab-ci/example.yml'],
  });

  assert.equal(result.status, 'blocked');
  assert.ok(result.refusals.includes('repair-action-path-escapes-repository:../secrets.env'));
  assert.ok(result.refusals.includes('repair-action-scope-mismatch:../secrets.env'));
});

test('CI Sweeper repair action gate accepts GitLab file_path actions', () => {
  const result = buildCiSweeperRepairActionGate({
    request: { repair_actions: [{ action: 'update', file_path: 'zj-loop/dogfood/fixture.yml', content: 'fixed' }] },
    route: { guards: { repair_actions: ['update'], repair_scope: ['zj-loop/'] } },
    changedFiles: ['zj-loop/dogfood/fixture.yml'],
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.refusals, []);
});

test('GitLab CI Sweeper API adapter creates commit-backed repair MR from target branch', async () => {
  const calls = [];
  const result = await createGitLabCiSweeperRepairMr({
    projectPath: 'group/project',
    token: 'secret-token',
    branch: 'automated/ci-sweeper-gitlab-789-abcd1234',
    targetBranch: 'master',
    commitMessage: 'Repair generated GitLab substrate',
    title: 'fix: repair generated GitLab substrate',
    description: 'Issue Fix Request: #42',
    actions: [{ action: 'update', file_path: 'zj-loop/gitlab-ci/example.yml', content: 'fixed\n' }],
    fetchImpl: async (url, init = {}) => {
      calls.push({ url, init });
      if (url.includes('/merge_requests?')) return response(200, []);
      if (url.includes('/repository/files/')) return response(200, { content: Buffer.from('old\n').toString('base64') });
      if (url.endsWith('/repository/branches')) return response(201, { name: 'branch' });
      if (url.includes('/repository/branches/')) return response(200, { name: 'branch' });
      if (url.endsWith('/commits')) return response(201, { id: 'commit-sha' });
      if (url.endsWith('/merge_requests')) return response(201, { iid: 5, web_url: 'https://git.example/group/project/-/merge_requests/5' });
      throw new Error(`unexpected url ${url}`);
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.outcome, 'created');
  assert.equal(result.merge_request.iid, 5);
  assert.deepEqual(JSON.parse(calls.find((call) => call.url.endsWith('/commits')).init.body).actions, [{ action: 'update', file_path: 'zj-loop/gitlab-ci/example.yml', content: 'fixed\n' }]);
  const commitPayload = JSON.parse(calls.find((call) => call.url.endsWith('/commits')).init.body);
  assert.equal(commitPayload.start_branch, undefined);
  assert.equal(calls.filter((call) => call.init.method === 'POST').length, 3);
});

test('GitLab CI Sweeper API adapter refuses a repair action with no effective diff', async () => {
  const calls = [];
  const result = await createGitLabCiSweeperRepairMr({
    projectPath: 'group/project',
    token: 'secret-token',
    branch: 'automated/ci-sweeper-gitlab-789-noop000',
    targetBranch: 'master',
    commitMessage: 'unused',
    title: 'unused',
    description: 'unused',
    actions: [{ action: 'update', file_path: 'zj-loop/gitlab-ci/example.yml', content: 'same\n' }],
    fetchImpl: async (url, init = {}) => {
      calls.push({ url, init });
      if (url.includes('/repository/files/')) return response(200, { content: Buffer.from('same\n').toString('base64') });
      if (url.includes('/merge_requests?')) return response(200, []);
      throw new Error(`unexpected url ${url}`);
    },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'repair-no-effective-diff');
  assert.equal(calls.filter((call) => call.init.method === 'POST').length, 0);
});

test('GitLab CI Sweeper API adapter returns duplicate for an existing source branch MR', async () => {
  let writes = 0;
  const result = await createGitLabCiSweeperRepairMr({
    projectPath: 'group/project',
    token: 'secret-token',
    branch: 'automated/ci-sweeper-gitlab-789-abcd1234',
    targetBranch: 'master',
    commitMessage: 'unused',
    title: 'unused',
    description: 'unused',
    actions: [{ action: 'update', file_path: 'zj-loop/example.yml', content: 'fixed\n' }],
    fetchImpl: async (url, init = {}) => {
      if (init.method === 'POST') writes += 1;
      return response(200, [{ iid: 5, web_url: 'https://git.example/group/project/-/merge_requests/5', source_branch: 'automated/ci-sweeper-gitlab-789-abcd1234' }]);
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.outcome, 'duplicate');
  assert.equal(result.merge_request.iid, 5);
  assert.equal(writes, 0);
});

test('GitLab CI Sweeper closeout refuses without the fixed confirmation before any write', async () => {
  let writes = 0;
  const result = await executeGitLabCiSweeperCloseout({
    projectPath: 'group/project',
    mergeRequestIid: 309,
    issueIid: 185,
    requestId: 'ifr_closeout',
    branch: 'automated/ci-sweeper-gitlab-10513928-64ffecc0',
    targetBranch: 'master',
    token: 'secret-token',
    confirmationPhrase: 'wrong',
    fetchImpl: async (_url, init = {}) => {
      if (init.method) writes += 1;
      return response(200, {});
    },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'confirmation-required');
  assert.equal(result.side_effects_executed, false);
  assert.equal(writes, 0);
});

test('GitLab CI Sweeper closeout rejects a mismatched MR source before any write', async () => {
  let writes = 0;
  const result = await executeGitLabCiSweeperCloseout({
    projectPath: 'group/project',
    mergeRequestIid: 309,
    issueIid: 185,
    requestId: 'ifr_closeout',
    branch: 'automated/ci-sweeper-gitlab-10513928-64ffecc0',
    targetBranch: 'master',
    token: 'secret-token',
    confirmationPhrase: 'DELETE_MERGED_ROADMAP_BRANCH_AND_CLOSE_CARRIER',
    fetchImpl: async (url, init = {}) => {
      if (init.method) writes += 1;
      if (url.endsWith('/merge_requests/309')) return response(200, {
        iid: 309, state: 'merged', merged_at: '2026-07-16T00:00:00Z',
        source_branch: 'automated/other', target_branch: 'master', description: 'ifr_closeout',
      });
      return response(200, {});
    },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'request-source-mismatch');
  assert.equal(writes, 0);
});

test('GitLab CI Sweeper closeout deletes its repair branch and closes its matching carrier', async () => {
  const calls = [];
  const requestBody = gitlabRequestBody();
  const requestId = parseIssueFixRequestComments([{ id: null, body: requestBody }])[0].request.request_id;
  const branch = 'automated/ci-sweeper-gitlab-10513928-64ffecc0';
  const result = await executeGitLabCiSweeperCloseout({
    projectPath: 'group/project',
    mergeRequestIid: 309,
    issueIid: 185,
    requestId,
    branch,
    targetBranch: 'master',
    token: 'secret-token',
    confirmationPhrase: 'DELETE_MERGED_ROADMAP_BRANCH_AND_CLOSE_CARRIER',
    apiBaseUrl: 'https://git.example/api/v4',
    fetchImpl: async (url, init = {}) => {
      calls.push({ url, init });
      if (url.endsWith('/merge_requests/309')) return response(200, {
        iid: 309, state: 'merged', merged_at: '2026-07-16T00:00:00Z',
        source_branch: branch, target_branch: 'master', description: `Issue Fix Request ${requestId}`,
        web_url: 'https://git.example/group/project/-/merge_requests/309',
      });
      if (url.endsWith('/issues/185')) return response(200, { iid: 185, state: 'opened', description: requestBody });
      if (url.includes('/issues/185/notes')) return response(200, [{
        body: `<!-- zj-loop:ci-sweeper-claim\n${JSON.stringify({ request_id: requestId, claim_id: 'claim-10513928', status: 'claimed' })}\n-->`,
      }]);
      if (url.endsWith(`/repository/branches/${encodeURIComponent(branch)}`)) return response(200, { name: branch });
      if (init.method === 'DELETE') return response(204, {});
      if (init.method === 'POST') return response(201, { id: 999 });
      if (init.method === 'PUT') return response(200, { iid: 185, state: 'closed' });
      throw new Error(`unexpected url ${url}`);
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.outcome, 'closed');
  assert.equal(result.side_effects_executed, true);
  assert.equal(calls.filter((call) => call.init.method === 'DELETE').length, 1);
  assert.equal(calls.filter((call) => call.init.method === 'POST').length, 1);
  assert.equal(calls.filter((call) => call.init.method === 'PUT').length, 1);
  assert.match(calls.find((call) => call.init.method === 'POST').init.body, /post-merge-closeout/);
});

test('GitLab CI Sweeper closeout rejects a non-CI-Sweeper branch before any write', async () => {
  let calls = 0;
  const result = await executeGitLabCiSweeperCloseout({
    projectPath: 'group/project',
    mergeRequestIid: 309,
    issueIid: 185,
    requestId: 'ifr_closeout',
    branch: 'zjal-roadmap-branch',
    targetBranch: 'master',
    token: 'secret-token',
    confirmationPhrase: 'DELETE_MERGED_ROADMAP_BRANCH_AND_CLOSE_CARRIER',
    fetchImpl: async () => { calls += 1; return response(200, {}); },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'repair-branch-invalid');
  assert.equal(calls, 0);
});

test('GitLab CI Sweeper API adapter refuses unsafe actions before any write', async () => {
  let calls = 0;
  const result = await createGitLabCiSweeperRepairMr({
    projectPath: 'group/project',
    token: 'secret-token',
    branch: 'automated/ci-sweeper-gitlab-789-abcd1234',
    targetBranch: 'master',
    commitMessage: 'unused',
    title: 'unused',
    description: 'unused',
    actions: [{ action: 'update', file_path: '../secrets.env', content: 'bad' }],
    fetchImpl: async () => { calls += 1; return response(200, []); },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'commit-actions-invalid');
  assert.equal(calls, 0);
});

test('GitLab CI Sweeper consumer trigger passes explicit identities to fixed ref', async () => {
  let request;
  const result = await triggerGitLabCiSweeperConsumerPipeline({
    projectPath: 'group/project',
    token: 'secret-token',
    ref: 'main',
    issueIid: 163,
    requestId: 'ifr_fixture',
    claimId: 'claim_fixture',
    apiBaseUrl: 'https://git.example/api/v4',
    fetchImpl: async (url, init = {}) => {
      request = { url, init };
      return response(201, { id: 9002, web_url: 'https://git.example/group/project/-/pipelines/9002', ref: 'main', source: 'api' });
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.pipeline.id, 9002);
  assert.equal(JSON.parse(request.init.body).ref, 'main');
  assert.deepEqual(JSON.parse(request.init.body).variables, [
    { key: 'ZJ_LOOP_CI_SWEEPER_REQUEST_ISSUE_IID', value: '163' },
    { key: 'ZJ_LOOP_CI_SWEEPER_REQUEST_ID', value: 'ifr_fixture' },
    { key: 'ZJ_LOOP_CI_SWEEPER_CLAIM_ID', value: 'claim_fixture' },
  ]);
});
