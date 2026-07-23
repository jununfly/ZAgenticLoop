#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import YAML from 'yaml';

import { buildCompletionAlignmentLedger } from '../tools/zj-loop-core/dist/index.js';
import { validateArchitectureIntegrityGate } from './validate-architecture-integrity-gate.mjs';
import { validateCompletionDeltaGate } from './validate-completion-delta-gate.mjs';
import { validateReleaseCapabilityGate } from './validate-release-capability-gate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROUTE_TABLE_PATH = 'templates/zj-loop-route-table.yaml.template';
const execFileAsync = promisify(execFile);

export async function auditReleaseCandidate(root = ROOT, options = {}) {
  const routeTableText = options.currentRouteTableText ?? await readFile(path.join(root, ROUTE_TABLE_PATH), 'utf8');
  const completion = deriveLedger(routeTableText);
  const architecture = options.architecture ?? await validateArchitectureIntegrityGate(root);
  const releaseCapability = options.releaseCapability ?? await validateReleaseCapabilityGate(root);
  const delta = options.delta ?? await validateCompletionDeltaGate(root, {
    currentRouteTableText: routeTableText,
    baselineRouteTableText: options.baselineRouteTableText,
    requireBaseline: options.requireBaseline === true,
  });

  return buildReleaseCandidateAudit({ completion, architecture, releaseCapability, delta });
}

export function buildReleaseCandidateAudit({ completion, architecture, releaseCapability, delta }) {
  const applicableCells = completion.cells.filter((cell) => cell.status !== 'not-applicable-with-reason');
  const blockingCells = applicableCells.filter((cell) => cell.status !== 'complete');
  const checks = {
    architecture_integrity: architecture.status === 'pass',
    release_capability: releaseCapability.errors.length === 0,
    completion_delta: delta.status === 'pass',
    required_matrix: blockingCells.length === 0,
  };
  const blockingReasons = [];
  if (!checks.architecture_integrity) blockingReasons.push('Architecture Integrity gate is not passing');
  if (!checks.release_capability) blockingReasons.push(`${releaseCapability.errors.length} release capability claim/evidence error(s)`);
  if (!checks.completion_delta) blockingReasons.push(`${delta.errors.length} completion delta error(s)`);
  if (blockingCells.length > 0) blockingReasons.push(`${blockingCells.length} required completion cell(s) are not complete`);

  return {
    schema: 'zj-loop.release_candidate_complete_matrix_audit.v1',
    status: Object.values(checks).every(Boolean) ? 'ready' : 'not-ready',
    target: completion.target,
    checks,
    matrix: {
      summary: completion.summary,
      required_cells: applicableCells.length,
      complete_required_cells: applicableCells.filter((cell) => cell.status === 'complete').length,
      blocking_cells: blockingCells.map((cell) => ({
        route_id: cell.route_id,
        adapter_id: cell.adapter_id,
        status: cell.status,
        gates: cell.gates,
        next_actions: cell.next_actions,
      })),
    },
    upstream: {
      architecture_integrity: architecture,
      release_capability: {
        error_count: releaseCapability.errors.length,
        warning_count: releaseCapability.warnings.length,
        errors: releaseCapability.errors,
        warnings: releaseCapability.warnings,
      },
      completion_delta: {
        status: delta.status,
        errors: delta.errors,
        warnings: delta.warnings,
        stale_cells: delta.stale_cells,
        delta: delta.delta,
      },
    },
    blocking_reasons: blockingReasons,
    side_effects_executed: false,
  };
}

function deriveLedger(text) {
  const table = YAML.parse(text
    .replaceAll('__PATTERN_ID__', 'daily-triage')
    .replaceAll('__PATTERN_NAME__', 'Daily Triage')
    .replaceAll('__PATTERN_STATE__', 'zj-loop/STATE.md'));
  return buildCompletionAlignmentLedger({ table, routeTableText: text });
}

async function routeTableAtRef(root, ref) {
  const { stdout } = await execFileAsync('git', ['show', `${ref}:${ROUTE_TABLE_PATH}`], { cwd: root });
  return stdout;
}

async function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const strict = argv.includes('--strict');
  const baseRefIndex = argv.indexOf('--base-ref');
  const baseRef = baseRefIndex >= 0 ? argv[baseRefIndex + 1] : undefined;
  const requireBaseline = argv.includes('--require-baseline');
  const baselineRouteTableText = baseRef ? await routeTableAtRef(ROOT, baseRef) : undefined;
  const result = await auditReleaseCandidate(ROOT, { baselineRouteTableText, requireBaseline });

  if (json) console.log(JSON.stringify(result, null, 2));
  else console.log(`Release candidate complete-matrix audit ${result.status}: ${result.matrix.complete_required_cells}/${result.matrix.required_cells} required cells complete`);
  if (strict && result.status !== 'ready') process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
