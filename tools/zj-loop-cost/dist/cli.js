#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePatternRegistry, runCli } from '@jununfly/zj-loop-core';
import { assertValidLevel, estimateCost, formatEstimateHuman, } from './estimator.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const HELP_TEXT = `zj-loop-cost — estimate daily token spend for loop patterns

Usage:
  zj-loop-cost [project-root] --pattern <id> [options]

Options:
  -p, --pattern <id>     Pattern id (default: daily-triage)
  --registry <path>      Use an explicit registry file
  --package-registry     Use the packaged registry even when a local registry exists
  -c, --cadence <spec>   Override cadence (e.g. 15m, 1d, 5m-15m)
  -l, --level <L1|L2|L3> Readiness level (default: L1)
  --conservative         Use slower cadence from ranges (e.g. 15m not 5m)
  --json                 Machine-readable output
  --list                 List pattern ids
  -h, --help             This help

Examples:
  zj-loop-cost . --pattern daily-triage
  zj-loop-cost --registry patterns/registry.yaml --pattern daily-triage
  zj-loop-cost --package-registry --pattern daily-triage
  zj-loop-cost --pattern ci-sweeper --cadence 15m --level L2
  zj-loop-cost --pattern daily-triage --level L1 --json
  zj-loop-cost --list
`;
function registryCandidates(options) {
    const explicitRegistry = typeof options.registry === 'string' ? path.resolve(String(options.registry)) : undefined;
    if (explicitRegistry)
        return [{ label: 'explicit', path: explicitRegistry }];
    const packageRegistry = path.join(PACKAGE_ROOT, 'registry.json');
    const monorepoRegistry = path.resolve(PACKAGE_ROOT, '../../patterns/registry.yaml');
    if (options.packageRegistry === true) {
        return [
            { label: 'package default', path: packageRegistry },
            { label: 'monorepo fallback', path: monorepoRegistry },
        ];
    }
    const projectRoot = path.resolve(typeof options.target === 'string' ? options.target : '.');
    return [
        { label: 'local', path: path.join(projectRoot, 'patterns', 'registry.yaml') },
        { label: 'package default', path: packageRegistry },
        { label: 'monorepo fallback', path: monorepoRegistry },
    ];
}
async function loadRegistryWithSource(candidates) {
    for (const candidate of candidates) {
        try {
            await access(candidate.path);
            return {
                registry: parsePatternRegistry(await readFile(candidate.path, 'utf8'), candidate.path),
                source: candidate,
            };
        }
        catch (err) {
            const code = typeof err === 'object' && err !== null && 'code' in err ? err.code : undefined;
            if (code === 'ENOENT')
                continue;
            throw err;
        }
    }
    throw new Error('Pattern registry not found.');
}
async function handleCostCommand({ io, options }) {
    const patternId = String(options.pattern ?? 'daily-triage');
    const cadence = typeof options.cadence === 'string' ? options.cadence : undefined;
    const level = String(options.level ?? 'L1');
    const conservative = options.conservative === true;
    const json = options.json === true;
    const list = options.list === true;
    const candidates = registryCandidates(options);
    const { registry, source: loadedRegistrySource } = await loadRegistryWithSource(candidates);
    if (list) {
        if (json) {
            io.stdout(JSON.stringify({
                registry: loadedRegistrySource,
                patterns: registry.patterns.map((p) => ({ id: p.id, token_cost: p.token_cost, cadence: p.cadence })),
            }, null, 2));
            return;
        }
        io.stdout(`Registry: ${loadedRegistrySource.label} ${loadedRegistrySource.path}`);
        for (const p of registry.patterns) {
            io.stdout(`${p.id}\t${p.token_cost}\t${p.cadence}`);
        }
        return;
    }
    const pattern = registry.patterns.find((p) => p.id === patternId);
    if (!pattern) {
        io.stderr(`Unknown pattern: ${patternId}. Use --list for ids.`);
        return 1;
    }
    try {
        assertValidLevel(level);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        io.stderr(msg);
        return 1;
    }
    if (!pattern.cost) {
        io.stderr(`Pattern ${patternId} has no cost block in registry.`);
        return 1;
    }
    const result = estimateCost({
        pattern,
        cadence,
        level,
        conservative,
    });
    if (json)
        io.stdout(JSON.stringify({ registry: loadedRegistrySource, estimate: result }, null, 2));
    else
        io.stdout(formatEstimateHuman(result, loadedRegistrySource));
}
const SPEC = {
    name: 'zj-loop-cost',
    usage: 'zj-loop-cost [project-root] --pattern <id> [options]',
    helpText: HELP_TEXT,
    options: [
        { name: 'target', type: 'positional', description: 'Project root', default: '.' },
        { name: 'pattern', alias: '-p', type: 'string', valueName: 'id', description: 'Pattern id', default: 'daily-triage' },
        { name: 'registry', type: 'string', valueName: 'path', description: 'Explicit registry file' },
        { name: 'packageRegistry', flag: 'package-registry', type: 'boolean', description: 'Use packaged registry first' },
        { name: 'cadence', alias: '-c', type: 'string', valueName: 'spec', description: 'Override cadence' },
        { name: 'level', alias: '-l', type: 'string', valueName: 'L1|L2|L3', description: 'Readiness level', default: 'L1' },
        { name: 'conservative', type: 'boolean', description: 'Use slower cadence from ranges' },
        { name: 'json', type: 'boolean', description: 'Machine-readable output' },
        { name: 'list', type: 'boolean', description: 'List pattern ids' },
    ],
    handler: handleCostCommand,
};
runCli(SPEC).then((exitCode) => {
    process.exitCode = exitCode;
});
