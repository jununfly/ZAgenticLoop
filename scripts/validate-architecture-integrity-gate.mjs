#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROUTE_TABLE_PATH = 'templates/zj-loop-route-table.yaml.template';
const REQUIRED_DOCS = [
  ['docs/designs/architecture.md', [
    'Route Table',
    'core semantic functions answer what a loop',
  ]],
  ['docs/designs/completion-alignment-architecture.md', [
    'Architecture Integrity is a cross-cutting hard gate',
    'The Route Table owns current route capability',
    'buildCompletionAlignmentLedger',
  ]],
];

const REQUIRED_CORE_SURFACES = [
  ['tools/zj-loop-core/src/completion-alignment.ts', 'buildCompletionAlignmentLedger'],
  ['tools/zj-loop-core/src/doctor-cli.ts', '--completion'],
  ['scripts/validate-release-capability-gate.mjs', 'validateReleaseCapabilityGate'],
];

const ADAPTER_IDS = new Set(['github', 'gitlab', 'workspace']);
const APPLICABILITY = new Set(['applicable', 'not-applicable-with-reason']);
const SIGNAL_MODES = new Set(['event-driven', 'scheduled', 'explicit-on-demand']);

export async function validateArchitectureIntegrityGate(root = ROOT) {
  const errors = [];
  const routeTableText = await readText(root, ROUTE_TABLE_PATH, errors);
  let routeTable;
  if (routeTableText !== null) {
    try {
      routeTable = YAML.parse(routeTableText
        .replaceAll('__PATTERN_ID__', 'daily-triage')
        .replaceAll('__PATTERN_NAME__', 'Daily Triage')
        .replaceAll('__PATTERN_STATE__', 'zj-loop/STATE.md'));
    } catch (error) {
      errors.push(`${ROUTE_TABLE_PATH} is invalid YAML: ${error.message}`);
    }
  }

  if (routeTable) validateRouteTable(routeTable, errors);

  for (const [relativePath, phrases] of REQUIRED_DOCS) {
    const text = await readText(root, relativePath, errors);
    if (text === null) continue;
    for (const phrase of phrases) {
      if (!text.includes(phrase)) errors.push(`${relativePath} missing architecture contract: ${phrase}`);
    }
  }

  for (const [relativePath, phrase] of REQUIRED_CORE_SURFACES) {
    const text = await readText(root, relativePath, errors);
    if (text !== null && !text.includes(phrase)) {
      errors.push(`${relativePath} missing required core surface: ${phrase}`);
    }
  }

  const result = {
    schema: 'zj-loop.architecture_integrity_gate.v1',
    status: errors.length === 0 ? 'pass' : 'fail',
    checks: {
      route_table: routeTable ? 'pass' : 'fail',
      completion_target: routeTable ? 'pass' : 'fail',
      core_surfaces: 'pass',
      architecture_docs: 'pass',
    },
    route_count: routeTable ? allRoutes(routeTable).length : 0,
    errors,
    side_effects_executed: false,
  };
  if (errors.some((error) => error.includes('required core surface'))) result.checks.core_surfaces = 'fail';
  if (errors.some((error) => error.includes('architecture contract'))) result.checks.architecture_docs = 'fail';
  if (errors.some((error) => error.includes('Route Table') || error.includes('completion_target') || error.includes('route '))) {
    result.checks.route_table = errors.some((error) => error.includes(`${ROUTE_TABLE_PATH} is invalid YAML`)) ? 'fail' : result.checks.route_table;
    result.checks.completion_target = 'fail';
  }
  return result;
}

function validateRouteTable(table, errors) {
  if (table.schemaVersion !== 1) errors.push('Route Table schemaVersion must be 1');
  if (table.kind !== 'zj-loop-route-table') errors.push('Route Table kind must be zj-loop-route-table');
  const target = table.metadata?.completion_target;
  if (!target || target.id !== 'automation-first-product' || target.schema_version !== 1) {
    errors.push('Route Table completion_target must declare automation-first-product schema_version 1');
  }

  const routes = allRoutes(table);
  const routeIds = new Set();
  for (const route of routes) {
    const routeId = route?.route_id;
    if (typeof routeId !== 'string' || routeId.length === 0) {
      errors.push('Route Table route must declare a non-empty route_id');
      continue;
    }
    if (routeIds.has(routeId)) errors.push(`Route Table contains duplicate route ${routeId}`);
    routeIds.add(routeId);

    if (route.provider_support?.workspace !== undefined) {
      errors.push(`route ${routeId} must keep workspace under completion_target.adapters, not provider_support`);
    }
    const adapters = route.completion_target?.adapters;
    if (!adapters || typeof adapters !== 'object' || Array.isArray(adapters)) {
      errors.push(`route ${routeId} must declare completion_target.adapters`);
      continue;
    }
    for (const [adapterId, adapter] of Object.entries(adapters)) {
      if (!ADAPTER_IDS.has(adapterId)) errors.push(`route ${routeId} declares unsupported adapter ${adapterId}`);
      if (!adapter || !APPLICABILITY.has(adapter.applicability)) {
        errors.push(`route ${routeId} adapter ${adapterId} has invalid applicability`);
        continue;
      }
      if (adapter.applicability === 'not-applicable-with-reason' && typeof adapter.not_applicable_reason !== 'string') {
        errors.push(`route ${routeId} adapter ${adapterId} requires not_applicable_reason`);
      }
      if (adapter.applicability === 'applicable') {
        if (adapter.requirement !== 'required') errors.push(`route ${routeId} adapter ${adapterId} requirement must be required`);
        if (!SIGNAL_MODES.has(adapter.signal_initiation_mode)) {
          errors.push(`route ${routeId} adapter ${adapterId} has invalid signal_initiation_mode`);
        }
        if (adapter.not_applicable_reason !== undefined) {
          errors.push(`route ${routeId} adapter ${adapterId} must not declare not_applicable_reason when applicable`);
        }
      }
    }
  }
}

function allRoutes(table) {
  return [...(table.routes ?? []), ...(table.disabled_dispatch_routes ?? [])];
}

async function readText(root, relativePath, errors) {
  try {
    return await readFile(path.join(root, relativePath), 'utf8');
  } catch (error) {
    errors.push(`${relativePath} is unreadable: ${error.message}`);
    return null;
  }
}

async function main() {
  const result = await validateArchitectureIntegrityGate();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'pass') process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
