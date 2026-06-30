#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPatternRegistry } from '@jununfly/zj-loop-core';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const MONOREPO_STARTERS = path.resolve(PACKAGE_ROOT, '../../starters');
const MONOREPO_TEMPLATES = path.resolve(PACKAGE_ROOT, '../../templates');
const VALID_TOOLS = ['grok', 'claude', 'codex'];
function parseArgs(argv) {
    let pattern = 'daily-triage';
    let tool = 'grok';
    let target = '.';
    let dryRun = false;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--pattern' || a === '-p')
            pattern = argv[++i];
        else if (a === '--tool' || a === '-t')
            tool = argv[++i];
        else if (a === '--dry-run')
            dryRun = true;
        else if (a === '--help' || a === '-h')
            return { help: true, pattern, tool, target, dryRun };
        else if (!a.startsWith('-'))
            target = a;
    }
    return { help: false, pattern, tool, target, dryRun };
}
async function loadRegistry() {
    return loadPatternRegistry({
        candidates: [
            path.join(PACKAGE_ROOT, 'registry.yaml'),
            path.resolve(PACKAGE_ROOT, '../../patterns/registry.yaml'),
        ],
    });
}
function requireInitPattern(pattern) {
    if (!pattern.state)
        throw new Error(`Pattern ${pattern.id} is missing state in registry.`);
    if (!pattern.starter)
        throw new Error(`Pattern ${pattern.id} is missing starter in registry.`);
    if (!pattern.init)
        throw new Error(`Pattern ${pattern.id} is missing init block in registry.`);
    return pattern;
}
function starterName(starterPath) {
    return starterPath.replace(/^starters\//, '');
}
async function exists(p) {
    try {
        await access(p);
        return true;
    }
    catch {
        return false;
    }
}
async function copyDir(src, dest, dryRun) {
    if (!(await exists(src)))
        return false;
    if (dryRun) {
        console.log(`  would copy: ${src} → ${dest}`);
        return true;
    }
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(src, dest, { recursive: true });
    console.log(`  copied: ${src} → ${dest}`);
    return true;
}
async function resolveBundledOrMonorepo(name) {
    const bundled = path.join(PACKAGE_ROOT, name);
    if (await exists(bundled))
        return bundled;
    return name === 'starters' ? MONOREPO_STARTERS : MONOREPO_TEMPLATES;
}
async function copyTemplateSkill(templatesRoot, templateFile, targetDir, tool, skillName, dryRun) {
    const src = path.join(templatesRoot, templateFile);
    const destByTool = {
        grok: path.join(targetDir, '.grok', 'skills', skillName, 'SKILL.md'),
        claude: path.join(targetDir, '.claude', 'skills', skillName, 'SKILL.md'),
        codex: path.join(targetDir, '.codex', 'skills', skillName, 'SKILL.md'),
    };
    const dest = destByTool[tool];
    if (await exists(dest))
        return;
    await copyFile(src, dest, dryRun);
}
async function copyTemplateVerifier(templatesRoot, targetDir, tool, dryRun) {
    const verifierPaths = {
        grok: path.join(targetDir, '.grok', 'skills', 'loop-verifier', 'SKILL.md'),
        claude: path.join(targetDir, '.claude', 'agents', 'loop-verifier.md'),
        codex: path.join(targetDir, '.codex', 'agents', 'verifier.toml'),
    };
    const dest = verifierPaths[tool];
    if (await exists(dest))
        return;
    if (tool === 'codex') {
        const src = path.join(templatesRoot, 'SKILL.md.verifier');
        const body = await readFile(src, 'utf8');
        const toml = `name = "loop-verifier"\ndescription = "Independent verification agent for loop-produced changes."\n\n[system_prompt]\ncontent = """\n${body}\n"""\n`;
        if (dryRun) {
            console.log(`  would write verifier: ${dest}`);
            return;
        }
        await mkdir(path.dirname(dest), { recursive: true });
        await writeFile(dest, toml);
        console.log(`  created: ${dest} (from verifier template)`);
        return;
    }
    const src = path.join(templatesRoot, 'SKILL.md.verifier');
    await copyFile(src, dest, dryRun);
}
async function copyL2Templates(pattern, tool, targetDir, templatesRoot, dryRun) {
    const templates = pattern.init.templates;
    if (!templates.minimal_fix && !templates.verifier)
        return;
    if (templates.minimal_fix) {
        await copyTemplateSkill(templatesRoot, 'SKILL.md.minimal-fix', targetDir, tool, 'minimal-fix', dryRun);
    }
    if (templates.verifier) {
        await copyTemplateVerifier(templatesRoot, targetDir, tool, dryRun);
    }
}
function formatTokenCap(n) {
    if (n >= 1_000_000)
        return `${n / 1_000_000}M`;
    if (n >= 1_000)
        return `${n / 1_000}k`;
    return String(n);
}
function buildLoopBudgetMd(pattern) {
    const { budget } = pattern.init;
    return `# Loop Budget — YOUR_PROJECT

> Primary loop: **${pattern.name}** (scaffolded by zj-loop-init)

## Daily limits

| Loop | Max runs/day | Max tokens/day | Max sub-agent spawns/run |
|------|--------------|----------------|--------------------------|
| ${pattern.name} | ${budget.max_runs_per_day} | ${formatTokenCap(pattern.cost.suggested_daily_cap)} | ${budget.max_spawns_l1} (L1) / ${budget.max_spawns_l2} (L2) |

## On budget exceed

1. Pause schedulers (\`scheduler_delete\` or disable automations)
2. Append event to \`loop-run-log.md\`
3. Notify human (Slack / issue / STATE.md High Priority)

## Kill switch

- Command or issue label: \`loop-pause-all\`
- Resume only after human clears the flag in STATE.md

## Estimate spend

\`\`\`bash
npx @jununfly/zj-loop-cost --pattern ${pattern.id}
\`\`\`
`;
}
async function scaffoldObservability(pattern, tool, targetDir, templatesRoot, dryRun) {
    const budgetPath = path.join(targetDir, 'loop-budget.md');
    const runLogTemplate = path.join(templatesRoot, 'loop-run-log.md.template');
    const runLogPath = path.join(targetDir, 'loop-run-log.md');
    if (!(await exists(budgetPath))) {
        const content = buildLoopBudgetMd(pattern);
        if (dryRun) {
            console.log(`  would write: ${budgetPath}`);
        }
        else {
            await writeFile(budgetPath, content);
            console.log(`  created: loop-budget.md`);
        }
    }
    if (!(await exists(runLogPath))) {
        await copyFile(runLogTemplate, runLogPath, dryRun);
    }
    await copyTemplateSkill(templatesRoot, 'SKILL.md.loop-budget', targetDir, tool, 'loop-budget', dryRun);
}
async function scaffoldConstraints(targetDir, templatesRoot, tool, dryRun) {
    const constraintsPath = path.join(targetDir, 'loop-constraints.md');
    const constraintsTemplate = path.join(templatesRoot, 'loop-constraints.md');
    if (!(await exists(constraintsPath)) && (await exists(constraintsTemplate))) {
        await copyFile(constraintsTemplate, constraintsPath, dryRun);
    }
    await copyTemplateSkill(templatesRoot, 'SKILL.md.loop-constraints', targetDir, tool, 'loop-constraints', dryRun);
}
async function copyFile(src, dest, dryRun) {
    if (!(await exists(src)))
        return false;
    if (dryRun) {
        console.log(`  would copy: ${src} → ${dest}`);
        return true;
    }
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(src, dest);
    console.log(`  copied: ${src} → ${dest}`);
    return true;
}
function firstLoopCommand(pattern, tool) {
    return pattern.init.first_loop_command[tool];
}
async function main() {
    const args = parseArgs(process.argv.slice(2));
    const registry = await loadRegistry();
    const patterns = registry.patterns.map(requireInitPattern);
    if (args.help) {
        const patternList = patterns.map((p) => `  ${p.id}`).join('\n');
        console.log(`zj-loop-init — scaffold agentic loop working starters

Usage:
  zj-loop-init [target-dir] --pattern <name> --tool <grok|claude|codex>

Patterns:
${patternList}

Options:
  -p, --pattern   Pattern to scaffold
  -t, --tool      Tool target (default: grok)
  --dry-run       Print actions without copying
  -h, --help      This help

Examples:
  npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok
  npx @jununfly/zj-loop-init . -p pr-babysitter -t claude
`);
        process.exit(0);
    }
    const { pattern, tool, target, dryRun } = args;
    const selectedPattern = patterns.find((p) => p.id === pattern);
    if (!selectedPattern) {
        console.error(`Unknown pattern: ${pattern}. Valid: ${patterns.map((p) => p.id).join(', ')}`);
        process.exit(1);
    }
    if (!VALID_TOOLS.includes(tool)) {
        console.error(`Unknown tool: ${tool}. Valid: ${VALID_TOOLS.join(', ')}`);
        process.exit(1);
    }
    const targetDir = path.resolve(target);
    const baseStarter = starterName(selectedPattern.starter);
    const starterNameForTool = starterName(selectedPattern.init.tool_starters?.[tool] ?? selectedPattern.starter);
    const startersRoot = await resolveBundledOrMonorepo('starters');
    const templatesRoot = await resolveBundledOrMonorepo('templates');
    const starterRoot = path.join(startersRoot, starterNameForTool);
    if (!(await exists(starterRoot))) {
        const fallback = path.join(startersRoot, baseStarter);
        if (!(await exists(fallback))) {
            console.error(`Starter not found: ${starterRoot}`);
            process.exit(1);
        }
        console.log(`Note: no ${tool} variant for ${pattern} — using ${baseStarter} (Grok paths)`);
    }
    const effectiveStarter = (await exists(starterRoot))
        ? starterRoot
        : path.join(startersRoot, baseStarter);
    console.log(`\nzj-loop-init: ${pattern} → ${targetDir} (${tool})${dryRun ? ' [dry-run]' : ''}\n`);
    const skillRoots = [
        path.join(effectiveStarter, '.grok', 'skills'),
        path.join(effectiveStarter, '.claude', 'skills'),
        path.join(effectiveStarter, '.codex', 'skills'),
    ];
    for (const skillsDir of skillRoots) {
        if (!(await exists(skillsDir)))
            continue;
        const toolPrefix = skillsDir.includes('.grok')
            ? '.grok/skills'
            : skillsDir.includes('.claude')
                ? '.claude/skills'
                : '.codex/skills';
        const entries = await readDirNames(skillsDir);
        for (const entry of entries) {
            await copyDir(path.join(skillsDir, entry), path.join(targetDir, toolPrefix, entry), dryRun);
        }
    }
    const agentFiles = [
        { src: path.join(effectiveStarter, '.claude', 'agents'), dest: path.join(targetDir, '.claude', 'agents') },
        { src: path.join(effectiveStarter, '.codex', 'agents'), dest: path.join(targetDir, '.codex', 'agents') },
    ];
    for (const { src, dest } of agentFiles) {
        if (await exists(src)) {
            const entries = await readDirNames(src);
            for (const entry of entries) {
                await copyFile(path.join(src, entry), path.join(dest, entry), dryRun);
            }
        }
    }
    const stateFile = selectedPattern.state;
    const stateExample = path.join(effectiveStarter, `${stateFile}.example`);
    if (await exists(stateExample)) {
        await copyFile(stateExample, path.join(targetDir, stateFile), dryRun);
    }
    else {
        const alt = path.join(effectiveStarter, 'STATE.md.example');
        if (await exists(alt)) {
            await copyFile(alt, path.join(targetDir, stateFile), dryRun);
        }
    }
    const loopMd = path.join(effectiveStarter, 'LOOP.md');
    if (await exists(loopMd)) {
        await copyFile(loopMd, path.join(targetDir, 'LOOP.md'), dryRun);
    }
    await copyL2Templates(selectedPattern, tool, targetDir, templatesRoot, dryRun);
    await scaffoldObservability(selectedPattern, tool, targetDir, templatesRoot, dryRun);
    await scaffoldConstraints(targetDir, templatesRoot, tool, dryRun);
    if (!dryRun && !(await exists(path.join(targetDir, 'AGENTS.md')))) {
        const agentsTemplate = `# AGENTS.md

## Test commands
npm test
npm run lint

## Loop conventions
- Report-only week one (L1) before enabling auto-fix (L2)
- See LOOP.md for cadence and human gates
`;
        await writeFile(path.join(targetDir, 'AGENTS.md'), agentsTemplate);
        console.log('  created: AGENTS.md (template)');
    }
    console.log('\n=== Next steps ===');
    console.log(`  npx @jununfly/zj-loop-audit ${target === '.' ? '.' : target} --suggest`);
    console.log(`  npx @jununfly/zj-loop-cost --pattern ${pattern}`);
    console.log(`  First loop command (${tool}):\n  ${firstLoopCommand(selectedPattern, tool)}\n`);
}
async function readDirNames(dir) {
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() || e.isFile()).map((e) => e.name);
}
main().catch((err) => {
    console.error('zj-loop-init failed:', err instanceof Error ? err.message : err);
    process.exit(1);
});
