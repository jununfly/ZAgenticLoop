#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile, access, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPatternRegistry, runCli, type CliHandlerContext, type CliIo, type CliSpec, type RegistryPattern } from '@jununfly/zj-loop-core';
import { LOOP_ARTIFACTS } from './artifacts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const MONOREPO_STARTERS = path.resolve(PACKAGE_ROOT, '../../starters');
const MONOREPO_TEMPLATES = path.resolve(PACKAGE_ROOT, '../../templates');

type Tool = 'grok' | 'claude' | 'codex';
type AddArtifact = 'safety' | 'pattern-registry' | 'route-table' | 'github-actions';

type InitPattern = RegistryPattern & {
  state: string;
  starter: string;
  init: NonNullable<RegistryPattern['init']>;
};

const VALID_TOOLS: Tool[] = ['grok', 'claude', 'codex'];
const VALID_ADD_ARTIFACTS: AddArtifact[] = ['safety', 'pattern-registry', 'route-table', 'github-actions'];
const GITHUB_ACTIONS_WORKFLOW_TEMPLATES = [
  'zj-loop-smoke.yml',
  'zj-loop-daily-triage.yml',
  'zj-loop-ci-sweeper.yml',
  'zj-loop-pr-steward.yml',
  'zj-loop-issue-triage.yml',
  'zj-loop-dependency-sweeper.yml',
  'zj-loop-changelog-drafter.yml',
  'zj-loop-post-merge-cleanup.yml',
] as const;

async function loadRegistry() {
  return loadPatternRegistry({
    candidates: [
      path.join(PACKAGE_ROOT, 'registry.yaml'),
      path.resolve(PACKAGE_ROOT, '../../patterns/registry.yaml'),
    ],
  });
}

function requireInitPattern(pattern: RegistryPattern): InitPattern {
  if (!pattern.state) throw new Error(`Pattern ${pattern.id} is missing state in registry.`);
  if (!pattern.starter) throw new Error(`Pattern ${pattern.id} is missing starter in registry.`);
  if (!pattern.init) throw new Error(`Pattern ${pattern.id} is missing init block in registry.`);
  return pattern as InitPattern;
}

function starterName(starterPath: string): string {
  return starterPath.replace(/^starters\//, '');
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src: string, dest: string, dryRun: boolean, io: CliIo) {
  if (!(await exists(src))) return false;
  if (dryRun) {
    io.stdout(`  would copy: ${src} → ${dest}`);
    return true;
  }
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest, { recursive: true });
  io.stdout(`  copied: ${src} → ${dest}`);
  return true;
}

async function resolveBundledOrMonorepo(name: 'starters' | 'templates'): Promise<string> {
  const bundled = path.join(PACKAGE_ROOT, name);
  if (await exists(bundled)) return bundled;
  return name === 'starters' ? MONOREPO_STARTERS : MONOREPO_TEMPLATES;
}

function parseAddArtifacts(value: unknown): AddArtifact[] {
  if (value === undefined || value === false) return [];
  const artifacts = String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const invalid = artifacts.filter((artifact) => !VALID_ADD_ARTIFACTS.includes(artifact as AddArtifact));
  if (invalid.length) {
    throw new Error(`Unknown --add artifact: ${invalid.join(', ')}. Valid: ${VALID_ADD_ARTIFACTS.join(', ')}`);
  }
  return Array.from(new Set(artifacts)) as AddArtifact[];
}

async function copyIncrementalArtifact(
  src: string,
  dest: string,
  dryRun: boolean,
  force: boolean,
  io: CliIo,
  nextStep: string,
) {
  if (!(await exists(src))) {
    io.stderr(`  missing template: ${src}`);
    return false;
  }

  if ((await exists(dest)) && !force) {
    io.stdout(`  skipped: ${dest} already exists`);
    io.stdout(`  next step: ${nextStep}`);
    return true;
  }

  if (dryRun) {
    const verb = force ? 'would overwrite' : 'would copy';
    io.stdout(`  ${verb}: ${src} → ${dest}`);
    if (force) io.stdout('  WARNING: --force would overwrite the existing file; review the result before committing.');
    return true;
  }

  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest, { force: true });
  if (force) {
    io.stdout(`  OVERWRITTEN with --force: ${dest}`);
    io.stdout('  WARNING: review this policy/catalog file before committing.');
  } else {
    io.stdout(`  created: ${dest}`);
  }
  return true;
}

async function handleAddArtifacts(
  artifacts: AddArtifact[],
  targetDir: string,
  templatesRoot: string,
  patterns: InitPattern[],
  dryRun: boolean,
  force: boolean,
  io: CliIo,
) {
  io.stdout(`\nzj-loop-init --add: ${artifacts.join(', ')} → ${targetDir}${dryRun ? ' [dry-run]' : ''}${force ? ' [force]' : ''}\n`);

  for (const artifact of artifacts) {
    if (artifact === 'safety') {
      await copyIncrementalArtifact(
        path.join(templatesRoot, 'zj-loop-safety.md'),
        path.join(targetDir, 'zj-loop', 'zj-loop-safety.md'),
        dryRun,
        force,
        io,
        'review zj-loop/zj-loop-safety.md or rerun with --force to overwrite intentionally',
      );
    }

    if (artifact === 'pattern-registry') {
      await copyIncrementalArtifact(
        path.join(PACKAGE_ROOT, 'registry.yaml'),
        path.join(targetDir, 'patterns', 'registry.yaml'),
        dryRun,
        force,
        io,
        'review patterns/registry.yaml or rerun with --force to overwrite intentionally',
      );
    }

    if (artifact === 'route-table') {
      const defaultPattern = patterns.find((pattern) => pattern.id === 'daily-triage') ?? patterns[0];
      if (!defaultPattern) {
        io.stderr('  missing pattern metadata: cannot scaffold route table');
        continue;
      }
      const src = path.join(templatesRoot, LOOP_ARTIFACTS.routeTable.template);
      const dest = path.join(targetDir, LOOP_ARTIFACTS.routeTable.primary);
      if (!(await exists(src))) {
        io.stderr(`  missing template: ${src}`);
        continue;
      }
      if ((await exists(dest)) && !force) {
        io.stdout(`  skipped: ${LOOP_ARTIFACTS.routeTable.primary} already exists`);
        io.stdout('  next step: review zj-loop/zj-loop-route-table.yaml or rerun with --force to overwrite intentionally');
        continue;
      }
      if (dryRun) {
        const verb = force ? 'would overwrite' : 'would write';
        io.stdout(`  ${verb}: ${dest}`);
        if (force) io.stdout('  WARNING: --force would overwrite the existing route table; review the result before committing.');
        continue;
      }

      const template = await readFile(src, 'utf8');
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, buildRouteTableYaml(template, defaultPattern));
      if (force) {
        io.stdout(`  OVERWRITTEN with --force: ${LOOP_ARTIFACTS.routeTable.primary}`);
        io.stdout('  WARNING: review this route policy before committing.');
      } else {
        io.stdout(`  created: ${LOOP_ARTIFACTS.routeTable.primary}`);
      }
    }

    if (artifact === 'github-actions') {
      const defaultPattern = patterns.find((pattern) => pattern.id === 'daily-triage') ?? patterns[0];
      if (defaultPattern) {
        await scaffoldRouteTable(defaultPattern, targetDir, templatesRoot, dryRun, io);
      }
      await copyGitHubActionsBundle(targetDir, templatesRoot, dryRun, force, io);
    }
  }

  io.stdout(`\n=== Next steps ===
  npx @jununfly/zj-loop-audit ${targetDir} --suggest
  Review any created or overwritten policy/catalog files before committing.
`);

  return 0;
}

async function copyGitHubActionsBundle(
  targetDir: string,
  templatesRoot: string,
  dryRun: boolean,
  force: boolean,
  io: CliIo,
) {
  const srcDir = path.join(templatesRoot, 'github-actions');
  if (!(await exists(srcDir))) {
    io.stderr(`  missing template directory: ${srcDir}`);
    return;
  }

  for (const file of GITHUB_ACTIONS_WORKFLOW_TEMPLATES) {
    await copyRenderedWorkflowTemplate(
      path.join(srcDir, file),
      path.join(targetDir, '.github', 'workflows', file),
      dryRun,
      force,
      io,
      `review .github/workflows/${file} or rerun with --force to overwrite intentionally`,
    );
  }
}

async function copyRenderedWorkflowTemplate(
  src: string,
  dest: string,
  dryRun: boolean,
  force: boolean,
  io: CliIo,
  nextStep: string,
) {
  if (!(await exists(src))) {
    io.stderr(`  missing template: ${src}`);
    return false;
  }

  if ((await exists(dest)) && !force) {
    io.stdout(`  skipped: ${dest} already exists`);
    io.stdout(`  next step: ${nextStep}`);
    return true;
  }

  const body = renderWorkflowTemplate(await readFile(src, 'utf8'));
  if (dryRun) {
    const verb = force ? 'would overwrite' : 'would copy';
    io.stdout(`  ${verb}: ${src} → ${dest}`);
    if (force) io.stdout('  WARNING: --force would overwrite the existing file; review the result before committing.');
    return true;
  }

  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, body);
  if (force) {
    io.stdout(`  OVERWRITTEN with --force: ${dest}`);
    io.stdout('  WARNING: review this generated workflow before committing.');
  } else {
    io.stdout(`  created: ${dest}`);
  }
  return true;
}

async function upgradeGitHubActionsBundle(
  targetDir: string,
  templatesRoot: string,
  dryRun: boolean,
  io: CliIo,
) {
  const srcDir = path.join(templatesRoot, 'github-actions');
  io.stdout(`\nzj-loop-init --upgrade github-actions → ${targetDir}${dryRun ? ' [dry-run]' : ''}\n`);
  for (const file of GITHUB_ACTIONS_WORKFLOW_TEMPLATES) {
    const src = path.join(srcDir, file);
    const dest = path.join(targetDir, '.github', 'workflows', file);
    if (!(await exists(src))) {
      io.stderr(`  missing template: ${src}`);
      continue;
    }
    const nextBody = renderWorkflowTemplate(await readFile(src, 'utf8'));
    const nextHash = extractWorkflowTemplateHash(nextBody);
    if (!(await exists(dest))) {
      if (dryRun) {
        io.stdout(`  would create: ${dest}`);
      } else {
        await mkdir(path.dirname(dest), { recursive: true });
        await writeFile(dest, nextBody);
        io.stdout(`  created: ${dest}`);
      }
      continue;
    }

    const currentBody = await readFile(dest, 'utf8');
    const currentHash = extractWorkflowTemplateHash(currentBody);
    const currentContentHash = workflowTemplateHash(currentBody);
    const cleanGenerated = currentHash === nextHash && currentContentHash === currentHash;
    if (!cleanGenerated) {
      const backupPath = await nextBackupPath(dest);
      if (dryRun) {
        io.stdout(`  would backup modified workflow: ${dest} → ${backupPath}`);
        io.stdout(`  would write upgraded workflow: ${dest}`);
        continue;
      }
      await rename(dest, backupPath);
      io.stdout(`  backed up modified workflow: ${dest} → ${backupPath}`);
    }

    if (dryRun) {
      io.stdout(`  would write upgraded workflow: ${dest}`);
    } else {
      await writeFile(dest, nextBody);
      io.stdout(`  upgraded: ${dest}`);
    }
  }

  io.stdout(`\n=== Next steps ===
  Review .github/workflows/*.bak files if any were created.
  npx @jununfly/zj-loop-audit ${targetDir} --suggest
`);
  return 0;
}

function renderWorkflowTemplate(template: string): string {
  const hash = workflowTemplateHash(template);
  return template.replace(/^# zj-loop-template-hash: .+$/m, `# zj-loop-template-hash: ${hash}`);
}

function workflowTemplateHash(text: string): string {
  const canonical = text.replace(/^# zj-loop-template-hash: .+$/m, '# zj-loop-template-hash: <computed>');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

function extractWorkflowTemplateHash(text: string): string | null {
  return text.match(/^# zj-loop-template-hash: (?<hash>[a-f0-9]{16})$/m)?.groups?.hash ?? null;
}

async function nextBackupPath(dest: string): Promise<string> {
  let candidate = `${dest}.bak`;
  let index = 1;
  while (await exists(candidate)) {
    candidate = `${dest}.bak.${index}`;
    index += 1;
  }
  return candidate;
}

async function copyTemplateSkill(
  templatesRoot: string,
  templateFile: string,
  targetDir: string,
  tool: Tool,
  skillName: string,
  dryRun: boolean,
  io: CliIo,
) {
  const src = path.join(templatesRoot, templateFile);
  const destByTool: Record<Tool, string> = {
    grok: path.join(targetDir, '.grok', 'skills', skillName, 'SKILL.md'),
    claude: path.join(targetDir, '.claude', 'skills', skillName, 'SKILL.md'),
    codex: path.join(targetDir, '.codex', 'skills', skillName, 'SKILL.md'),
  };
  const dest = destByTool[tool];
  if (await exists(dest)) return;
  await copyFile(src, dest, dryRun, io);
}

async function copyTemplateVerifier(
  templatesRoot: string,
  targetDir: string,
  tool: Tool,
  dryRun: boolean,
  io: CliIo,
) {
  const verifierPaths: Record<Tool, string> = {
    grok: path.join(targetDir, '.grok', 'skills', 'zj-loop-verifier', 'SKILL.md'),
    claude: path.join(targetDir, '.claude', 'agents', 'zj-loop-verifier.md'),
    codex: path.join(targetDir, '.codex', 'agents', 'verifier.toml'),
  };
  const dest = verifierPaths[tool];
  if (await exists(dest)) return;

  if (tool === 'codex') {
    const src = path.join(templatesRoot, 'SKILL.md.zj-loop-verifier');
    const body = await readFile(src, 'utf8');
    const toml = `name = "zj-loop-verifier"\ndescription = "Independent verification agent for loop-produced changes."\n\n[system_prompt]\ncontent = """\n${body}\n"""\n`;
    if (dryRun) {
      io.stdout(`  would write verifier: ${dest}`);
      return;
    }
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, toml);
    io.stdout(`  created: ${dest} (from verifier template)`);
    return;
  }

  const src = path.join(templatesRoot, 'SKILL.md.zj-loop-verifier');
  await copyFile(src, dest, dryRun, io);
}

async function copyL2Templates(
  pattern: InitPattern,
  tool: Tool,
  targetDir: string,
  templatesRoot: string,
  dryRun: boolean,
  io: CliIo,
) {
  const templates = pattern.init.templates;
  if (!templates.minimal_fix && !templates.verifier) return;

  if (templates.minimal_fix) {
    await copyTemplateSkill(templatesRoot, 'SKILL.md.zj-minimal-fix', targetDir, tool, 'zj-minimal-fix', dryRun, io);
  }

  if (templates.verifier) {
    await copyTemplateVerifier(templatesRoot, targetDir, tool, dryRun, io);
  }
}

function formatTokenCap(n: number): string {
  if (n >= 1_000_000) return `${n / 1_000_000}M`;
  if (n >= 1_000) return `${n / 1_000}k`;
  return String(n);
}

function buildLoopBudgetMd(pattern: InitPattern): string {
  const { budget } = pattern.init;
  return `# Loop Budget — YOUR_PROJECT

> Primary loop: **${pattern.name}** (scaffolded by zj-loop-init)

## Daily limits

| Loop | Max runs/day | Max tokens/day | Max sub-agent spawns/run |
|------|--------------|----------------|--------------------------|
| ${pattern.name} | ${budget.max_runs_per_day} | ${formatTokenCap(pattern.cost.suggested_daily_cap)} | ${budget.max_spawns_l1} (L1) / ${budget.max_spawns_l2} (L2) |

## On budget exceed

1. Pause schedulers (\`scheduler_delete\` or disable automations)
2. Append event to \`${LOOP_ARTIFACTS.runLog.primary}\`
3. Notify human (Slack / issue / ${LOOP_ARTIFACTS.directory}/STATE.md High Priority)

## Kill switch

- Command or issue label: \`loop-pause-all\`
- Resume only after human clears the flag in ${LOOP_ARTIFACTS.directory}/STATE.md

## Estimate spend

\`\`\`bash
npx @jununfly/zj-loop-cost --pattern ${pattern.id}
\`\`\`
`;
}

async function scaffoldObservability(
  pattern: InitPattern,
  tool: Tool,
  targetDir: string,
  templatesRoot: string,
  dryRun: boolean,
  io: CliIo,
) {
  const budgetPath = path.join(targetDir, LOOP_ARTIFACTS.budget.primary);
  const runLogTemplate = path.join(templatesRoot, LOOP_ARTIFACTS.runLog.template);
  const runLogPath = path.join(targetDir, LOOP_ARTIFACTS.runLog.primary);

  if (!(await exists(budgetPath))) {
    const content = buildLoopBudgetMd(pattern);
    if (dryRun) {
      io.stdout(`  would write: ${budgetPath}`);
    } else {
      await writeFile(budgetPath, content);
      io.stdout(`  created: ${LOOP_ARTIFACTS.budget.primary}`);
    }
  }

  if (!(await exists(runLogPath))) {
    await copyFile(runLogTemplate, runLogPath, dryRun, io);
  }

  await copyTemplateSkill(
    templatesRoot,
    LOOP_ARTIFACTS.skills.budgetTemplate,
    targetDir,
    tool,
    LOOP_ARTIFACTS.skills.budget,
    dryRun,
    io,
  );
}

async function scaffoldConstraints(
  targetDir: string,
  templatesRoot: string,
  tool: Tool,
  dryRun: boolean,
  io: CliIo,
) {
  const constraintsPath = path.join(targetDir, LOOP_ARTIFACTS.constraints.primary);
  const constraintsTemplate = path.join(templatesRoot, LOOP_ARTIFACTS.constraints.template);

  if (!(await exists(constraintsPath)) && (await exists(constraintsTemplate))) {
    await copyFile(constraintsTemplate, constraintsPath, dryRun, io);
  }

  await copyTemplateSkill(
    templatesRoot,
    LOOP_ARTIFACTS.skills.constraintsTemplate,
    targetDir,
    tool,
    LOOP_ARTIFACTS.skills.constraints,
    dryRun,
    io,
  );
}

function buildRouteTableYaml(template: string, pattern: InitPattern): string {
  return template
    .replaceAll('__PATTERN_ID__', pattern.id)
    .replaceAll('__PATTERN_NAME__', pattern.name)
    .replaceAll('__PATTERN_STATE__', pattern.state);
}

async function scaffoldRouteTable(
  pattern: InitPattern,
  targetDir: string,
  templatesRoot: string,
  dryRun: boolean,
  io: CliIo,
) {
  const routeTablePath = path.join(targetDir, LOOP_ARTIFACTS.routeTable.primary);
  if (await exists(routeTablePath)) {
    io.stdout(`  skipped: ${LOOP_ARTIFACTS.routeTable.primary} already exists`);
    return;
  }

  const templatePath = path.join(templatesRoot, LOOP_ARTIFACTS.routeTable.template);
  if (!(await exists(templatePath))) return;
  if (dryRun) {
    io.stdout(`  would write: ${routeTablePath}`);
    return;
  }

  const template = await readFile(templatePath, 'utf8');
  await mkdir(path.dirname(routeTablePath), { recursive: true });
  await writeFile(routeTablePath, buildRouteTableYaml(template, pattern));
  io.stdout(`  created: ${LOOP_ARTIFACTS.routeTable.primary}`);
}

async function copyFile(src: string, dest: string, dryRun: boolean, io: CliIo) {
  if (!(await exists(src))) return false;
  if (dryRun) {
    io.stdout(`  would copy: ${src} → ${dest}`);
    return true;
  }
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest);
  io.stdout(`  copied: ${src} → ${dest}`);
  return true;
}

function firstLoopCommand(pattern: InitPattern, tool: Tool): string {
  return pattern.init.first_loop_command[tool];
}

async function handleInitCommand({ io, options }: CliHandlerContext) {
  let addArtifacts: AddArtifact[];
  try {
    addArtifacts = parseAddArtifacts(options.add);
  } catch (err) {
    io.stderr(err instanceof Error ? err.message : String(err));
    return 1;
  }
  const target = typeof options.target === 'string' ? options.target : '.';
  const targetDir = path.resolve(target);
  const dryRun = options.dryRun === true;
  const force = options.force === true;
  const registry = await loadRegistry();
  const patterns = registry.patterns.map(requireInitPattern);

  if (options.upgrade !== undefined && options.upgrade !== false) {
    const upgradeTarget = String(options.upgrade);
    if (upgradeTarget !== 'github-actions') {
      io.stderr('Unknown --upgrade target: ' + upgradeTarget + '. Valid: github-actions');
      return 1;
    }
    const templatesRoot = await resolveBundledOrMonorepo('templates');
    return upgradeGitHubActionsBundle(targetDir, templatesRoot, dryRun, io);
  }

  if (addArtifacts.length > 0) {
    const templatesRoot = await resolveBundledOrMonorepo('templates');
    return handleAddArtifacts(addArtifacts, targetDir, templatesRoot, patterns, dryRun, force, io);
  }

  const pattern = String(options.pattern ?? 'daily-triage');
  const tool = String(options.tool ?? 'grok') as Tool;

  const selectedPattern = patterns.find((p) => p.id === pattern);
  if (!selectedPattern) {
    io.stderr(`Unknown pattern: ${pattern}. Valid: ${patterns.map((p) => p.id).join(', ')}`);
    return 1;
  }
  if (!VALID_TOOLS.includes(tool)) {
    io.stderr(`Unknown tool: ${tool}. Valid: ${VALID_TOOLS.join(', ')}`);
    return 1;
  }

  const baseStarter = starterName(selectedPattern.starter);
  const starterNameForTool = starterName(selectedPattern.init.tool_starters?.[tool] ?? selectedPattern.starter);
  const startersRoot = await resolveBundledOrMonorepo('starters');
  const templatesRoot = await resolveBundledOrMonorepo('templates');
  const starterRoot = path.join(startersRoot, starterNameForTool);

  if (!(await exists(starterRoot))) {
    const fallback = path.join(startersRoot, baseStarter);
    if (!(await exists(fallback))) {
      io.stderr(`Starter not found: ${starterRoot}`);
      return 1;
    }
    io.stdout(`Note: no ${tool} variant for ${pattern} — using ${baseStarter} (Grok paths)`);
  }

  const effectiveStarter = (await exists(starterRoot))
    ? starterRoot
    : path.join(startersRoot, baseStarter);

  io.stdout(`\nzj-loop-init: ${pattern} → ${targetDir} (${tool})${dryRun ? ' [dry-run]' : ''}\n`);

  const skillRoots = [
    path.join(effectiveStarter, '.grok', 'skills'),
    path.join(effectiveStarter, '.claude', 'skills'),
    path.join(effectiveStarter, '.codex', 'skills'),
  ];

  for (const skillsDir of skillRoots) {
    if (!(await exists(skillsDir))) continue;
    const toolPrefix = skillsDir.includes('.grok')
      ? '.grok/skills'
      : skillsDir.includes('.claude')
        ? '.claude/skills'
        : '.codex/skills';
    const entries = await readDirNames(skillsDir);
    for (const entry of entries) {
      await copyDir(
        path.join(skillsDir, entry),
        path.join(targetDir, toolPrefix, entry),
        dryRun,
        io,
      );
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
        await copyFile(path.join(src, entry), path.join(dest, entry), dryRun, io);
      }
    }
  }

  const stateOutputPath = selectedPattern.state.includes('/')
    ? selectedPattern.state
    : path.join(LOOP_ARTIFACTS.directory, selectedPattern.state);
  const stateFile = path.basename(stateOutputPath);
  const stateExample = path.join(effectiveStarter, `${stateFile}.example`);
  const stateDest = path.join(targetDir, stateOutputPath);
  if (await exists(stateExample)) {
    await copyFile(stateExample, stateDest, dryRun, io);
  } else {
    const alt = path.join(effectiveStarter, 'STATE.md.example');
    if (await exists(alt)) {
      await copyFile(alt, stateDest, dryRun, io);
    }
  }

  const loopMd = path.join(effectiveStarter, 'ZJ-LOOP.md');
  if (await exists(loopMd)) {
    await copyFile(loopMd, path.join(targetDir, LOOP_ARTIFACTS.config.primary), dryRun, io);
  }

  await copyL2Templates(selectedPattern, tool, targetDir, templatesRoot, dryRun, io);
  await scaffoldObservability(selectedPattern, tool, targetDir, templatesRoot, dryRun, io);

  await scaffoldConstraints(targetDir, templatesRoot, tool, dryRun, io);
  await scaffoldRouteTable(selectedPattern, targetDir, templatesRoot, dryRun, io);
  if (!dryRun && !(await exists(path.join(targetDir, 'AGENTS.md')))) {
    const agentsTemplate = `# AGENTS.md

## Test commands
npm test
npm run lint

## Loop conventions
- Report-only week one (L1) before enabling auto-fix (L2)
- See ${LOOP_ARTIFACTS.config.primary} for cadence and human gates
`;
    await writeFile(path.join(targetDir, 'AGENTS.md'), agentsTemplate);
    io.stdout('  created: AGENTS.md (template)');
  }

  io.stdout(`\n=== Next steps ===
  npx @jununfly/zj-loop-audit ${target === '.' ? '.' : target} --suggest
  npx @jununfly/zj-loop-cost --pattern ${pattern}
  First loop command (${tool}):
  ${firstLoopCommand(selectedPattern, tool)}
`);

  return 0;
}

async function readDirNames(dir: string): Promise<string[]> {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory() || e.isFile()).map((e) => e.name);
}

async function helpText() {
  const registry = await loadRegistry();
  const patterns = registry.patterns.map(requireInitPattern);
  const patternList = patterns.map((p) => `  ${p.id}`).join('\n');
  return `zj-loop-init — scaffold agentic loop working starters

Usage:
  zj-loop-init [target-dir] --pattern <name> --tool <grok|claude|codex>
  zj-loop-init [target-dir] --add <safety|pattern-registry|route-table|github-actions>[,...] [--force]
  zj-loop-init [target-dir] --upgrade github-actions

Patterns:
${patternList}

Options:
  -p, --pattern   Pattern to scaffold
  -t, --tool      Tool target (default: grok)
  --add           Add explicit optional artifacts: safety, pattern-registry, route-table, github-actions
  --upgrade       Upgrade generated artifacts: github-actions
  --force         Overwrite existing --add targets instead of skipping
  --dry-run       Print actions without copying
  -h, --help      This help

Examples:
  npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok
  npx @jununfly/zj-loop-init . --add safety,pattern-registry,route-table,github-actions
  npx @jununfly/zj-loop-init . --upgrade github-actions
  npx @jununfly/zj-loop-init . -p pr-steward -t claude
`;
}

const SPEC: CliSpec = {
  name: 'zj-loop-init',
  usage: 'zj-loop-init [target-dir] --pattern <name> --tool <grok|claude|codex>',
  helpText,
  options: [
    { name: 'target', type: 'positional', description: 'Target directory', default: '.' },
    { name: 'pattern', alias: '-p', type: 'string', description: 'Pattern to scaffold', default: 'daily-triage' },
    { name: 'tool', alias: '-t', type: 'string', description: 'Tool target', default: 'grok' },
    { name: 'add', type: 'string', description: 'Add explicit optional artifacts' },
    { name: 'upgrade', type: 'string', description: 'Upgrade generated artifacts' },
    { name: 'force', type: 'boolean', description: 'Overwrite existing --add targets' },
    { name: 'dryRun', flag: 'dry-run', type: 'boolean', description: 'Print actions without copying' },
  ],
  handler: handleInitCommand,
};

runCli(SPEC).then((exitCode) => {
  process.exitCode = exitCode;
});
