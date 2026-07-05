#!/usr/bin/env node
import { auditProject } from './auditor.js';
import { formatBadge, formatHuman, formatJson, formatMarkdown, formatSuggestionGroups } from './reporter.js';
import { runCli } from '@jununfly/zj-loop-core';
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
        io.stdout(formatSuggestionGroups(result));
    }
    return result.score < 40 ? 2 : 0;
}
const SPEC = {
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
