#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

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
  'dependency-sweeper',
  'changelog-drafter-draft-request',
  'roadmap-sliced-development',
  'post-merge-roadmap-closeout',
]);

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

function findRoute(routeTable, routeId) {
  return [...(routeTable.routes ?? []), ...(routeTable.disabled_dispatch_routes ?? [])]
    .find((route) => route.route_id === routeId);
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
      if (route.maturity?.runner !== 'user-project-ready') {
        errors.push(`${workflowFile} dispatches ${routeId}, but template runner maturity is ${route.maturity?.runner ?? 'missing'}`);
      }
      if (ACTION_READY_ROUTES.has(routeId) && route.enabled !== false) {
        errors.push(`${routeId} must remain disabled by default in the generated Route Table template`);
      }
    }
  }

  for (const routeId of ACTION_READY_ROUTES) {
    const route = findRoute(routeTable, routeId);
    if (!route) {
      errors.push(`Route Table template missing action-capable route: ${routeId}`);
      continue;
    }
    if (route.maturity?.runner !== 'user-project-ready') {
      errors.push(`${routeId} runner maturity must be user-project-ready before release`);
    }
    if (route.enabled !== false) {
      errors.push(`${routeId} must be disabled by default before release`);
    }
  }

  if (errors.length) throw new Error(errors.join('\n'));
  return {
    workflowCount: GENERATED_WORKFLOWS.length,
    coreVersion: expectedCoreVersion,
    actionReadyRouteCount: ACTION_READY_ROUTES.size,
  };
}

async function main() {
  const result = await validateGeneratedBundleReleaseGate();
  console.log(
    `Generated bundle release gate valid: ${result.workflowCount} workflows, core ${result.coreVersion}, ${result.actionReadyRouteCount} action routes ✓`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  });
}

export { validateGeneratedBundleReleaseGate };
