#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import YAML from 'yaml';

import { buildCompletionAlignmentLedger } from '../tools/zj-loop-core/dist/index.js';
import { validateArchitectureIntegrityGate } from './validate-architecture-integrity-gate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync = promisify(execFile);
const ROUTE_TABLE_PATH = 'templates/zj-loop-route-table.yaml.template';

export async function validateCompletionDeltaGate(root = ROOT, options = {}) {
  const currentText = options.currentRouteTableText ?? await readFile(path.join(root, ROUTE_TABLE_PATH), 'utf8');
  const currentLedger = deriveLedger(currentText);
  const architecture = await validateArchitectureIntegrityGate(root);
  const baselineText = options.baselineRouteTableText;
  const baselineLedger = baselineText ? deriveLedger(baselineText) : null;
  const errors = [];
  const warnings = [];

  if (architecture.status !== 'pass') errors.push('Architecture Integrity gate failed');
  const staleCells = currentLedger.cells.filter((cell) => cell.status === 'stale');
  for (const cell of staleCells) errors.push(`current completion cell is stale: ${cell.route_id}:${cell.adapter_id}`);

  const delta = baselineLedger ? compareCompletionLedgers(baselineLedger, currentLedger) : null;
  if (delta) errors.push(...delta.regressions);
  if (!baselineLedger) {
    if (options.requireBaseline === true) errors.push('completion ledger baseline is required');
    else warnings.push('completion ledger baseline was not supplied; regression comparison skipped');
  }

  const result = {
    schema: 'zj-loop.completion_delta_gate.v1',
    status: errors.length === 0 ? 'pass' : 'fail',
    architecture_integrity: architecture,
    baseline: baselineLedger ? { status: 'available', target: baselineLedger.target } : { status: 'missing' },
    current: { target: currentLedger.target, summary: currentLedger.summary },
    delta,
    stale_cells: staleCells.map((cell) => `${cell.route_id}:${cell.adapter_id}`),
    warnings,
    errors,
    side_effects_executed: false,
  };
  return result;
}

export function compareCompletionLedgers(baseline, current) {
  const regressions = [];
  if (baseline.target.id !== current.target.id) {
    regressions.push(`completion target changed: ${baseline.target.id} -> ${current.target.id}`);
  }
  const currentCells = new Map(current.cells.map((cell) => [`${cell.route_id}:${cell.adapter_id}`, cell]));
  const completedCells = baseline.cells.filter((cell) => cell.status === 'complete');
  for (const previous of completedCells) {
    const key = `${previous.route_id}:${previous.adapter_id}`;
    const next = currentCells.get(key);
    if (!next) regressions.push(`completed cell disappeared: ${key}`);
    else if (next.status !== 'complete') regressions.push(`completed cell regressed: ${key} complete -> ${next.status}`);
  }
  return {
    schema: 'zj-loop.completion_delta.v1',
    regressions,
    added_cells: current.cells
      .filter((cell) => !baseline.cells.some((previous) => previous.route_id === cell.route_id && previous.adapter_id === cell.adapter_id))
      .map((cell) => `${cell.route_id}:${cell.adapter_id}`),
    completed_cells: completedCells.map((cell) => `${cell.route_id}:${cell.adapter_id}`),
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
  const baseRefIndex = argv.indexOf('--base-ref');
  const baseRef = baseRefIndex >= 0 ? argv[baseRefIndex + 1] : undefined;
  const requireBaseline = argv.includes('--require-baseline');
  let baselineRouteTableText;
  if (baseRef) baselineRouteTableText = await routeTableAtRef(ROOT, baseRef);
  const result = await validateCompletionDeltaGate(ROOT, { baselineRouteTableText, requireBaseline });
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'pass') process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
