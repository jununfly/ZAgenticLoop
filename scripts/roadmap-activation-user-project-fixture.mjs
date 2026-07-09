#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  buildActivationRequestComment,
  buildRoadmapActivationBranchName,
  buildRoadmapActivationPrContract,
  buildRoadmapActivationPrTitle,
  dispatchRoadmapActivationCommand,
  hasRoadmapActivationLoopMarker,
  parseStructuredActivationComments,
} from '../tools/zj-loop-core/dist/roadmap-activation-runner.js';
import {
  findRoute,
  parseRouteTable,
} from '../tools/zj-loop-core/dist/route.js';

const exec = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function validateRoadmapActivationUserProjectFixture(root = ROOT) {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-roadmap-activation-fixture-'));
  const project = path.join(dir, 'project');

  try {
    await exec(process.execPath, [path.join(root, 'tools/zj-loop-init/dist/cli.js'), project, '--add', 'github-actions']);
    const routeTablePath = path.join(project, 'zj-loop', 'zj-loop-route-table.yaml');
    const routeTableText = await readFile(routeTablePath, 'utf8');
    const enabledRouteTableText = routeTableText.replace(
      /route_id: "roadmap-sliced-development"\n    enabled: false[\s\S]*?runner: "install-ready"/,
      (match) => match
        .replace('enabled: false', 'enabled: true')
        .replace('runner: "install-ready"', 'runner: "execution-ready"'),
    );
    await writeFile(routeTablePath, enabledRouteTableText);

    const table = parseRouteTable(enabledRouteTableText);
    const route = findRoute(table, 'roadmap-sliced-development');
    const created = dispatchRoadmapActivationCommand({
      route,
      commandText: '/zj-loop start roadmap-sliced-development',
      requestedBy: 'maintainer',
      requestedByPermission: 'write',
      sourceIssue: 321,
      commandCommentId: 654,
      now: '2026-07-09T00:00:00Z',
    });
    assertFixture(created.action === 'create-request', 'activation request should be created');
    assertFixture(created.routeDecision.allowed === true, 'route decision should allow enabled route');
    const parsed = parseStructuredActivationComments([{ id: 1, body: created.commentBody }])[0];
    const activationRequestId = parsed.fields.activation_request_id;
    assertFixture(Boolean(activationRequestId), 'activation request id should be present');

    const branchName = buildRoadmapActivationBranchName({
      activationRequestId,
      title: 'Implement user project activation',
    });
    const prTitle = buildRoadmapActivationPrTitle({ title: 'Implement user project activation' });
    const prContract = buildRoadmapActivationPrContract({
      activationRequestId,
      sourceIssueUrl: 'https://github.com/example/repo/issues/321',
      sourceCommentUrl: 'https://github.com/example/repo/issues/321#issuecomment-654',
      branchName,
      lifecycleState: 'requested',
      closeoutContract: {
        activationCarrierIssue: 321,
        processRoadmapPath: 'docs/plans/roadmap-activation-321.md',
      },
    });
    assertFixture(branchName.startsWith(`zjal/${activationRequestId}-`), 'branch name should include activation id');
    assertFixture(prTitle.startsWith('Roadmap Activation:'), 'PR title should use fixed prefix');
    assertFixture(prContract.includes('zj-loop.roadmap_activation_pr_contract.v1'), 'PR contract should include schema');

    const duplicate = dispatchRoadmapActivationCommand({
      route,
      commandText: '/zj-loop start roadmap-sliced-development',
      requestedBy: 'maintainer',
      requestedByPermission: 'write',
      sourceIssue: 321,
      commandCommentId: 655,
      comments: [{ id: 1, body: created.commentBody }],
      now: '2026-07-09T00:01:00Z',
    });
    assertFixture(duplicate.action === 'duplicate', 'duplicate request should not create a new activation');

    const denied = dispatchRoadmapActivationCommand({
      route,
      commandText: '/zj-loop start roadmap-sliced-development',
      requestedBy: 'reader',
      requestedByPermission: 'read',
      sourceIssue: 322,
      commandCommentId: 656,
      now: '2026-07-09T00:02:00Z',
    });
    assertFixture(denied.action === 'denied', 'missing permission should be denied with audit evidence');

    const disabledRoute = findRoute(parseRouteTable(routeTableText), 'roadmap-sliced-development');
    const disabled = dispatchRoadmapActivationCommand({
      route: disabledRoute,
      commandText: '/zj-loop start roadmap-sliced-development',
      requestedBy: 'maintainer',
      requestedByPermission: 'write',
      sourceIssue: 323,
      commandCommentId: 657,
      now: '2026-07-09T00:03:00Z',
    });
    assertFixture(disabled.action === 'route-denied', 'disabled route should be denied');
    assertFixture(
      hasRoadmapActivationLoopMarker({ body: '<!-- zj-loop.generated.roadmap-activation -->' }),
      'loop marker should be detected',
    );

    return {
      schema: 'zj-loop.roadmap_activation_user_project_fixture.v1',
      activationRequestId,
      branchName,
      prTitle,
      scenarios: ['created', 'duplicate', 'denied', 'disabled', 'loop-marker'],
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function assertFixture(condition, message) {
  if (!condition) throw new Error(message);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  validateRoadmapActivationUserProjectFixture()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(`ERROR: ${error.message}`);
      process.exit(1);
    });
}
