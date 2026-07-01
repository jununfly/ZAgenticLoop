#!/usr/bin/env node
/**
 * Loop Sync CLI
 *
 * Detect and sync drift between Loop configuration files
 */
import { runSync, formatReport } from './sync.js';
import { runCli } from '@jununfly/zj-loop-core';
const HELP_TEXT = `zj-loop-sync — detect and sync drift between Loop configuration files

Usage:
  zj-loop-sync [target-dir] [options]

Options:
  -a, --auto-fix    Attempt to auto-fix issues (experimental)
  -d, --dry-run     Show what would be done without making changes
  -v, --verbose     Show detailed information
  --json            Output JSON format
  -h, --help        Show this help

Examples:
  zj-loop-sync .
  zj-loop-sync ./my-project -v
  zj-loop-sync ./my-project --json

The tool checks:
  - STATE.md ↔ LOOP.md consistency
  - Required files (STATE.md, LOOP.md, AGENTS.md)
  - Skills directory structure
  - Configuration drift indicators

Score interpretation:
  - 90-100: Healthy (no issues)
  - 70-89: Warning (minor inconsistencies)
  - 0-69: Critical (major issues need attention)

Docs: https://github.com/jununfly/ZAgenticLoop/tree/main/tools/zj-loop-sync
`;
async function handleSyncCommand({ io, options }) {
    const args = {
        targetDir: typeof options.targetDir === 'string' ? options.targetDir : '.',
        autoFix: options.autoFix === true,
        dryRun: options.dryRun === true,
        verbose: options.verbose === true,
        json: options.json === true,
    };
    const report = await runSync(args);
    if (args.json) {
        io.stdout(JSON.stringify(report, null, 2));
    }
    else {
        io.stdout(formatReport(report));
    }
    if (report.level === 'critical') {
        return 1;
    }
    if (report.level === 'warning') {
        return 2;
    }
    return 0;
}
const SPEC = {
    name: 'zj-loop-sync',
    usage: 'zj-loop-sync [target-dir] [options]',
    helpText: HELP_TEXT,
    options: [
        { name: 'targetDir', type: 'positional', description: 'Project directory', default: '.' },
        { name: 'autoFix', alias: '-a', flag: 'auto-fix', type: 'boolean', description: 'Attempt to auto-fix issues' },
        { name: 'dryRun', alias: '-d', flag: 'dry-run', type: 'boolean', description: 'Show what would be done without making changes' },
        { name: 'verbose', alias: '-v', type: 'boolean', description: 'Show detailed information' },
        { name: 'json', type: 'boolean', description: 'Output JSON format' },
    ],
    handler: handleSyncCommand,
};
runCli(SPEC).then((exitCode) => {
    process.exitCode = exitCode;
});
