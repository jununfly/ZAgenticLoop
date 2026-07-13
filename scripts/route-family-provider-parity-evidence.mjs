#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import YAML from 'yaml';

import { replayGitLabProviderDogfood } from './gitlab-provider-dogfood-replay.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROVIDERS = ['github', 'gitlab'];
const FAMILY_DOC_LABELS = new Map([
  ['daily-triage', 'Daily Triage'],
  ['manual-smoke', 'Manual smoke/report-only'],
  ['issue-triage', 'Issue Backlog Triage'],
  ['issue-triage-action', 'Issue Triage Action'],
  ['issue-triage-transition', 'Issue Triage Transition'],
  ['pr-steward', 'PR/MR Steward'],
  ['ci-sweeper', 'CI Sweeper'],
  ['dependency-sweeper', 'Dependency Sweeper'],
  ['changelog-drafter', 'Changelog Drafter'],
  ['roadmap-sliced-development', 'Roadmap Activation'],
  ['post-merge-cleanup', 'Post-Merge Closeout'],
]);

const DOGFOOD_REPLAY_FAMILIES = new Set([
  'ci-sweeper',
  'roadmap-sliced-development',
  'post-merge-cleanup',
  'pr-steward',
]);

export async function buildRouteFamilyProviderParityEvidence(root = ROOT) {
  const routeTable = await readRouteTable(root);
  const templateCoverage = await readTemplateCoverage(root);
  const docsText = await readProviderDocs(root);
  const replay = replayGitLabProviderDogfood();
  const families = aggregateFamilies(routeTable).map((family) => {
    const docLabel = FAMILY_DOC_LABELS.get(family.family_id) ?? family.family_id;
    const docCovered = docsText.includes(docLabel) || docsText.includes(family.family_id);
    const dogfoodCovered = DOGFOOD_REPLAY_FAMILIES.has(family.family_id) && replay.schema === 'zj-loop.gitlab_provider_dogfood_replay.v1';
    return {
      family_id: family.family_id,
      consumer_kind: family.consumer_kind,
      routes: family.routes.map((route) => route.route_id),
      providers: Object.fromEntries(PROVIDERS.map((provider) => [
        provider,
        buildProviderFamilyEvidence({
          provider,
          family,
          templateCoverage,
          docCovered,
          dogfoodCovered: provider === 'gitlab' ? dogfoodCovered : false,
        }),
      ])),
    };
  });

  return {
    schema: 'zj-loop.route_family_provider_parity_evidence.v1',
    generated_at: new Date(0).toISOString(),
    providers: PROVIDERS,
    source_of_truth: {
      route_table: 'zj-loop/zj-loop-route-table.yaml',
      generated_templates: ['templates/github-actions/', 'templates/gitlab-ci/'],
      dogfood_replay: 'scripts/gitlab-provider-dogfood-replay.mjs',
      durable_docs: [
        'docs/designs/provider-adapter-parity-architecture.md',
        'docs/designs/dogfood-reference-case.md',
      ],
    },
    families,
  };
}

async function readRouteTable(root) {
  let text;
  try {
    text = await readFile(path.join(root, 'zj-loop', 'zj-loop-route-table.yaml'), 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    text = await readFile(path.join(root, 'templates', 'zj-loop-route-table.yaml.template'), 'utf8');
    text = text
      .replaceAll('__PATTERN_ID__', 'daily-triage')
      .replaceAll('__PATTERN_NAME__', 'Daily Triage')
      .replaceAll('__PATTERN_STATE__', 'zj-loop/STATE.md');
  }
  const table = YAML.parse(text);
  return [...(table.routes ?? []), ...(table.disabled_dispatch_routes ?? [])];
}

async function readTemplateCoverage(root) {
  const coverage = { github: new Set(), gitlab: new Set() };
  for (const [provider, dir] of [
    ['github', 'github-actions'],
    ['gitlab', 'gitlab-ci'],
  ]) {
    const fullDir = path.join(root, 'templates', dir);
    const files = await readdir(fullDir);
    for (const file of files.filter((name) => name.endsWith('.yml'))) {
      const text = await readFile(path.join(fullDir, file), 'utf8');
      for (const routeId of extractDispatchRouteIds(text)) {
        coverage[provider].add(routeId);
      }
    }
  }
  return coverage;
}

async function readProviderDocs(root) {
  const docs = await Promise.all([
    readFile(path.join(root, 'docs', 'designs', 'provider-adapter-parity-architecture.md'), 'utf8'),
    readFile(path.join(root, 'docs', 'designs', 'dogfood-reference-case.md'), 'utf8'),
  ]);
  return docs.join('\n');
}

function aggregateFamilies(routes) {
  const families = new Map();
  for (const route of routes) {
    const familyId = route.consumer ?? route.route_id;
    const existing = families.get(familyId) ?? {
      family_id: familyId,
      consumer_kind: route.consumer_kind ?? 'unknown',
      routes: [],
    };
    existing.routes.push(route);
    if (existing.consumer_kind === 'unknown' && route.consumer_kind) {
      existing.consumer_kind = route.consumer_kind;
    }
    families.set(familyId, existing);
  }
  return [...families.values()].sort((left, right) => left.family_id.localeCompare(right.family_id));
}

function buildProviderFamilyEvidence({ provider, family, templateCoverage, docCovered, dogfoodCovered }) {
  const routeEntries = family.routes.map((route) => ({
    route_id: route.route_id,
    status: route.provider_support?.[provider]?.status ?? 'blocked-with-follow-up',
    evidence: route.provider_support?.[provider]?.evidence ?? [],
    reason: route.provider_support?.[provider]?.reason,
    blocker: route.provider_support?.[provider]?.blocker,
    follow_up: route.provider_support?.[provider]?.follow_up,
  }));
  const evidenceRefs = new Set(routeEntries.flatMap((entry) => entry.evidence));
  const routeIds = family.routes.map((route) => route.route_id);
  const templateCovered = routeIds.some((routeId) => templateCoverage[provider]?.has(routeId));
  if (templateCovered) evidenceRefs.add(`${provider === 'github' ? 'workflow' : 'gitlab-ci'}:generated-route-template`);
  if (docCovered) evidenceRefs.add('docs:provider-adapter-parity-architecture');
  if (dogfoodCovered) evidenceRefs.add('replay:gitlab-provider-dogfood-replay');

  const statuses = routeEntries.map((entry) => entry.status);
  const status = summarizeStatus(statuses);
  const gaps = buildGaps({ provider, status, templateCovered, docCovered, dogfoodCovered });
  const nextSteps = buildNextSteps(gaps, status);

  return {
    status,
    route_statuses: routeEntries,
    evidence_refs: [...evidenceRefs].sort(),
    template_covered: templateCovered,
    dogfood_replay_covered: dogfoodCovered,
    docs_covered: docCovered,
    gaps,
    next_steps: nextSteps,
  };
}

function extractDispatchRouteIds(text) {
  return [...text.matchAll(/zj-loop-route dispatch ([a-z0-9-]+)/g)].map((match) => match[1]);
}

function summarizeStatus(statuses) {
  if (statuses.includes('blocked-with-follow-up')) return 'blocked-with-follow-up';
  if (statuses.includes('explicitly-refused-with-reason')) return 'explicitly-refused-with-reason';
  if (statuses.includes('dry-run-supported')) return 'dry-run-supported';
  if (statuses.every((status) => status === 'live-supported')) return 'live-supported';
  if (statuses.includes('live-supported')) return 'dry-run-supported';
  return statuses[0] ?? 'blocked-with-follow-up';
}

function buildGaps({ provider, status, templateCovered, docCovered, dogfoodCovered }) {
  const gaps = [];
  if (!templateCovered) gaps.push(`${provider} generated route template coverage is absent`);
  if (!docCovered) gaps.push('durable provider parity docs do not mention this route family');
  if (provider === 'gitlab' && !dogfoodCovered) gaps.push('gitlab deterministic dogfood replay does not cover this route family');
  if (status !== 'live-supported') gaps.push(`${provider} live parity is not established by this evidence inventory`);
  return gaps;
}

function buildNextSteps(gaps, status) {
  if (gaps.length === 0) return ['Keep deterministic replay and provider support evidence current.'];
  const steps = ['Review provider_support evidence refs and decide whether the gap is acceptable, refused, blocked, or ready for a follow-up slice.'];
  if (status !== 'live-supported') {
    steps.push('Do not promote live provider parity until route-specific runner evidence exists.');
  }
  return steps;
}

async function main() {
  const evidence = await buildRouteFamilyProviderParityEvidence();
  console.log(JSON.stringify(evidence, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  });
}
