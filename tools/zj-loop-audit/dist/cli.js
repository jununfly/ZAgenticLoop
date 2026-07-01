#!/usr/bin/env node
import { auditProject } from './auditor.js';
import { formatBadge, formatHuman, formatJson, formatMarkdown } from './reporter.js';
import { runCli } from '@jununfly/zj-loop-core';
const HELP_TEXT = `zj-loop-audit — Loop Readiness Score CLI (v1.4+)

Usage:
  zj-loop-audit [path] [options]

Options:
  --json      JSON output (for CI / scripting)
  --md        Markdown report
  --suggest   Show copy-from-template commands for missing pieces (recommended on first runs)
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
async function handleAuditCommand({ io, options }) {
    const target = typeof options.target === 'string' ? options.target : '.';
    const json = options.json === true;
    const md = options.md === true;
    const suggest = options.suggest === true || options.fix === true;
    const badge = options.badge === true;
    const result = await auditProject(target);
    if (badge)
        io.stdout(formatBadge(result));
    else if (json)
        io.stdout(formatJson(result));
    else if (md)
        io.stdout(formatMarkdown(result));
    else
        io.stdout(formatHuman(result));
    if (suggest) {
        io.stdout(SUGGEST_TEXT);
    }
    return result.score < 40 ? 2 : 0;
}
const SUGGEST_TEXT = `
=== Suggested actions (copy & customize) ===
From the root of this repo (or after cloning the reference):

  # Minimal L1 daily triage — pick your tool
  # Grok:
  cp -r starters/minimal-loop/.grok/skills/loop-triage .grok/skills/
  # Claude Code:
  cp -r starters/minimal-loop-claude/.claude/skills/loop-triage .claude/skills/
  cp starters/minimal-loop-claude/.claude/agents/loop-verifier.md .claude/agents/
  # Codex:
  cp -r starters/minimal-loop-codex/.codex/skills/loop-triage .codex/skills/
  cp starters/minimal-loop-codex/.codex/agents/verifier.toml .codex/agents/
  # All tools:
  cp starters/minimal-loop/STATE.md.example STATE.md   # or -claude / -codex variant
  cp starters/minimal-loop/LOOP.md .
  cp templates/loop-budget.md.template loop-budget.md
  cp templates/loop-run-log.md.template loop-run-log.md

  # Maker/checker verifier (Grok / generic skills dir)
  mkdir -p .grok/skills/loop-verifier
  cp templates/SKILL.md.verifier .grok/skills/loop-verifier/SKILL.md

  # Common minimal fix action
  mkdir -p .grok/skills/minimal-fix
  cp templates/SKILL.md.minimal-fix .grok/skills/minimal-fix/SKILL.md

  # For PR babysitter / CI sweeper patterns, copy the corresponding starter
  # Then run:  zj-loop-audit . --suggest   (again after changes)

  # Or scaffold automatically:
  npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok
  npx @jununfly/zj-loop-cost --pattern daily-triage --level L1

  # IMPORTANT (v1.4): After scaffolding, actually RUN a loop (report-only) and commit the updated STATE.md.
  # This creates the "loopActivity" evidence that pushes you toward real L2/L3 scores.

See docs/loop-design-checklist.md and patterns/ for full guidance.`;
const SPEC = {
    name: 'zj-loop-audit',
    usage: 'zj-loop-audit [path] [options]',
    helpText: HELP_TEXT,
    options: [
        { name: 'target', type: 'positional', description: 'Project path', default: '.' },
        { name: 'json', type: 'boolean', description: 'JSON output' },
        { name: 'md', type: 'boolean', description: 'Markdown report' },
        { name: 'suggest', type: 'boolean', description: 'Show copy-from-template commands' },
        { name: 'fix', type: 'boolean', description: 'Alias for --suggest' },
        { name: 'badge', type: 'boolean', description: 'Markdown README badge' },
    ],
    handler: handleAuditCommand,
};
runCli(SPEC).then((exitCode) => {
    process.exitCode = exitCode;
});
