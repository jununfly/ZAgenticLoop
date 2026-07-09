import {
  assertValidLevel,
  cadenceToRunsPerDay,
  estimateCost,
  runsPerDayForInterval,
  type EstimateInput,
  type EstimateResult,
  type PatternCost,
  type ReadinessLevel,
  type RegistryPattern,
} from '@jununfly/zj-loop-core';

export {
  assertValidLevel,
  cadenceToRunsPerDay,
  estimateCost,
  runsPerDayForInterval,
};

export type {
  EstimateInput,
  EstimateResult,
  PatternCost,
  ReadinessLevel,
  RegistryPattern,
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

export function formatEstimateHuman(r: EstimateResult, registry?: { label: string; path: string }): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`Loop Cost Estimate — ${r.patternName} (${r.patternId})`);
  lines.push('═'.repeat(50));
  if (registry) lines.push(`Registry: ${registry.label} ${registry.path}`);
  lines.push(`Cadence: ${r.cadence}  →  ${r.runsPerDay} runs/day`);
  lines.push(`Level: ${r.level}  ·  Registry tier: ${r.tokenCostTier}`);
  lines.push(`Suggested daily cap: ${formatTokens(r.suggestedDailyCap)} tokens`);
  lines.push('');
  lines.push('Daily token estimates:');
  lines.push(`  Early-exit / no-op:  ${formatTokens(r.scenarios.noop.tokensPerDay)}  (${formatTokens(r.scenarios.noop.tokensPerRun)}/run)`);
  lines.push(`  Full triage:         ${formatTokens(r.scenarios.report.tokensPerDay)}  (${formatTokens(r.scenarios.report.tokensPerRun)}/run)`);
  lines.push(`  Action every run:    ${formatTokens(r.scenarios.action.tokensPerDay)}  (${formatTokens(r.scenarios.action.tokensPerRun)}/run)`);
  lines.push(`  Realistic blend:     ${formatTokens(r.scenarios.realistic.tokensPerDay)}  (${r.scenarios.realistic.assumptions})`);

  if (r.warnings.length) {
    lines.push('');
    lines.push('Warnings:');
    for (const w of r.warnings) lines.push(`  ! ${w}`);
  }
  lines.push('');
  lines.push('Docs: docs/operating-loops.md · Scaffold: npx @jununfly/zj-loop-init');
  lines.push('');
  return lines.join('\n');
}
