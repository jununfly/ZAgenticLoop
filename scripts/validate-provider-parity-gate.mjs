#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

import { buildRouteFamilyProviderParityEvidence } from './route-family-provider-parity-evidence.mjs';

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

const REQUIRED_PROVIDERS = ['github', 'gitlab'];
const PROVIDER_SUPPORT_STATUSES = new Set([
  'live-supported',
  'dry-run-supported',
  'explicitly-refused-with-reason',
  'blocked-with-follow-up',
]);
const PROVIDER_EVIDENCE_PREFIXES = [
  'template:',
  'workflow:',
  'gitlab-ci:',
  'test:',
  'replay:',
  'artifact:',
  'dogfood-run:',
  'runner:',
  'docs:',
  'issue:',
  'follow-up:',
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
    if (!gitlabTemplate.includes('stage: __ZJ_LOOP_GITLAB_STAGE__') && !gitlabTemplate.includes('stage: zj-loop')) {
      errors.push(`${gitlabPath} missing configurable GitLab zj-loop stage`);
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

  validateProviderSupportInventory(routeTable, errors);
  const routeFamilyEvidence = await buildRouteFamilyProviderParityEvidence(root);
  validateRouteFamilyProviderEvidence(routeFamilyEvidence, errors);

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
    routeFamilyCount: routeFamilyEvidence.families.length,
    routeFamilyEvidenceSchema: routeFamilyEvidence.schema,
  };
}

function validateProviderSupportInventory(routeTable, errors) {
  for (const route of allRoutes(routeTable)) {
    const routeId = route.route_id ?? '<missing-route-id>';
    const support = route.provider_support;
    if (!support || typeof support !== 'object') {
      errors.push(`route ${routeId} missing provider_support`);
      continue;
    }

    for (const provider of REQUIRED_PROVIDERS) {
      const entry = support[provider];
      if (!entry || typeof entry !== 'object') {
        errors.push(`route ${routeId} missing provider_support.${provider}`);
        continue;
      }

      if (!PROVIDER_SUPPORT_STATUSES.has(entry.status)) {
        errors.push(`route ${routeId} provider_support.${provider}.status invalid: ${entry.status ?? '<missing>'}`);
      }

      const evidence = Array.isArray(entry.evidence) ? entry.evidence : [];
      if (!Array.isArray(entry.evidence)) {
        errors.push(`route ${routeId} provider_support.${provider}.evidence must be an array`);
      }
      for (const item of evidence) {
        if (typeof item !== 'string' || !PROVIDER_EVIDENCE_PREFIXES.some((prefix) => item.startsWith(prefix))) {
          errors.push(`route ${routeId} provider_support.${provider}.evidence has invalid prefix: ${String(item)}`);
        }
      }

      if (entry.status === 'live-supported' && !evidence.some((item) => item.startsWith('dogfood-run:') || item.startsWith('runner:'))) {
        errors.push(`route ${routeId} provider_support.${provider} live-supported requires runner or dogfood-run evidence`);
      }
      if (entry.status === 'dry-run-supported' && !evidence.some((item) => item.startsWith('template:') || item.startsWith('workflow:') || item.startsWith('gitlab-ci:') || item.startsWith('test:') || item.startsWith('artifact:') || item.startsWith('replay:'))) {
        errors.push(`route ${routeId} provider_support.${provider} dry-run-supported requires template, workflow, gitlab-ci, test, artifact, or replay evidence`);
      }
      if (entry.status === 'explicitly-refused-with-reason' && typeof entry.reason !== 'string') {
        errors.push(`route ${routeId} provider_support.${provider} explicitly-refused-with-reason requires reason`);
      }
      if (entry.status === 'blocked-with-follow-up') {
        if (typeof entry.blocker !== 'string') {
          errors.push(`route ${routeId} provider_support.${provider} blocked-with-follow-up requires blocker`);
        }
        if (typeof entry.follow_up !== 'string') {
          errors.push(`route ${routeId} provider_support.${provider} blocked-with-follow-up requires follow_up`);
        }
      }
    }
  }
}

function validateRouteFamilyProviderEvidence(evidence, errors) {
  if (evidence?.schema !== 'zj-loop.route_family_provider_parity_evidence.v1') {
    errors.push(`route family provider parity evidence schema invalid: ${evidence?.schema ?? '<missing>'}`);
    return;
  }

  for (const family of evidence.families ?? []) {
    const familyId = family.family_id ?? '<missing-family-id>';
    for (const provider of REQUIRED_PROVIDERS) {
      const support = family.providers?.[provider];
      if (!support) {
        errors.push(`route family ${familyId} missing ${provider} provider evidence`);
        continue;
      }
      if (!PROVIDER_SUPPORT_STATUSES.has(support.status)) {
        errors.push(`route family ${familyId}.${provider} status invalid: ${support.status ?? '<missing>'}`);
      }
      if (!Array.isArray(support.evidence_refs) || support.evidence_refs.length === 0) {
        errors.push(`route family ${familyId}.${provider} missing evidence_refs`);
      }
      if (!Array.isArray(support.gaps)) {
        errors.push(`route family ${familyId}.${provider} missing gaps array`);
      }
      if (!Array.isArray(support.next_steps) || support.next_steps.length === 0) {
        errors.push(`route family ${familyId}.${provider} missing next_steps`);
      }
    }
  }
}

async function main() {
  const result = await validateProviderParityGate();
  console.log(
    `Provider parity gate valid: ${result.routeTemplateCount} GitHub/GitLab route template pairs, core ${result.coreVersion}, ${result.routeCount} Route Table routes, ${result.routeFamilyCount} route families ✓`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  });
}
