#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED_PROVIDERS = ['github', 'gitlab'];
const PROVIDER_SUPPORT_STATUSES = new Set([
  'live-supported',
  'dry-run-supported',
  'explicitly-refused-with-reason',
  'blocked-with-follow-up',
]);
const MATURITY_LEVELS = new Set([
  'missing',
  'designed',
  'replayed',
  'dogfooded',
  'install-ready',
  'execution-ready',
  'user-project-ready',
]);
const EXECUTION_MODES = new Set(['report-only', 'request-only', 'claim-only', 'dry-run', 'live']);
const LOCAL_EVIDENCE_PREFIXES = new Set(['template', 'workflow', 'gitlab-ci', 'test', 'docs']);
const EXTERNAL_EVIDENCE_PREFIXES = new Set(['dogfood-run', 'issue', 'runner', 'artifact', 'replay', 'follow-up']);
const DOC_CAPABILITY_CLAIM_FILES = [
  'README.md',
  'docs/QUICKSTART.md',
  'docs/designs/dogfood-reference-case.md',
  'docs/designs/route-consumer-execution-architecture.md',
  'docs/designs/user-project-execution-ready-bundle.md',
];
const CLAIM_LEVEL_ORDER = ['not-user-executable', 'install-ready', 'execution-ready', 'user-project-ready'];

async function validateReleaseCapabilityGate(root = ROOT) {
  const errors = [];
  const warnings = [];
  const routeTable = await loadRouteTableTemplate(root);
  const dogfoodDoc = await readText(path.join(root, 'docs/designs/dogfood-reference-case.md'));
  const packageJson = JSON.parse(await readText(path.join(root, 'package.json')));
  const ciGate = await readText(path.join(root, 'scripts/ci-validate-gates.sh'));
  const allRefs = new Set([
    ...Object.keys(packageJson.scripts ?? {}),
    ...Object.keys(packageJson.scripts ?? {}).map((script) => script.replace(/^test:/, '')),
    ...ciGate.matchAll(/node scripts\/([a-z0-9-]+)\.mjs/g),
  ].map((item) => Array.isArray(item) ? item[1] : item));

  const routes = [];
  for (const route of allRoutes(routeTable)) {
    const missingOrWeakEvidence = [];
    validateRouteStructure(route, missingOrWeakEvidence);
    await validateProviderSupport({ root, route, dogfoodDoc, allRefs, missingOrWeakEvidence });
    validateCapabilityClaim(route, missingOrWeakEvidence);

    const evidenceStatus = missingOrWeakEvidence.some((item) => item.severity === 'fail')
      ? 'fail'
      : missingOrWeakEvidence.length > 0
        ? 'warning'
        : 'pass';
    for (const item of missingOrWeakEvidence) {
      if (item.severity === 'fail') errors.push(`${route.route_id ?? '<missing-route-id>'}: ${item.message}`);
      else warnings.push(`${route.route_id ?? '<missing-route-id>'}: ${item.message}`);
    }

    routes.push({
      route_id: route.route_id,
      consumer: route.consumer,
      consumer_kind: route.consumer_kind,
      execution: {
        mode: route.execution?.mode,
      },
      maturity: {
        protocol: route.maturity?.protocol,
        runner: route.maturity?.runner,
      },
      enabled_by_default: route.enabled === true,
      provider_support: route.provider_support ?? {},
      claim_level: claimLevelFor(route),
      evidence_status: evidenceStatus,
      missing_or_weak_evidence: missingOrWeakEvidence,
    });
  }
  await validateDocumentCapabilityClaims({ root, routes: allRoutes(routeTable), errors });

  return {
    ledger: {
      schema: 'zj-loop.release_capability_ledger.v1',
      source: 'templates/zj-loop-route-table.yaml.template',
      routes,
    },
    errors,
    warnings,
  };
}

async function loadRouteTableTemplate(root) {
  const template = await readText(path.join(root, 'templates/zj-loop-route-table.yaml.template'));
  return YAML.parse(
    template
      .replaceAll('__PATTERN_ID__', 'daily-triage')
      .replaceAll('__PATTERN_NAME__', 'Daily Triage')
      .replaceAll('__PATTERN_STATE__', 'zj-loop/STATE.md'),
  );
}

function allRoutes(routeTable) {
  return [...(routeTable.routes ?? []), ...(routeTable.disabled_dispatch_routes ?? [])];
}

function validateRouteStructure(route, findings) {
  for (const key of ['route_id', 'consumer', 'consumer_kind']) {
    if (!route[key]) fail(findings, `missing ${key}`);
  }
  if (!EXECUTION_MODES.has(route.execution?.mode)) {
    fail(findings, `invalid execution.mode: ${route.execution?.mode ?? '<missing>'}`);
  }
  for (const key of ['protocol', 'runner']) {
    if (!MATURITY_LEVELS.has(route.maturity?.[key])) {
      fail(findings, `invalid maturity.${key}: ${route.maturity?.[key] ?? '<missing>'}`);
    }
  }
  if (!Array.isArray(route.capabilities?.scopes)) fail(findings, 'missing capabilities.scopes');
  if (!Array.isArray(route.capabilities?.verifiers)) fail(findings, 'missing capabilities.verifiers');
  if (!route.capabilities?.max_side_effect_level) fail(findings, 'missing capabilities.max_side_effect_level');
}

async function validateProviderSupport(input) {
  const { route, missingOrWeakEvidence } = input;
  const support = route.provider_support;
  if (!support || typeof support !== 'object') {
    fail(missingOrWeakEvidence, 'missing provider_support');
    return;
  }

  for (const provider of REQUIRED_PROVIDERS) {
    const entry = support[provider];
    if (!entry || typeof entry !== 'object') {
      fail(missingOrWeakEvidence, `missing provider_support.${provider}`);
      continue;
    }
    if (!PROVIDER_SUPPORT_STATUSES.has(entry.status)) {
      fail(missingOrWeakEvidence, `provider_support.${provider}.status invalid: ${entry.status ?? '<missing>'}`);
    }
    const evidence = Array.isArray(entry.evidence) ? entry.evidence : [];
    if (!Array.isArray(entry.evidence)) fail(missingOrWeakEvidence, `provider_support.${provider}.evidence must be an array`);
    for (const ref of evidence) {
      await validateEvidenceRef({ ...input, provider, ref, findings: missingOrWeakEvidence });
    }
    validateProviderEvidenceSemantics({ provider, entry, evidence, findings: missingOrWeakEvidence });
  }
}

function validateProviderEvidenceSemantics({ provider, entry, evidence, findings }) {
  if (entry.status === 'dry-run-supported' && !evidence.some((ref) => /^(template|workflow|gitlab-ci|test|replay|artifact):/.test(ref))) {
    fail(findings, `provider_support.${provider} dry-run-supported lacks local/replay evidence`);
  }
  if (entry.status === 'live-supported' && !evidence.some((ref) => /^(runner|dogfood-run):/.test(ref))) {
    fail(findings, `provider_support.${provider} live-supported lacks runner or dogfood-run evidence`);
  }
  if (entry.status === 'explicitly-refused-with-reason' && typeof entry.reason !== 'string') {
    fail(findings, `provider_support.${provider} explicitly-refused-with-reason requires reason`);
  }
  if (entry.status === 'blocked-with-follow-up') {
    if (typeof entry.blocker !== 'string') fail(findings, `provider_support.${provider} blocked-with-follow-up requires blocker`);
    if (typeof entry.follow_up !== 'string') fail(findings, `provider_support.${provider} blocked-with-follow-up requires follow_up`);
  }
}

function validateCapabilityClaim(route, findings) {
  const runner = route.maturity?.runner;
  if (runner === 'execution-ready' || runner === 'user-project-ready') {
    const evidenceRefs = providerEvidence(route);
    if (!evidenceRefs.some((ref) => /^(runner|dogfood-run|replay|artifact|test):/.test(ref))) {
      fail(findings, `${runner} runner claim lacks replay/gate/live evidence`);
    }
    if ((route.execution?.side_effect_level ?? 'none') !== 'evidence' && route.enabled !== false) {
      warn(findings, `${runner} side-effect route should remain disabled by default unless explicitly justified`);
    }
  }
}

async function validateEvidenceRef(input) {
  const { root, dogfoodDoc, allRefs, provider, ref, findings } = input;
  if (typeof ref !== 'string' || !ref.includes(':')) {
    fail(findings, `provider_support.${provider}.evidence invalid ref: ${String(ref)}`);
    return;
  }
  const [prefix, value] = ref.split(/:(.*)/s);
  if (LOCAL_EVIDENCE_PREFIXES.has(prefix)) {
    await validateLocalEvidenceRef({ root, allRefs, prefix, value, provider, findings });
    return;
  }
  if (EXTERNAL_EVIDENCE_PREFIXES.has(prefix)) {
    validateExternalEvidenceRef({ dogfoodDoc, prefix, value, provider, findings });
    return;
  }
  fail(findings, `provider_support.${provider}.evidence unsupported prefix: ${ref}`);
}

async function validateLocalEvidenceRef({ root, allRefs, prefix, value, provider, findings }) {
  if (prefix === 'workflow') {
    await requirePath(root, `templates/github-actions/${value}`, findings, `provider_support.${provider}.evidence missing workflow template: ${value}`);
    await requirePath(root, `.github/workflows/${value}`, findings, `provider_support.${provider}.evidence missing generated workflow: ${value}`);
  } else if (prefix === 'gitlab-ci') {
    await requirePath(root, `templates/gitlab-ci/${value}`, findings, `provider_support.${provider}.evidence missing GitLab CI template: ${value}`);
  } else if (prefix === 'template') {
    await requirePath(root, `templates/${value}`, findings, `provider_support.${provider}.evidence missing template: ${value}`);
  } else if (prefix === 'docs') {
    await requireAnyPath(root, [`docs/designs/${value}.md`, `docs/${value}.md`, `${value}.md`], findings, `provider_support.${provider}.evidence missing docs ref: ${value}`);
  } else if (prefix === 'test' && !allRefs.has(value)) {
    fail(findings, `provider_support.${provider}.evidence missing test gate: ${value}`);
  }
}

function validateExternalEvidenceRef({ dogfoodDoc, prefix, value, provider, findings }) {
  if (!value || /\s/.test(value)) {
    fail(findings, `provider_support.${provider}.evidence invalid ${prefix} ref: ${value}`);
    return;
  }
  if ((prefix === 'dogfood-run' || prefix === 'issue') && !dogfoodDoc.includes(value)) {
    warn(findings, `provider_support.${provider}.evidence ${prefix}:${value} is not mentioned in dogfood-reference-case.md`);
  }
}

async function requirePath(root, relativePath, findings, message) {
  try {
    await access(path.join(root, relativePath));
  } catch {
    fail(findings, message);
  }
}

async function requireAnyPath(root, relativePaths, findings, message) {
  for (const relativePath of relativePaths) {
    try {
      await access(path.join(root, relativePath));
      return;
    } catch {
      // try next candidate
    }
  }
  fail(findings, message);
}

function claimLevelFor(route) {
  const runner = route.maturity?.runner;
  if (runner === 'user-project-ready') return 'user-project-ready';
  if (runner === 'execution-ready') return 'execution-ready';
  if (runner === 'install-ready') return 'install-ready';
  return 'not-user-executable';
}

async function validateDocumentCapabilityClaims({ root, routes, errors }) {
  const routeAliases = routes.flatMap((route) =>
    routeClaimAliases(route).map((alias) => ({ route, alias: normalizeClaimText(alias) })),
  ).filter((entry) => entry.alias.length >= 4);
  const hasExecutionReadyRoute = routes.some((route) => claimSatisfies(claimLevelFor(route), 'execution-ready'));

  for (const relativePath of DOC_CAPABILITY_CLAIM_FILES) {
    const text = await readText(path.join(root, relativePath));
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      validateRouteSpecificClaimLine({ relativePath, line, lineNumber: index + 1, routeAliases, errors });
      validatePublicProductClaimLine({ relativePath, line, lineNumber: index + 1, hasExecutionReadyRoute, errors });
    });
  }
}

function validateRouteSpecificClaimLine({ relativePath, line, lineNumber, routeAliases, errors }) {
  const claimedLevel = line.includes('user-project-ready')
    ? 'user-project-ready'
    : line.includes('execution-ready')
      ? 'execution-ready'
      : null;
  if (!claimedLevel) return;

  const normalizedLine = normalizeClaimText(line);
  const matchedRoutes = new Set();
  for (const { route, alias } of routeAliases) {
    if (!normalizedLine.includes(alias)) continue;
    if (matchedRoutes.has(route.route_id)) continue;
    matchedRoutes.add(route.route_id);

    const actualLevel = claimLevelFor(route);
    if (!claimSatisfies(actualLevel, claimedLevel)) {
      errors.push(`${relativePath}:${lineNumber}: docs claim ${route.route_id} is ${claimedLevel}, but Route Table runner is ${route.maturity?.runner ?? '<missing>'}`);
    }
  }
}

function validatePublicProductClaimLine({ relativePath, line, lineNumber, hasExecutionReadyRoute, errors }) {
  if (hasExecutionReadyRoute) return;
  if (!['README.md', 'docs/QUICKSTART.md', 'docs/designs/user-project-execution-ready-bundle.md'].includes(relativePath)) return;
  if (!/(first\s+execution-ready|execution-ready\s+(route set|user-project choices|bundle)|user-project\s+execution-ready)/i.test(line)) return;

  errors.push(`${relativePath}:${lineNumber}: docs claim execution-ready user-project capability, but no Route Table route currently claims execution-ready`);
}

function routeClaimAliases(route) {
  return [
    route.route_id,
    route.consumer,
    route.route_id?.replaceAll('-', ' '),
    route.consumer?.replaceAll('-', ' '),
  ].filter(Boolean);
}

function normalizeClaimText(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function claimSatisfies(actual, claimed) {
  return CLAIM_LEVEL_ORDER.indexOf(actual) >= CLAIM_LEVEL_ORDER.indexOf(claimed);
}

function providerEvidence(route) {
  return REQUIRED_PROVIDERS.flatMap((provider) => route.provider_support?.[provider]?.evidence ?? []);
}

async function readText(filePath) {
  return readFile(filePath, 'utf8');
}

function fail(findings, message) {
  findings.push({ severity: 'fail', message });
}

function warn(findings, message) {
  findings.push({ severity: 'warning', message });
}

async function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const result = await validateReleaseCapabilityGate();
  if (json) {
    console.log(JSON.stringify(result.ledger, null, 2));
  } else {
    console.log(`Release capability gate ${result.errors.length === 0 ? 'valid' : 'failed'}: ${result.ledger.routes.length} routes, ${result.warnings.length} warnings`);
  }
  if (result.errors.length) {
    for (const error of result.errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  });
}

export { validateReleaseCapabilityGate };
