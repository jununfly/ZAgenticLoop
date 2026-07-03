#!/usr/bin/env node
import { auditProject, type AuditResult } from './auditor.js';
import { LOOP_ARTIFACTS } from './artifacts.js';
import { formatBadge, formatHuman, formatJson, formatMarkdown } from './reporter.js';
import { runCli, type CliHandlerContext, type CliSpec } from '@jununfly/zj-loop-core';

const HELP_TEXT = `zj-loop-audit — Loop Readiness Score CLI (v1.4+)

Usage:
  zj-loop-audit [path] [options]

Options:
  --json      JSON output (for CI / scripting)
  --md        Markdown report
  --suggest   Show context-aware actions for missing or incomplete pieces
  --badge     Markdown README badge (Loop Ready level + score)
  --help, -h  This help

New in v1.4:
  • Dynamic "loop activity" detection (git history, "Last run" in STATE, scheduled workflows)
  • Higher L3 bar requires proven usage, not just files
  • Stronger recommendations when structure exists but no runs yet

Exit codes:
  0  score >= 40
  2  score < 40 (early stage or gate)

Examples:
  zj-loop-audit .
  zj-loop-audit . --suggest
  zj-loop-audit . --badge >> README.md
  npx @jununfly/zj-loop-audit . --json
  npx @jununfly/zj-loop-audit starters/minimal-loop --suggest
  bash scripts/before-after-demo.sh
`;

async function handleAuditCommand({ io, options }: CliHandlerContext) {
  const target = typeof options.target === 'string' ? options.target : '.';
  const json = options.json === true;
  const md = options.md === true;
  const suggest = options.suggest === true || options.fix === true;
  const badge = options.badge === true;

  const result = await auditProject(target);
  if (badge) io.stdout(formatBadge(result));
  else if (json) io.stdout(formatJson(result));
  else if (md) io.stdout(formatMarkdown(result));
  else io.stdout(formatHuman(result));

  if (suggest) {
    io.stdout(formatSuggestions(result));
  }

  return result.score < 40 ? 2 : 0;
}

function formatSuggestions(result: AuditResult): string {
  const { signals } = result;
  const lines: string[] = [
    '',
    '=== Suggested actions ===',
    'These actions are based on files detected in the target project.',
    '',
  ];

  if (!signals.stateFile.present) {
    lines.push(`  mkdir -p ${LOOP_ARTIFACTS.directory}`);
    lines.push(`  cp starters/minimal-loop/STATE.md.example ${LOOP_ARTIFACTS.directory}/STATE.md`);
  }

  if (!signals.loopConfig.present) {
    lines.push(`  mkdir -p ${LOOP_ARTIFACTS.directory}`);
    lines.push(`  cp starters/minimal-loop/ZJ-LOOP.md ${LOOP_ARTIFACTS.config.primary}`);
  }

  if (!signals.triage.present) {
    lines.push('  # Add one triage skill for the target tool, or run:');
    lines.push('  npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok');
  }

  if (!signals.verifier.present) {
    lines.push('  # Add maker/checker verification before enabling L2 actions.');
    lines.push('  mkdir -p .grok/skills/zj-loop-verifier');
    lines.push('  cp templates/SKILL.md.zj-loop-verifier .grok/skills/zj-loop-verifier/SKILL.md');
  }

  if (!signals.cost.budgetDoc) {
    lines.push(`  mkdir -p ${LOOP_ARTIFACTS.directory}`);
    lines.push(`  cp templates/${LOOP_ARTIFACTS.budget.template} ${LOOP_ARTIFACTS.budget.primary}`);
  }

  if (!signals.cost.runLog) {
    lines.push(`  mkdir -p ${LOOP_ARTIFACTS.directory}`);
    lines.push(`  cp templates/${LOOP_ARTIFACTS.runLog.template} ${LOOP_ARTIFACTS.runLog.primary}`);
  }

  if (signals.loopConfig.present && !signals.cost.loopMdBudget) {
    lines.push(`  # Edit ${signals.loopConfig.path ?? LOOP_ARTIFACTS.config.primary}: add a Budget section with token caps and kill switch.`);
  }

  if (!signals.cost.budgetSkill) {
    lines.push(`  # Add the ${LOOP_ARTIFACTS.skills.budget.primary} skill via zj-loop-init or templates/SKILL.md.${LOOP_ARTIFACTS.skills.budget.primary}.`);
  }

  if (!signals.constraints.present) {
    lines.push(`  mkdir -p ${LOOP_ARTIFACTS.directory}`);
    lines.push(`  cp templates/${LOOP_ARTIFACTS.constraints.template} ${LOOP_ARTIFACTS.constraints.primary}`);
  }

  if (signals.constraints.present && !signals.constraints.hasConstraintsSkill) {
    lines.push(`  # Add the ${LOOP_ARTIFACTS.skills.constraints.primary} skill so constraints are enforced at runtime.`);
  }

  if (!signals.loopActivity.present) {
    lines.push('  # Run one report-only loop, update state, and commit the state/run-log evidence.');
  }

  if (lines.length === 4) {
    lines.push('  No missing scaffold artifacts detected. Review warnings above for policy edits or runtime evidence.');
  }

  lines.push('');
  lines.push('Docs: docs/loop-design-checklist.md and docs/operating-loops.md');
  return lines.join('\n');
}

const SPEC: CliSpec = {
  name: 'zj-loop-audit',
  usage: 'zj-loop-audit [path] [options]',
  helpText: HELP_TEXT,
  options: [
    { name: 'target', type: 'positional', description: 'Project path', default: '.' },
    { name: 'json', type: 'boolean', description: 'JSON output' },
    { name: 'md', type: 'boolean', description: 'Markdown report' },
    { name: 'suggest', type: 'boolean', description: 'Show context-aware actions' },
    { name: 'fix', type: 'boolean', description: 'Alias for --suggest' },
    { name: 'badge', type: 'boolean', description: 'Markdown README badge' },
  ],
  handler: handleAuditCommand,
};

runCli(SPEC).then((exitCode) => {
  process.exitCode = exitCode;
});
