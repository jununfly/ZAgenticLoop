#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

import { validateRoadmapActivationUserProjectFixture } from './roadmap-activation-user-project-fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED_WORKFLOWS = [
  'zj-loop-smoke.yml',
  'zj-loop-daily-triage.yml',
  'zj-loop-ci-sweeper.yml',
  'zj-loop-pr-steward.yml',
  'zj-loop-issue-triage.yml',
  'zj-loop-dependency-sweeper.yml',
  'zj-loop-changelog-drafter.yml',
  'zj-loop-roadmap-activation.yml',
  'zj-loop-post-merge-cleanup.yml',
];

const ACTION_READY_ROUTES = new Set([
  'ci-sweeper',
  'pr-steward-fix-request',
  'issue-triage-action',
  'issue-triage-transition',
  'dependency-sweeper',
  'changelog-drafter-draft-request',
  'roadmap-sliced-development',
  'post-merge-roadmap-closeout',
]);

const INSTALL_OR_EXECUTION_READY = new Set(['install-ready', 'execution-ready']);

function workflowTemplateHash(text) {
  const canonical = text.replace(/^# zj-loop-template-hash: .+$/m, '# zj-loop-template-hash: <computed>');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

function renderWorkflowTemplate(template) {
  return template.replace(/^# zj-loop-template-hash: .+$/m, `# zj-loop-template-hash: ${workflowTemplateHash(template)}`);
}

function extractCorePackagePins(text) {
  return [...text.matchAll(/@jununfly\/zj-loop-core@([0-9]+\.[0-9]+\.[0-9]+)/g)].map((match) => match[1]);
}

function extractDispatchRouteIds(text) {
  return [...text.matchAll(/zj-loop-route dispatch ([a-z0-9-]+)/g)].map((match) => match[1]);
}

function validateChangelogDrafterWorkflowBoundary(input) {
  const { workflowFile, source, body } = input;
  if (workflowFile !== 'zj-loop-changelog-drafter.yml') return [];
  const errors = [];
  if (!body.includes('changelog-signal.json')) {
    errors.push(`${workflowFile} ${source} must build changelog-signal.json before draft-plan evidence`);
  }
  if (!body.includes('zj-loop-dispatch --signal changelog-signal.json --mode auto')) {
    errors.push(`${workflowFile} ${source} must route draft requests through zj-loop-dispatch orchestration`);
  }
  if (!body.includes('draft-plan.json')) {
    errors.push(`${workflowFile} ${source} must upload or expose draft-plan.json`);
  }
  return errors;
}

function findRoute(routeTable, routeId) {
  return [...(routeTable.routes ?? []), ...(routeTable.disabled_dispatch_routes ?? [])]
    .find((route) => route.route_id === routeId);
}

function validateRuntimePreflightSurface(input) {
  const { corePackageJson, routeTable } = input;
  const errors = [];
  if (corePackageJson.bin?.['zj-loop-preflight'] !== './dist/preflight-cli.js') {
    errors.push('tools/zj-loop-core package bin must expose zj-loop-preflight -> ./dist/preflight-cli.js');
  }
  const roadmapRoute = findRoute(routeTable, 'roadmap-sliced-development');
  if (!roadmapRoute) return errors;
  const guards = roadmapRoute.guards ?? {};
  if (!Number.isInteger(guards.max_work_units) || guards.max_work_units <= 0) {
    errors.push('roadmap-sliced-development Route Table template must declare guards.max_work_units');
  }
  const credentials = guards.required_credentials ?? {};
  if (!Array.isArray(credentials.github) || !credentials.github.includes('GITHUB_TOKEN')) {
    errors.push('roadmap-sliced-development Route Table template must declare guards.required_credentials.github: [GITHUB_TOKEN]');
  }
  if (!Array.isArray(credentials.gitlab) || !credentials.gitlab.includes('GITLAB_TOKEN')) {
    errors.push('roadmap-sliced-development Route Table template must declare guards.required_credentials.gitlab: [GITLAB_TOKEN]');
  }
  if (!Array.isArray(guards.required_actor_roles) || guards.required_actor_roles.length === 0) {
    errors.push('roadmap-sliced-development Route Table template must declare guards.required_actor_roles');
  }
  return errors;
}

async function validateGeneratedBundleReleaseGate(root = ROOT) {
  const errors = [];
  const corePackageJson = JSON.parse(await readFile(path.join(root, 'tools/zj-loop-core/package.json'), 'utf8'));
  const expectedCoreVersion = corePackageJson.version;
  const routeTableTemplate = await readFile(path.join(root, 'templates/zj-loop-route-table.yaml.template'), 'utf8');
  const routeTable = YAML.parse(
    routeTableTemplate
      .replaceAll('__PATTERN_ID__', 'daily-triage')
      .replaceAll('__PATTERN_NAME__', 'Daily Triage')
      .replaceAll('__PATTERN_STATE__', 'zj-loop/STATE.md'),
  );
  errors.push(...validateRuntimePreflightSurface({ corePackageJson, routeTable }));

  for (const workflowFile of GENERATED_WORKFLOWS) {
    const templatePath = path.join(root, 'templates/github-actions', workflowFile);
    const generatedPath = path.join(root, '.github/workflows', workflowFile);
    const template = await readFile(templatePath, 'utf8');
    const generated = await readFile(generatedPath, 'utf8');
    const expectedGenerated = renderWorkflowTemplate(template);

    if (generated !== expectedGenerated) {
      errors.push(`${generatedPath} is not the rendered form of ${templatePath}`);
    }

    for (const [source, body] of [['template', template], ['generated workflow', generated]]) {
      errors.push(...validateChangelogDrafterWorkflowBoundary({ workflowFile, source, body }));
      if (workflowFile === 'zj-loop-changelog-drafter.yml' && body.includes('zj-loop-changelog-drafter draft-plan')) {
        errors.push(`${workflowFile} ${source} must not call zj-loop-changelog-drafter draft-plan directly; use orchestration draft-plan review artifacts`);
      }
      const pins = extractCorePackagePins(body);
      for (const pin of pins) {
        if (pin !== expectedCoreVersion) {
          errors.push(`${workflowFile} ${source} pins @jununfly/zj-loop-core@${pin}; expected ${expectedCoreVersion}`);
        }
      }
    }

    for (const routeId of extractDispatchRouteIds(template)) {
      const route = findRoute(routeTable, routeId);
      if (!route) {
        errors.push(`${workflowFile} dispatches unknown Route Table route: ${routeId}`);
        continue;
      }
      if (!INSTALL_OR_EXECUTION_READY.has(route.maturity?.runner)) {
        errors.push(`${workflowFile} dispatches ${routeId}, but template runner maturity is ${route.maturity?.runner ?? 'missing'}`);
      }
      if (ACTION_READY_ROUTES.has(routeId) && route.enabled !== false) {
        errors.push(`${routeId} must remain disabled by default in the generated Route Table template`);
      }
    }
  }

  const gitlabRootTemplate = await readFile(path.join(root, 'templates/gitlab-ci/zj-loop-root.gitlab-ci.yml'), 'utf8');
  for (const workflowFile of GENERATED_WORKFLOWS) {
    if (!gitlabRootTemplate.includes(`zj-loop/gitlab-ci/${workflowFile}`)) {
      errors.push(`templates/gitlab-ci/zj-loop-root.gitlab-ci.yml does not include ${workflowFile}`);
    }

    const gitlabTemplatePath = path.join(root, 'templates/gitlab-ci', workflowFile);
    const gitlabTemplate = await readFile(gitlabTemplatePath, 'utf8');
    if (!gitlabTemplate.includes('# zj-loop-generated: true')) {
      errors.push(`${gitlabTemplatePath} missing generated sentinel`);
    }
    if (!gitlabTemplate.includes('stage: __ZJ_LOOP_GITLAB_STAGE__')) {
      errors.push(`${gitlabTemplatePath} missing configurable GitLab stage`);
    }
    errors.push(...validateChangelogDrafterWorkflowBoundary({
      workflowFile,
      source: 'GitLab template',
      body: gitlabTemplate,
    }));
    if (workflowFile === 'zj-loop-changelog-drafter.yml' && gitlabTemplate.includes('live-draft')) {
      errors.push(`${workflowFile} GitLab template must not expose live-draft until GitLab live draft MR support is promoted`);
    }

    const pins = extractCorePackagePins(gitlabTemplate);
    for (const pin of pins) {
      if (pin !== expectedCoreVersion) {
        errors.push(`${workflowFile} GitLab template pins @jununfly/zj-loop-core@${pin}; expected ${expectedCoreVersion}`);
      }
    }

    for (const routeId of extractDispatchRouteIds(gitlabTemplate)) {
      const route = findRoute(routeTable, routeId);
      if (!route) {
        errors.push(`${workflowFile} GitLab template dispatches unknown Route Table route: ${routeId}`);
      }
    }
  }

  for (const routeId of ACTION_READY_ROUTES) {
    const route = findRoute(routeTable, routeId);
    if (!route) {
      errors.push(`Route Table template missing action-capable route: ${routeId}`);
      continue;
    }
    if (!INSTALL_OR_EXECUTION_READY.has(route.maturity?.runner)) {
      errors.push(`${routeId} runner maturity must be install-ready or execution-ready before release`);
    }
    if (route.enabled !== false) {
      errors.push(`${routeId} must be disabled by default before release`);
    }
  }

  if (errors.length) throw new Error(errors.join('\n'));
  const roadmapActivationFixture = await validateRoadmapActivationUserProjectFixture(root);
  return {
    workflowCount: GENERATED_WORKFLOWS.length,
    gitlabFragmentCount: GENERATED_WORKFLOWS.length,
    coreVersion: expectedCoreVersion,
    actionReadyRouteCount: ACTION_READY_ROUTES.size,
    roadmapActivationFixture,
  };
}

async function main() {
  const result = await validateGeneratedBundleReleaseGate();
  console.log(
    `Generated bundle release gate valid: ${result.workflowCount} GitHub workflows, ${result.gitlabFragmentCount} GitLab fragments, core ${result.coreVersion}, ${result.actionReadyRouteCount} action routes, Roadmap Activation fixture ${result.roadmapActivationFixture.activationRequestId} ✓`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  });
}

export { validateGeneratedBundleReleaseGate };
