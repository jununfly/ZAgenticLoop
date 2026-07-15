#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile, access, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPatternRegistry, runCli } from '@jununfly/zj-loop-core';
import { LOOP_ARTIFACTS } from './artifacts.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const MONOREPO_STARTERS = path.resolve(PACKAGE_ROOT, '../../starters');
const MONOREPO_TEMPLATES = path.resolve(PACKAGE_ROOT, '../../templates');
const execFileAsync = promisify(execFile);
const VALID_TOOLS = ['grok', 'claude', 'codex'];
const VALID_ADD_ARTIFACTS = ['safety', 'pattern-registry', 'route-table', 'github-actions', 'gitlab-ci'];
const GITHUB_ACTIONS_WORKFLOW_TEMPLATES = [
    'zj-loop-smoke.yml',
    'zj-loop-daily-triage.yml',
    'zj-loop-ci-sweeper.yml',
    'zj-loop-pr-steward.yml',
    'zj-loop-issue-triage.yml',
    'zj-loop-dependency-sweeper.yml',
    'zj-loop-changelog-drafter.yml',
    'zj-loop-roadmap-activation.yml',
    'zj-loop-post-merge-cleanup.yml',
];
const GITLAB_CI_TEMPLATE_FILES = [
    'zj-loop-smoke.yml',
    'zj-loop-daily-triage.yml',
    'zj-loop-ci-sweeper.yml',
    'zj-loop-pr-steward.yml',
    'zj-loop-issue-triage.yml',
    'zj-loop-dependency-sweeper.yml',
    'zj-loop-changelog-drafter.yml',
    'zj-loop-roadmap-activation.yml',
    'zj-loop-post-merge-cleanup.yml',
];
const DEFAULT_GITLAB_STAGE = 'zj-loop';
const DEFAULT_GITLAB_IMAGE = 'node:22';
const DEFAULT_GITLAB_CORE_PACKAGE = '@jununfly/zj-loop-core@0.1.7';
const GITLAB_VENDOR_TARBALL_PROBE = 'zj-loop/vendor/jununfly-zj-loop-core-0.1.7.tgz';
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
async function copyDir(src, dest, dryRun, io) {
    if (!(await exists(src)))
        return false;
    if (dryRun) {
        io.stdout(`  would copy: ${src} → ${dest}`);
        return true;
    }
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(src, dest, { recursive: true });
    io.stdout(`  copied: ${src} → ${dest}`);
    return true;
}
async function resolveBundledOrMonorepo(name) {
    const bundled = path.join(PACKAGE_ROOT, name);
    if (await exists(bundled))
        return bundled;
    return name === 'starters' ? MONOREPO_STARTERS : MONOREPO_TEMPLATES;
}
function parseAddArtifacts(value) {
    if (value === undefined || value === false)
        return [];
    const artifacts = String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    const invalid = artifacts.filter((artifact) => !VALID_ADD_ARTIFACTS.includes(artifact));
    if (invalid.length) {
        throw new Error(`Unknown --add artifact: ${invalid.join(', ')}. Valid: ${VALID_ADD_ARTIFACTS.join(', ')}`);
    }
    return Array.from(new Set(artifacts));
}
function normalizeGitLabStage(value) {
    const stage = String(value ?? DEFAULT_GITLAB_STAGE).trim();
    if (!stage)
        throw new Error('--gitlab-stage must not be empty');
    if (/[\r\n]/.test(stage))
        throw new Error('--gitlab-stage must be a single line');
    return stage;
}
function normalizeGitLabRunnerTags(value) {
    if (value === undefined || value === false || value === '')
        return [];
    const tags = String(value)
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
    for (const tag of tags) {
        if (/[\r\n]/.test(tag))
            throw new Error('--gitlab-runner-tags entries must be single-line values');
    }
    return Array.from(new Set(tags));
}
function normalizeGitLabImage(value) {
    const image = String(value ?? DEFAULT_GITLAB_IMAGE).trim();
    if (!image)
        throw new Error('--gitlab-image must not be empty');
    if (/[\r\n]/.test(image))
        throw new Error('--gitlab-image must be a single line');
    return image;
}
function normalizeGitLabCorePackage(value) {
    const packageSource = String(value ?? DEFAULT_GITLAB_CORE_PACKAGE).trim();
    if (!packageSource)
        throw new Error('--gitlab-core-package must not be empty');
    if (/[\r\n]/.test(packageSource))
        throw new Error('--gitlab-core-package must be a single line');
    return packageSource;
}
async function copyIncrementalArtifact(src, dest, dryRun, force, io, nextStep) {
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
        if (force)
            io.stdout('  WARNING: --force would overwrite the existing file; review the result before committing.');
        return true;
    }
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(src, dest, { force: true });
    if (force) {
        io.stdout(`  OVERWRITTEN with --force: ${dest}`);
        io.stdout('  WARNING: review this policy/catalog file before committing.');
    }
    else {
        io.stdout(`  created: ${dest}`);
    }
    return true;
}
async function handleAddArtifacts(artifacts, targetDir, templatesRoot, patterns, dryRun, force, io, gitlabStage, gitlabRunnerTags, gitlabImage, gitlabCorePackage) {
    io.stdout(`\nzj-loop-init --add: ${artifacts.join(', ')} → ${targetDir}${dryRun ? ' [dry-run]' : ''}${force ? ' [force]' : ''}\n`);
    for (const artifact of artifacts) {
        if (artifact === 'safety') {
            await copyIncrementalArtifact(path.join(templatesRoot, 'zj-loop-safety.md'), path.join(targetDir, 'zj-loop', 'zj-loop-safety.md'), dryRun, force, io, 'review zj-loop/zj-loop-safety.md or rerun with --force to overwrite intentionally');
        }
        if (artifact === 'pattern-registry') {
            await copyIncrementalArtifact(path.join(PACKAGE_ROOT, 'registry.yaml'), path.join(targetDir, 'patterns', 'registry.yaml'), dryRun, force, io, 'review patterns/registry.yaml or rerun with --force to overwrite intentionally');
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
                if (force)
                    io.stdout('  WARNING: --force would overwrite the existing route table; review the result before committing.');
                continue;
            }
            const template = await readFile(src, 'utf8');
            await mkdir(path.dirname(dest), { recursive: true });
            await writeFile(dest, buildRouteTableYaml(template, defaultPattern));
            if (force) {
                io.stdout(`  OVERWRITTEN with --force: ${LOOP_ARTIFACTS.routeTable.primary}`);
                io.stdout('  WARNING: review this route policy before committing.');
            }
            else {
                io.stdout(`  created: ${LOOP_ARTIFACTS.routeTable.primary}`);
            }
        }
        if (artifact === 'github-actions') {
            const provider = await detectProjectProvider(targetDir);
            if (provider === 'gitlab' && !force) {
                io.stderr('Refusing to install the GitHub Actions adapter in a detected GitLab project. ' +
                    'Start with local loop files and zj-loop/zj-loop-route-table.yaml, or rerun with --force if this repository intentionally mirrors GitHub Actions.');
                return 1;
            }
            if (provider === 'gitlab' && force) {
                io.stdout('  WARNING: detected GitLab project; --force will install GitHub Actions workflows as an explicit provider-adapter override.');
            }
            const defaultPattern = patterns.find((pattern) => pattern.id === 'daily-triage') ?? patterns[0];
            if (defaultPattern) {
                await scaffoldRouteTable(defaultPattern, targetDir, templatesRoot, dryRun, io);
            }
            await copyGitHubActionsBundle(targetDir, templatesRoot, dryRun, force, io);
        }
        if (artifact === 'gitlab-ci') {
            const defaultPattern = patterns.find((pattern) => pattern.id === 'daily-triage') ?? patterns[0];
            let routeTableStatus = 'missing-template';
            if (defaultPattern) {
                routeTableStatus = await scaffoldRouteTable(defaultPattern, targetDir, templatesRoot, dryRun, io);
            }
            await copyGitLabCiBundle(targetDir, templatesRoot, dryRun, force, io, gitlabStage, gitlabRunnerTags, gitlabImage, gitlabCorePackage, routeTableStatus);
        }
    }
    io.stdout(`\n=== Next steps ===
  npx --yes --package @jununfly/zj-loop-core@0.1.7 zj-loop-first-run plan --root ${targetDir}
  npx --yes --package @jununfly/zj-loop-core@0.1.7 zj-loop-first-run plan --root ${targetDir} --json
  npx @jununfly/zj-loop-audit ${targetDir} --suggest
  Review any created or overwritten policy/catalog files before committing.
`);
    return 0;
}
async function detectProjectProvider(targetDir) {
    const gitConfig = (await readTextIfExists(path.join(targetDir, '.git', 'config'))) ?? '';
    const remote = extractOriginRemote(gitConfig).toLowerCase();
    const githubActions = await exists(path.join(targetDir, '.github', 'workflows'));
    const gitlabCi = await exists(path.join(targetDir, '.gitlab-ci.yml'));
    const glabMentioned = await hasGlabMention(targetDir);
    if (remote.includes('github.com') || githubActions)
        return 'github';
    if (remote.includes('gitlab') || gitlabCi || glabMentioned)
        return 'gitlab';
    return 'manual';
}
async function readTextIfExists(filePath) {
    try {
        return await readFile(filePath, 'utf8');
    }
    catch {
        return null;
    }
}
function extractOriginRemote(gitConfig) {
    const lines = String(gitConfig ?? '').split(/\r?\n/);
    let inOrigin = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (/^\[remote\s+"origin"\]$/.test(trimmed)) {
            inOrigin = true;
            continue;
        }
        if (/^\[.+\]$/.test(trimmed)) {
            inOrigin = false;
            continue;
        }
        if (inOrigin && trimmed.startsWith('url =')) {
            return trimmed.slice('url ='.length).trim();
        }
    }
    return '';
}
async function hasGlabMention(targetDir) {
    for (const candidate of ['zj-loop/ZJ-LOOP.md', 'README.md', 'AGENTS.md', 'CLAUDE.md']) {
        const content = await readTextIfExists(path.join(targetDir, candidate));
        if (content && /\bglab\b/i.test(content))
            return true;
    }
    return false;
}
async function copyGitHubActionsBundle(targetDir, templatesRoot, dryRun, force, io) {
    const srcDir = path.join(templatesRoot, 'github-actions');
    if (!(await exists(srcDir))) {
        io.stderr(`  missing template directory: ${srcDir}`);
        return;
    }
    for (const file of GITHUB_ACTIONS_WORKFLOW_TEMPLATES) {
        await copyRenderedWorkflowTemplate(path.join(srcDir, file), path.join(targetDir, '.github', 'workflows', file), dryRun, force, io, `review .github/workflows/${file} or rerun with --force to overwrite intentionally`);
    }
}
async function copyGitLabCiBundle(targetDir, templatesRoot, dryRun, force, io, gitlabStage, gitlabRunnerTags, gitlabImage, gitlabCorePackage, routeTableStatus) {
    const srcDir = path.join(templatesRoot, 'gitlab-ci');
    if (!(await exists(srcDir))) {
        io.stderr(`  missing template directory: ${srcDir}`);
        return;
    }
    const rootDest = path.join(targetDir, '.gitlab-ci.yml');
    const rootCiExistsBefore = await exists(rootDest);
    if (rootCiExistsBefore) {
        io.stdout(`  skipped: ${rootDest} already exists`);
        io.stdout('  next step: review .gitlab-ci.yml and include zj-loop/gitlab-ci/*.yml manually if this project already owns GitLab CI');
    }
    else {
        await copyRenderedWorkflowTemplate(path.join(srcDir, 'zj-loop-root.gitlab-ci.yml'), rootDest, dryRun, force, io, 'review .gitlab-ci.yml and include zj-loop/gitlab-ci/*.yml manually if this project already owns GitLab CI', { gitlabStage, gitlabRunnerTags, gitlabImage, gitlabCorePackage });
    }
    for (const file of GITLAB_CI_TEMPLATE_FILES) {
        await copyRenderedWorkflowTemplate(path.join(srcDir, file), path.join(targetDir, 'zj-loop', 'gitlab-ci', file), dryRun, force, io, `review zj-loop/gitlab-ci/${file} or rerun with --force to overwrite intentionally`, { gitlabStage, gitlabRunnerTags, gitlabImage, gitlabCorePackage });
    }
    await warnIfGitLabVendorTarballsIgnored(targetDir, io);
    printGitLabCiReadinessSummary(io, {
        mode: 'add',
        rootCiExistsBefore,
        rootCiWillBePatched: !rootCiExistsBefore,
        routeTableStatus,
        gitlabStage,
        gitlabRunnerTags,
        gitlabImage,
        gitlabCorePackage,
    });
}
async function copyRenderedWorkflowTemplate(src, dest, dryRun, force, io, nextStep, renderOptions = {}) {
    if (!(await exists(src))) {
        io.stderr(`  missing template: ${src}`);
        return false;
    }
    if ((await exists(dest)) && !force) {
        io.stdout(`  skipped: ${dest} already exists`);
        io.stdout(`  next step: ${nextStep}`);
        return true;
    }
    const body = renderWorkflowTemplate(await readFile(src, 'utf8'), renderOptions);
    if (dryRun) {
        const verb = force ? 'would overwrite' : 'would copy';
        io.stdout(`  ${verb}: ${src} → ${dest}`);
        if (force)
            io.stdout('  WARNING: --force would overwrite the existing file; review the result before committing.');
        return true;
    }
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, body);
    if (force) {
        io.stdout(`  OVERWRITTEN with --force: ${dest}`);
        io.stdout('  WARNING: review this generated workflow before committing.');
    }
    else {
        io.stdout(`  created: ${dest}`);
    }
    return true;
}
async function upgradeGitHubActionsBundle(targetDir, templatesRoot, dryRun, force, io) {
    const provider = await detectProjectProvider(targetDir);
    if (provider === 'gitlab' && !force) {
        io.stderr('Refusing to upgrade/install the GitHub Actions adapter in a detected GitLab project. ' +
            'Rerun with --force only if this repository intentionally mirrors GitHub Actions.');
        return 1;
    }
    if (provider === 'gitlab' && force) {
        io.stdout('  WARNING: detected GitLab project; --force will upgrade GitHub Actions workflows as an explicit provider-adapter override.');
    }
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
            }
            else {
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
        }
        else {
            await writeFile(dest, nextBody);
            io.stdout(`  upgraded: ${dest}`);
        }
    }
    io.stdout(`\n=== Next steps ===
  Review .github/workflows/*.bak files if any were created.
  Route Table enablement is preserved; rerun first-run planning to review current automation intent.
  npx --yes --package @jununfly/zj-loop-core@0.1.7 zj-loop-first-run plan --root ${targetDir}
  npx --yes --package @jununfly/zj-loop-core@0.1.7 zj-loop-first-run plan --root ${targetDir} --json
  npx @jununfly/zj-loop-audit ${targetDir} --suggest
  `);
    return 0;
}
async function upgradeGitLabCiBundle(targetDir, templatesRoot, defaultPattern, dryRun, force, io, gitlabStage, gitlabRunnerTags, gitlabImage, gitlabCorePackage) {
    const srcDir = path.join(templatesRoot, 'gitlab-ci');
    const tagsLabel = gitlabRunnerTags.length > 0 ? ` [runner-tags=${gitlabRunnerTags.join(',')}]` : '';
    io.stdout(`\nzj-loop-init --upgrade gitlab-ci → ${targetDir}${dryRun ? ' [dry-run]' : ''} [stage=${gitlabStage}] [image=${gitlabImage}] [core-package=${gitlabCorePackage}]${tagsLabel}\n`);
    const routeTableStatus = defaultPattern
        ? await scaffoldRouteTable(defaultPattern, targetDir, templatesRoot, dryRun, io)
        : 'missing-template';
    for (const file of GITLAB_CI_TEMPLATE_FILES) {
        await upgradeRenderedTemplateFile(path.join(srcDir, file), path.join(targetDir, 'zj-loop', 'gitlab-ci', file), dryRun, io, { gitlabStage, gitlabRunnerTags, gitlabImage, gitlabCorePackage });
    }
    const rootDest = path.join(targetDir, '.gitlab-ci.yml');
    const rootCiExistsBefore = await exists(rootDest);
    if (rootCiExistsBefore) {
        io.stdout('  skipped: .gitlab-ci.yml already exists');
        io.stdout('  next step: review .gitlab-ci.yml and include zj-loop/gitlab-ci/*.yml manually if needed');
    }
    else {
        await copyRenderedWorkflowTemplate(path.join(srcDir, 'zj-loop-root.gitlab-ci.yml'), rootDest, dryRun, force, io, 'review .gitlab-ci.yml and include zj-loop/gitlab-ci/*.yml manually if this project already owns GitLab CI', { gitlabStage, gitlabRunnerTags, gitlabImage, gitlabCorePackage });
    }
    await warnIfGitLabVendorTarballsIgnored(targetDir, io);
    printGitLabCiReadinessSummary(io, {
        mode: 'upgrade',
        rootCiExistsBefore,
        rootCiWillBePatched: !rootCiExistsBefore,
        routeTableStatus,
        gitlabStage,
        gitlabRunnerTags,
        gitlabImage,
        gitlabCorePackage,
    });
    io.stdout(`
=== Next steps ===
  Review zj-loop/gitlab-ci/*.bak files if any were created.
  Route Table enablement is preserved; rerun first-run planning to review current automation intent.
  npx --yes --package @jununfly/zj-loop-core@0.1.7 zj-loop-first-run plan --root ${targetDir}
  npx --yes --package @jununfly/zj-loop-core@0.1.7 zj-loop-first-run plan --root ${targetDir} --json
  npx @jununfly/zj-loop-audit ${targetDir} --suggest
`);
    return 0;
}
function printGitLabCiReadinessSummary(io, summary) {
    const fragmentVerb = summary.mode === 'add' ? 'generated' : 'upgraded';
    const rootStatus = summary.rootCiWillBePatched
        ? '.gitlab-ci.yml includes generated ZJ Loop fragments'
        : '.gitlab-ci.yml was not changed; add the include block below if it is missing';
    const routeTableStatus = formatRouteTableStatus(summary.routeTableStatus);
    io.stdout(`
=== GitLab CI readiness ===
  fragments: zj-loop/gitlab-ci/*.yml ${fragmentVerb}
  root_ci: ${rootStatus}
  route_table: ${routeTableStatus}
  provider_ready: github=dry-run-supported gitlab=dry-run-supported
  stage: ${summary.gitlabStage}
  runner_tags: ${summary.gitlabRunnerTags.length > 0 ? summary.gitlabRunnerTags.join(',') : '(none configured)'}
  image: ${summary.gitlabImage}
  core_package: ${summary.gitlabCorePackage}
  smoke: manual job uses needs: [] and writes route-decision.json, consumer-plan.json, environment-diagnostics.json
`);
    if (!summary.rootCiWillBePatched) {
        io.stdout('  action_required: ensure root stages include the configured stage before blocking/fallback stages.');
        printGitLabCiIncludeBlock(io);
    }
    if (summary.gitlabRunnerTags.length === 0) {
        io.stdout('  runner_tags_hint: if project runners require tags, rerun with --gitlab-runner-tags tag1,tag2.');
    }
    if (summary.gitlabImage === DEFAULT_GITLAB_IMAGE) {
        io.stdout('  image_hint: private runners may require --gitlab-image registry.example.com/node:20.');
    }
}
function formatRouteTableStatus(status) {
    if (status === 'created')
        return 'zj-loop/zj-loop-route-table.yaml created';
    if (status === 'would-create')
        return 'zj-loop/zj-loop-route-table.yaml would be created';
    if (status === 'exists')
        return 'zj-loop/zj-loop-route-table.yaml present';
    return 'zj-loop/zj-loop-route-table.yaml missing; route table template was not found';
}
function printGitLabCiIncludeBlock(io) {
    io.stdout(`  include block:
include:
${GITLAB_CI_TEMPLATE_FILES.map((file) => `  - local: "zj-loop/gitlab-ci/${file}"`).join('\n')}`);
}
function providerAdaptersForArtifacts(artifacts) {
    const adapters = [];
    if (artifacts.includes('github-actions'))
        adapters.push('github');
    if (artifacts.includes('gitlab-ci'))
        adapters.push('gitlab');
    return adapters;
}
function buildInstallSummary(input) {
    const text = input.outputLines.join('\n');
    const firstRunCommands = extractCommands(text).filter((command) => command.includes('zj-loop-first-run plan'));
    const files = summarizeInstallFiles(input.outputLines, input.targetDir);
    const routeTableFile = files.find((file) => file.path === LOOP_ARTIFACTS.routeTable.primary);
    const warnings = input.outputLines
        .map((line) => line.trim())
        .filter((line) => /^warning:|WARNING:|Refusing /i.test(line));
    return {
        schema: 'zj-loop.install_summary.v1',
        operation: input.operation,
        target_dir: input.targetDir,
        provider_adapters: input.providerAdapters,
        files,
        route_table: {
            path: LOOP_ARTIFACTS.routeTable.primary,
            status: routeTableFile?.status ?? routeTableStatusFromText(text),
            enablement_preserved: true,
        },
        first_run: {
            recommended_commands: unique(firstRunCommands),
        },
        warnings,
        next_steps: [
            ...unique(firstRunCommands).map((command) => ({
                label: command.includes('--json') ? 'Run machine-readable first-run plan' : 'Run human-readable first-run plan',
                command,
            })),
            ...recommendedRouteCommands(),
        ],
    };
}
function summarizeInstallFiles(lines, targetDir) {
    const files = new Map();
    for (const rawLine of lines) {
        const line = rawLine.trim();
        const parsed = parseInstallFileLine(line, targetDir);
        if (!parsed)
            continue;
        files.set(parsed.path, mergeInstallFileSummary(files.get(parsed.path), parsed));
    }
    return [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
}
function mergeInstallFileSummary(current, next) {
    if (!current)
        return next;
    const priority = {
        modified_generated_backed_up: 6,
        force_overwritten: 5,
        user_owned_skipped: 4,
        skipped: 4,
        upgraded: 3,
        clean_generated: 2,
        created: 2,
        copied: 2,
        would_create: 1,
        unchanged: 1,
    };
    return priority[next.status] > priority[current.status]
        ? { ...next, backup_path: next.backup_path ?? current.backup_path }
        : { ...current, backup_path: current.backup_path ?? next.backup_path };
}
function parseInstallFileLine(line, targetDir) {
    const patterns = [
        [/^created: (?<path>.+?)(?: \(template\))?$/, 'created'],
        [/^copied: .+ → (?<path>.+)$/, 'created'],
        [/^would copy: .+ → (?<path>.+)$/, 'would_create'],
        [/^would write: (?<path>.+)$/, 'would_create'],
        [/^would create: (?<path>.+)$/, 'would_create'],
        [/^skipped: (?<path>.+?) already exists$/, 'skipped'],
        [/^OVERWRITTEN with --force: (?<path>.+)$/, 'force_overwritten'],
        [/^upgraded: (?<path>.+)$/, 'upgraded'],
    ];
    for (const [pattern, status] of patterns) {
        const match = line.match(pattern);
        const filePath = match?.groups?.path;
        if (filePath)
            return { path: normalizeSummaryPath(filePath, targetDir), status };
    }
    const backupMatch = line.match(/^backed up modified (?:workflow|generated file): (?<path>.+?) → (?<backup>.+)$/);
    if (backupMatch?.groups?.path && backupMatch.groups.backup) {
        return {
            path: normalizeSummaryPath(backupMatch.groups.path, targetDir),
            status: 'modified_generated_backed_up',
            backup_path: normalizeSummaryPath(backupMatch.groups.backup, targetDir),
        };
    }
    return null;
}
function normalizeSummaryPath(filePath, targetDir) {
    const cleaned = filePath.trim();
    const absolute = path.isAbsolute(cleaned) ? cleaned : path.resolve(targetDir, cleaned);
    const relative = path.relative(targetDir, absolute);
    return relative && !relative.startsWith('..') ? relative : cleaned;
}
function routeTableStatusFromText(text) {
    if (/Route Table enablement is preserved/i.test(text))
        return 'preserved';
    if (/route_table: .* present/i.test(text))
        return 'exists';
    if (/route_table: .* created/i.test(text))
        return 'created';
    return 'unknown';
}
function extractCommands(text) {
    return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith('npx ') || line.startsWith('npm exec ') || line.startsWith('zj-loop-'));
}
function recommendedRouteCommands() {
    return [
        {
            label: 'Inspect route status before enabling side effects',
            command: 'npx --yes --package @jununfly/zj-loop-core@0.1.7 zj-loop-route status',
        },
        {
            label: 'Enable roadmap activation only when appropriate',
            command: 'npx --yes --package @jununfly/zj-loop-core@0.1.7 zj-loop-route enable roadmap-sliced-development --confirm "enable roadmap-sliced-development side effects"',
        },
        {
            label: 'Disable a route without a confirmation phrase',
            command: 'npx --yes --package @jununfly/zj-loop-core@0.1.7 zj-loop-route disable roadmap-sliced-development',
        },
    ];
}
function unique(items) {
    return Array.from(new Set(items));
}
async function upgradeRenderedTemplateFile(src, dest, dryRun, io, renderOptions = {}) {
    if (!(await exists(src))) {
        io.stderr(`  missing template: ${src}`);
        return;
    }
    const nextBody = renderWorkflowTemplate(await readFile(src, 'utf8'), renderOptions);
    const nextHash = extractWorkflowTemplateHash(nextBody);
    if (!(await exists(dest))) {
        if (dryRun) {
            io.stdout(`  would create: ${dest}`);
        }
        else {
            await mkdir(path.dirname(dest), { recursive: true });
            await writeFile(dest, nextBody);
            io.stdout(`  created: ${dest}`);
        }
        return;
    }
    const currentBody = await readFile(dest, 'utf8');
    const currentHash = extractWorkflowTemplateHash(currentBody);
    const currentContentHash = workflowTemplateHash(currentBody);
    const cleanGenerated = currentHash === nextHash && currentContentHash === currentHash;
    if (!cleanGenerated) {
        const backupPath = await nextBackupPath(dest);
        if (dryRun) {
            io.stdout(`  would backup modified generated file: ${dest} → ${backupPath}`);
            io.stdout(`  would write upgraded generated file: ${dest}`);
            return;
        }
        await rename(dest, backupPath);
        io.stdout(`  backed up modified generated file: ${dest} → ${backupPath}`);
    }
    if (dryRun) {
        io.stdout(`  would write upgraded generated file: ${dest}`);
    }
    else {
        await writeFile(dest, nextBody);
        io.stdout(`  upgraded: ${dest}`);
    }
}
function renderWorkflowTemplate(template, options = {}) {
    const rendered = template
        .replace(/__ZJ_LOOP_GITLAB_STAGE__/g, yamlString(options.gitlabStage ?? DEFAULT_GITLAB_STAGE))
        .replace(/__ZJ_LOOP_GITLAB_IMAGE__/g, yamlString(options.gitlabImage ?? DEFAULT_GITLAB_IMAGE))
        .replace(/__ZJ_LOOP_CORE_PACKAGE__/g, options.gitlabCorePackage ?? DEFAULT_GITLAB_CORE_PACKAGE)
        .replace(/__ZJ_LOOP_GITLAB_TAGS__\n?/g, renderGitLabRunnerTags(options.gitlabRunnerTags ?? []));
    const hash = workflowTemplateHash(rendered);
    return rendered.replace(/^# zj-loop-template-hash: .+$/m, `# zj-loop-template-hash: ${hash}`);
}
function workflowTemplateHash(text) {
    const canonical = text.replace(/^# zj-loop-template-hash: .+$/m, '# zj-loop-template-hash: <computed>');
    return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}
function extractWorkflowTemplateHash(text) {
    return text.match(/^# zj-loop-template-hash: (?<hash>[a-f0-9]{16})$/m)?.groups?.hash ?? null;
}
function yamlString(value) {
    return JSON.stringify(value);
}
function renderGitLabRunnerTags(tags) {
    if (tags.length === 0)
        return '';
    return [
        '  tags:',
        ...tags.map((tag) => `    - ${yamlString(tag)}`),
        '',
    ].join('\n');
}
async function warnIfGitLabVendorTarballsIgnored(targetDir, io) {
    if (!(await gitIgnoreLikelyIgnoresVendorTarballs(targetDir)))
        return;
    io.stdout('  warning: zj-loop/vendor/*.tgz appears to be ignored by Git.');
    io.stdout('  next step: add .gitignore exceptions for !zj-loop/vendor/ and !zj-loop/vendor/*.tgz, or commit required tarballs explicitly with git add -f zj-loop/vendor/*.tgz.');
}
async function gitIgnoreLikelyIgnoresVendorTarballs(targetDir) {
    try {
        await execFileAsync('git', ['-C', targetDir, 'check-ignore', '--quiet', GITLAB_VENDOR_TARBALL_PROBE]);
        return true;
    }
    catch (err) {
        if (err?.code !== 1) {
            // Fall through to a cheap static check when the target is not a git repo
            // or git is unavailable in the install environment.
        }
        else {
            return false;
        }
    }
    const gitignore = await readTextIfExists(path.join(targetDir, '.gitignore'));
    if (!gitignore)
        return false;
    return gitignore
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .some((line) => [
        '*.tgz',
        '**/*.tgz',
        'zj-loop/vendor/*.tgz',
        '/zj-loop/vendor/*.tgz',
    ].includes(line));
}
async function nextBackupPath(dest) {
    let candidate = `${dest}.bak`;
    let index = 1;
    while (await exists(candidate)) {
        candidate = `${dest}.bak.${index}`;
        index += 1;
    }
    return candidate;
}
async function copyTemplateSkill(templatesRoot, templateFile, targetDir, tool, skillName, dryRun, io) {
    const src = path.join(templatesRoot, templateFile);
    const destByTool = {
        grok: path.join(targetDir, '.grok', 'skills', skillName, 'SKILL.md'),
        claude: path.join(targetDir, '.claude', 'skills', skillName, 'SKILL.md'),
        codex: path.join(targetDir, '.codex', 'skills', skillName, 'SKILL.md'),
    };
    const dest = destByTool[tool];
    if (await exists(dest))
        return;
    await copyFile(src, dest, dryRun, io);
}
async function copyTemplateVerifier(templatesRoot, targetDir, tool, dryRun, io) {
    const verifierPaths = {
        grok: path.join(targetDir, '.grok', 'skills', 'zj-loop-verifier', 'SKILL.md'),
        claude: path.join(targetDir, '.claude', 'agents', 'zj-loop-verifier.md'),
        codex: path.join(targetDir, '.codex', 'agents', 'verifier.toml'),
    };
    const dest = verifierPaths[tool];
    if (await exists(dest))
        return;
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
async function copyL2Templates(pattern, tool, targetDir, templatesRoot, dryRun, io) {
    const templates = pattern.init.templates;
    if (!templates.minimal_fix && !templates.verifier)
        return;
    if (templates.minimal_fix) {
        await copyTemplateSkill(templatesRoot, 'SKILL.md.zj-minimal-fix', targetDir, tool, 'zj-minimal-fix', dryRun, io);
    }
    if (templates.verifier) {
        await copyTemplateVerifier(templatesRoot, targetDir, tool, dryRun, io);
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
async function scaffoldObservability(pattern, tool, targetDir, templatesRoot, dryRun, io) {
    const budgetPath = path.join(targetDir, LOOP_ARTIFACTS.budget.primary);
    const runLogTemplate = path.join(templatesRoot, LOOP_ARTIFACTS.runLog.template);
    const runLogPath = path.join(targetDir, LOOP_ARTIFACTS.runLog.primary);
    if (!(await exists(budgetPath))) {
        const content = buildLoopBudgetMd(pattern);
        if (dryRun) {
            io.stdout(`  would write: ${budgetPath}`);
        }
        else {
            await writeFile(budgetPath, content);
            io.stdout(`  created: ${LOOP_ARTIFACTS.budget.primary}`);
        }
    }
    if (pattern.id === 'daily-triage') {
        await copyRuntimeExampleAndLocal(runLogTemplate, runLogPath, dryRun, io);
    }
    else if (!(await exists(runLogPath))) {
        await copyFile(runLogTemplate, runLogPath, dryRun, io);
    }
    await copyTemplateSkill(templatesRoot, LOOP_ARTIFACTS.skills.budgetTemplate, targetDir, tool, LOOP_ARTIFACTS.skills.budget, dryRun, io);
}
async function scaffoldConstraints(targetDir, templatesRoot, tool, dryRun, io) {
    const constraintsPath = path.join(targetDir, LOOP_ARTIFACTS.constraints.primary);
    const constraintsTemplate = path.join(templatesRoot, LOOP_ARTIFACTS.constraints.template);
    if (!(await exists(constraintsPath)) && (await exists(constraintsTemplate))) {
        await copyFile(constraintsTemplate, constraintsPath, dryRun, io);
    }
    await copyTemplateSkill(templatesRoot, LOOP_ARTIFACTS.skills.constraintsTemplate, targetDir, tool, LOOP_ARTIFACTS.skills.constraints, dryRun, io);
}
function buildRouteTableYaml(template, pattern) {
    return template
        .replaceAll('__PATTERN_ID__', pattern.id)
        .replaceAll('__PATTERN_NAME__', pattern.name)
        .replaceAll('__PATTERN_STATE__', pattern.state);
}
async function scaffoldRouteTable(pattern, targetDir, templatesRoot, dryRun, io) {
    const routeTablePath = path.join(targetDir, LOOP_ARTIFACTS.routeTable.primary);
    if (await exists(routeTablePath)) {
        io.stdout(`  skipped: ${LOOP_ARTIFACTS.routeTable.primary} already exists`);
        return 'exists';
    }
    const templatePath = path.join(templatesRoot, LOOP_ARTIFACTS.routeTable.template);
    if (!(await exists(templatePath)))
        return 'missing-template';
    if (dryRun) {
        io.stdout(`  would write: ${routeTablePath}`);
        return 'would-create';
    }
    const template = await readFile(templatePath, 'utf8');
    await mkdir(path.dirname(routeTablePath), { recursive: true });
    await writeFile(routeTablePath, buildRouteTableYaml(template, pattern));
    io.stdout(`  created: ${LOOP_ARTIFACTS.routeTable.primary}`);
    return 'created';
}
async function copyFile(src, dest, dryRun, io) {
    if (!(await exists(src)))
        return false;
    if (dryRun) {
        io.stdout(`  would copy: ${src} → ${dest}`);
        return true;
    }
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(src, dest);
    io.stdout(`  copied: ${src} → ${dest}`);
    return true;
}
async function ensureGitignoreEntries(targetDir, entries, dryRun, io) {
    const gitignorePath = path.join(targetDir, '.gitignore');
    const existing = (await exists(gitignorePath)) ? await readFile(gitignorePath, 'utf8') : '';
    const existingLines = new Set(existing.split(/\r?\n/));
    const missing = entries.filter((entry) => !existingLines.has(entry));
    if (!missing.length)
        return;
    if (dryRun) {
        io.stdout(`  would update: .gitignore (${missing.join(', ')})`);
        return;
    }
    const prefix = existing.length && !existing.endsWith('\n') ? '\n' : '';
    const heading = existing.includes('# ZJ Loop local runtime state') ? '' : '# ZJ Loop local runtime state\n';
    await writeFile(gitignorePath, `${existing}${prefix}${heading}${missing.join('\n')}\n`);
    io.stdout('  updated: .gitignore (ZJ Loop local runtime state)');
}
async function copyRuntimeExampleAndLocal(src, dest, dryRun, io) {
    if (!(await exists(src)))
        return false;
    const exampleDest = `${dest}.example`;
    if (!(await exists(exampleDest)))
        await copyFile(src, exampleDest, dryRun, io);
    if (!(await exists(dest)))
        await copyFile(src, dest, dryRun, io);
    return true;
}
async function writeLoopContract(src, dest, dryRun, force, io) {
    if (!(await exists(src)))
        return false;
    if ((await exists(dest)) && !force) {
        io.stdout(`  skipped: ${LOOP_ARTIFACTS.config.primary} already exists`);
        io.stdout('  next step: review the existing loop contract or rerun with --force to replace it intentionally');
        return true;
    }
    if (dryRun) {
        const verb = force ? 'would overwrite' : 'would copy';
        io.stdout(`  ${verb}: ${src} → ${dest}`);
        if (force)
            io.stdout('  WARNING: --force would replace the existing loop contract; review the result before committing.');
        return true;
    }
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(src, dest, { force: true });
    if (force) {
        io.stdout(`  OVERWRITTEN with --force: ${LOOP_ARTIFACTS.config.primary}`);
        io.stdout('  WARNING: review this active loop contract before committing.');
    }
    else {
        io.stdout(`  copied: ${src} → ${dest}`);
    }
    return true;
}
function firstLoopCommand(pattern, tool) {
    return pattern.init.first_loop_command[tool];
}
async function handleInitCommand({ io, options }) {
    const jsonOutput = options.json === true;
    const outputLines = [];
    const commandIo = jsonOutput
        ? {
            stdout(message) {
                outputLines.push(message);
            },
            stderr(message) {
                outputLines.push(message);
            },
        }
        : io;
    let addArtifacts;
    try {
        addArtifacts = parseAddArtifacts(options.add);
    }
    catch (err) {
        io.stderr(err instanceof Error ? err.message : String(err));
        return 1;
    }
    let gitlabStage;
    let gitlabRunnerTags;
    let gitlabImage;
    let gitlabCorePackage;
    try {
        gitlabStage = normalizeGitLabStage(options.gitlabStage);
        gitlabRunnerTags = normalizeGitLabRunnerTags(options.gitlabRunnerTags);
        gitlabImage = normalizeGitLabImage(options.gitlabImage);
        gitlabCorePackage = normalizeGitLabCorePackage(options.gitlabCorePackage);
    }
    catch (err) {
        io.stderr(err instanceof Error ? err.message : String(err));
        return 1;
    }
    const target = typeof options.target === 'string' ? options.target : '.';
    const targetDir = path.resolve(target);
    const dryRun = options.dryRun === true;
    const force = options.force === true;
    const registry = await loadRegistry();
    const patterns = registry.patterns.map(requireInitPattern);
    const finish = (operation, providerAdapters, exitCode) => {
        if (jsonOutput) {
            io.stdout(JSON.stringify(buildInstallSummary({
                operation,
                targetDir,
                providerAdapters,
                outputLines,
            }), null, 2));
        }
        return exitCode;
    };
    if (options.upgrade !== undefined && options.upgrade !== false) {
        const upgradeTarget = String(options.upgrade);
        if (upgradeTarget !== 'github-actions' && upgradeTarget !== 'gitlab-ci') {
            io.stderr('Unknown --upgrade target: ' + upgradeTarget + '. Valid: github-actions, gitlab-ci');
            return 1;
        }
        const templatesRoot = await resolveBundledOrMonorepo('templates');
        if (upgradeTarget === 'gitlab-ci') {
            const defaultPattern = patterns.find((pattern) => pattern.id === 'daily-triage') ?? patterns[0];
            const exitCode = await upgradeGitLabCiBundle(targetDir, templatesRoot, defaultPattern, dryRun, force, commandIo, gitlabStage, gitlabRunnerTags, gitlabImage, gitlabCorePackage);
            return finish('upgrade', ['gitlab'], exitCode);
        }
        const exitCode = await upgradeGitHubActionsBundle(targetDir, templatesRoot, dryRun, force, commandIo);
        return finish('upgrade', ['github'], exitCode);
    }
    if (addArtifacts.length > 0) {
        const templatesRoot = await resolveBundledOrMonorepo('templates');
        const exitCode = await handleAddArtifacts(addArtifacts, targetDir, templatesRoot, patterns, dryRun, force, commandIo, gitlabStage, gitlabRunnerTags, gitlabImage, gitlabCorePackage);
        return finish('add', providerAdaptersForArtifacts(addArtifacts), exitCode);
    }
    const pattern = String(options.pattern ?? 'daily-triage');
    const tool = String(options.tool ?? 'grok');
    const selectedPattern = patterns.find((p) => p.id === pattern);
    if (!selectedPattern) {
        commandIo.stderr(`Unknown pattern: ${pattern}. Valid: ${patterns.map((p) => p.id).join(', ')}`);
        return 1;
    }
    if (!VALID_TOOLS.includes(tool)) {
        commandIo.stderr(`Unknown tool: ${tool}. Valid: ${VALID_TOOLS.join(', ')}`);
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
            commandIo.stderr(`Starter not found: ${starterRoot}`);
            return 1;
        }
        commandIo.stdout(`Note: no ${tool} variant for ${pattern} — using ${baseStarter} (Grok paths)`);
    }
    const effectiveStarter = (await exists(starterRoot))
        ? starterRoot
        : path.join(startersRoot, baseStarter);
    commandIo.stdout(`\nzj-loop-init: ${pattern} → ${targetDir} (${tool})${dryRun ? ' [dry-run]' : ''}\n`);
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
            await copyDir(path.join(skillsDir, entry), path.join(targetDir, toolPrefix, entry), dryRun, commandIo);
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
                await copyFile(path.join(src, entry), path.join(dest, entry), dryRun, commandIo);
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
        if (selectedPattern.id === 'daily-triage') {
            await copyRuntimeExampleAndLocal(stateExample, stateDest, dryRun, commandIo);
        }
        else {
            await copyFile(stateExample, stateDest, dryRun, commandIo);
        }
    }
    else {
        const alt = path.join(effectiveStarter, 'STATE.md.example');
        if (await exists(alt)) {
            if (selectedPattern.id === 'daily-triage') {
                await copyRuntimeExampleAndLocal(alt, stateDest, dryRun, commandIo);
            }
            else {
                await copyFile(alt, stateDest, dryRun, commandIo);
            }
        }
    }
    const loopMd = path.join(effectiveStarter, 'ZJ-LOOP.md');
    if (await exists(loopMd)) {
        await writeLoopContract(loopMd, path.join(targetDir, LOOP_ARTIFACTS.config.primary), dryRun, force, commandIo);
    }
    await copyL2Templates(selectedPattern, tool, targetDir, templatesRoot, dryRun, commandIo);
    await scaffoldObservability(selectedPattern, tool, targetDir, templatesRoot, dryRun, commandIo);
    if (selectedPattern.id === 'daily-triage') {
        await ensureGitignoreEntries(targetDir, [
            stateOutputPath,
            LOOP_ARTIFACTS.runLog.primary,
        ], dryRun, commandIo);
    }
    await scaffoldConstraints(targetDir, templatesRoot, tool, dryRun, commandIo);
    await scaffoldRouteTable(selectedPattern, targetDir, templatesRoot, dryRun, commandIo);
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
        commandIo.stdout('  created: AGENTS.md (template)');
    }
    commandIo.stdout(`\n=== Next steps ===
  npx --yes --package @jununfly/zj-loop-core@0.1.7 zj-loop-first-run plan --root ${target === '.' ? '.' : target}
  npx --yes --package @jununfly/zj-loop-core@0.1.7 zj-loop-first-run plan --root ${target === '.' ? '.' : target} --json
  npx @jununfly/zj-loop-audit ${target === '.' ? '.' : target} --suggest
  npx @jununfly/zj-loop-cost --pattern ${pattern}
  First loop command (${tool}):
  ${firstLoopCommand(selectedPattern, tool)}
`);
    return finish('install', [], 0);
}
async function readDirNames(dir) {
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
  zj-loop-init [target-dir] --add <safety|pattern-registry|route-table|github-actions|gitlab-ci>[,...] [--force]
  zj-loop-init [target-dir] --upgrade <github-actions|gitlab-ci>

Patterns:
${patternList}

Options:
  -p, --pattern   Pattern to scaffold
  -t, --tool      Tool target (default: grok)
  --add           Add explicit optional artifacts: safety, pattern-registry, route-table, github-actions, gitlab-ci
  --upgrade       Upgrade generated artifacts: github-actions, gitlab-ci
  --force         Overwrite existing --add targets or explicitly override provider-adapter guards
  --gitlab-stage  Stage name rendered into generated GitLab CI jobs (default: zj-loop)
  --gitlab-runner-tags
                  Comma-separated runner tags rendered into generated GitLab CI jobs
  --gitlab-image  Image rendered into generated GitLab CI jobs (default: node:22)
  --gitlab-core-package
                  Package source rendered into generated GitLab npx --package calls (default: @jununfly/zj-loop-core@0.1.7)
  --json          Print deterministic install_summary JSON instead of human text
  --dry-run       Print actions without copying
  -h, --help      This help

Examples:
  npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok
  npx @jununfly/zj-loop-init . --add safety,pattern-registry,route-table,github-actions
  npx @jununfly/zj-loop-init . --add gitlab-ci
  npx @jununfly/zj-loop-init . --add gitlab-ci --gitlab-stage Fallback
  npx @jununfly/zj-loop-init . --add gitlab-ci --gitlab-runner-tags k8s,node
  npx @jununfly/zj-loop-init . --add gitlab-ci --gitlab-image registry.example.com/node:20
  npx @jununfly/zj-loop-init . --add gitlab-ci --gitlab-core-package ./zj-loop/vendor/jununfly-zj-loop-core-0.1.7.tgz
  npx @jununfly/zj-loop-init . --upgrade github-actions
  npx @jununfly/zj-loop-init . --upgrade gitlab-ci
  npx @jununfly/zj-loop-init . -p pr-steward -t claude
`;
}
const SPEC = {
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
        { name: 'gitlabStage', flag: 'gitlab-stage', type: 'string', description: 'GitLab CI stage name for generated GitLab jobs', default: DEFAULT_GITLAB_STAGE },
        { name: 'gitlabRunnerTags', flag: 'gitlab-runner-tags', type: 'string', description: 'Comma-separated GitLab runner tags for generated GitLab jobs' },
        { name: 'gitlabImage', flag: 'gitlab-image', type: 'string', description: 'GitLab CI image for generated GitLab jobs', default: DEFAULT_GITLAB_IMAGE },
        { name: 'gitlabCorePackage', flag: 'gitlab-core-package', type: 'string', description: 'Package source rendered into generated GitLab npx --package calls', default: DEFAULT_GITLAB_CORE_PACKAGE },
        { name: 'json', type: 'boolean', description: 'Print deterministic install_summary JSON instead of human text' },
        { name: 'dryRun', flag: 'dry-run', type: 'boolean', description: 'Print actions without copying' },
    ],
    handler: handleInitCommand,
};
runCli(SPEC).then((exitCode) => {
    process.exitCode = exitCode;
});
