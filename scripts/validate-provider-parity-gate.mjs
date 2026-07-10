#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ROUTE_TEMPLATE_FILES = [
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

const REQUIRED_PROVIDER_DOC_PHRASES = [
  'GitLab Target-Project Pre-Release Evidence',
  'GitLab generated files should live under `zj-loop/gitlab-ci/`',
  'Provider parity should be releasable only when a deterministic gate can answer',
  'GitHub PRs and GitLab MRs are provider carriers for the same review boundary',
];

function extractCorePackagePins(text) {
  return [...text.matchAll(/@jununfly\/zj-loop-core@([0-9]+\.[0-9]+\.[0-9]+)/g)].map((match) => match[1]);
}

function extractDispatchRouteIds(text) {
  return [...text.matchAll(/zj-loop-route dispatch ([a-z0-9-]+)/g)].map((match) => match[1]);
}

function allRoutes(routeTable) {
  return [...(routeTable.routes ?? []), ...(routeTable.disabled_dispatch_routes ?? [])];
}

function findRoute(routeTable, routeId) {
  return allRoutes(routeTable).find((route) => route.route_id === routeId);
}

export async function validateProviderParityGate(root = ROOT) {
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
  const providerDoc = await readFile(path.join(root, 'docs/designs/provider-adapter-parity-architecture.md'), 'utf8');
  const dogfoodDoc = await readFile(path.join(root, 'docs/designs/dogfood-reference-case.md'), 'utf8');

  for (const workflowFile of ROUTE_TEMPLATE_FILES) {
    const githubPath = path.join(root, 'templates/github-actions', workflowFile);
    const gitlabPath = path.join(root, 'templates/gitlab-ci', workflowFile);
    const githubTemplate = await readFile(githubPath, 'utf8');
    const gitlabTemplate = await readFile(gitlabPath, 'utf8');

    if (!gitlabTemplate.includes('# zj-loop-generated: true')) {
      errors.push(`${gitlabPath} missing generated sentinel`);
    }
    if (!gitlabTemplate.includes('stage: zj-loop')) {
      errors.push(`${gitlabPath} missing GitLab zj-loop stage`);
    }
    if (gitlabTemplate.includes('github.event') || gitlabTemplate.includes('GITHUB_TOKEN')) {
      errors.push(`${gitlabPath} contains GitHub-specific workflow syntax`);
    }

    for (const [provider, template] of [['github', githubTemplate], ['gitlab', gitlabTemplate]]) {
      for (const pin of extractCorePackagePins(template)) {
        if (pin !== expectedCoreVersion) {
          errors.push(`${provider}:${workflowFile} pins @jununfly/zj-loop-core@${pin}; expected ${expectedCoreVersion}`);
        }
      }
      for (const routeId of extractDispatchRouteIds(template)) {
        if (!findRoute(routeTable, routeId)) {
          errors.push(`${provider}:${workflowFile} dispatches unknown Route Table route: ${routeId}`);
        }
      }
    }
  }

  if (!dogfoodDoc.includes('GitLab Target-Project Pre-Release Evidence')) {
    errors.push('docs/designs/dogfood-reference-case.md missing GitLab target-project dogfood evidence');
  }

  for (const phrase of REQUIRED_PROVIDER_DOC_PHRASES) {
    if (!providerDoc.includes(phrase) && !dogfoodDoc.includes(phrase)) {
      errors.push(`provider parity docs missing: ${phrase}`);
    }
  }

  if (errors.length) throw new Error(errors.join('\n'));
  return {
    routeTemplateCount: ROUTE_TEMPLATE_FILES.length,
    coreVersion: expectedCoreVersion,
    routeCount: allRoutes(routeTable).length,
  };
}

async function main() {
  const result = await validateProviderParityGate();
  console.log(
    `Provider parity gate valid: ${result.routeTemplateCount} GitHub/GitLab route template pairs, core ${result.coreVersion}, ${result.routeCount} Route Table routes ✓`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  });
}
