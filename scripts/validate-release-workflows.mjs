#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { access, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync = promisify(execFile);

export const RELEASE_PACKAGES = [
  {
    id: 'zj-loop-core',
    packageName: '@jununfly/zj-loop-core',
    directory: 'tools/zj-loop-core',
    workflow: '.github/workflows/release-zj-loop-core.yml',
    tagPattern: 'zj-loop-core-v*',
    provenancePublishing: true,
  },
  {
    id: 'zj-loop-audit',
    packageName: '@jununfly/zj-loop-audit',
    directory: 'tools/zj-loop-audit',
    workflow: '.github/workflows/release-zj-loop-audit.yml',
    tagPattern: 'zj-loop-audit-v*',
    provenancePublishing: true,
    localFileDependencies: ['@jununfly/zj-loop-core'],
  },
  {
    id: 'zj-loop-init',
    packageName: '@jununfly/zj-loop-init',
    directory: 'tools/zj-loop-init',
    workflow: '.github/workflows/release-zj-loop-init.yml',
    tagPattern: 'zj-loop-init-v*',
    provenancePublishing: true,
    generatedAtRelease: ['starters', 'templates'],
    localFileDependencies: ['@jununfly/zj-loop-core'],
  },
  {
    id: 'zj-loop-cost',
    packageName: '@jununfly/zj-loop-cost',
    directory: 'tools/zj-loop-cost',
    workflow: '.github/workflows/release-zj-loop-cost.yml',
    tagPattern: 'zj-loop-cost-v*',
    provenancePublishing: true,
    localFileDependencies: ['@jununfly/zj-loop-core'],
  },
  {
    id: 'zj-loop-sync',
    packageName: '@jununfly/zj-loop-sync',
    directory: 'tools/zj-loop-sync',
    workflow: '.github/workflows/release-zj-loop-sync.yml',
    tagPattern: 'zj-loop-sync-v*',
    provenancePublishing: true,
    localFileDependencies: ['@jununfly/zj-loop-core'],
  },
  {
    id: 'zj-loop-mcp-server',
    packageName: '@jununfly/zj-loop-mcp-server',
    directory: 'tools/zj-loop-mcp-server',
    workflow: '.github/workflows/release-zj-loop-mcp-server.yml',
    tagPattern: 'zj-loop-mcp-server-v*',
    provenancePublishing: true,
    localFileDependencies: ['@jununfly/zj-loop-core'],
  },
  {
    id: 'zj-goal-audit',
    packageName: '@jununfly/zj-goal-audit',
    directory: 'tools/zj-goal-audit',
    workflow: '.github/workflows/release-zj-goal-audit.yml',
    tagPattern: 'zj-goal-audit-v*',
    provenancePublishing: true,
  },
];

function assertIncludes(haystack, needle, label, errors) {
  if (!haystack.includes(needle)) {
    errors.push(`${label} missing: ${needle}`);
  }
}

function validateUniqueReleasePackageFields(errors) {
  const uniqueFields = ['id', 'packageName', 'directory', 'workflow', 'tagPattern'];

  for (const field of uniqueFields) {
    const seen = new Map();
    for (const releasePackage of RELEASE_PACKAGES) {
      const value = releasePackage[field];
      if (seen.has(value)) {
        errors.push(`RELEASE_PACKAGES duplicate ${field}: ${value}`);
      }
      seen.set(value, releasePackage.packageName);
    }
  }
}

function localFileDependencies(packageJson) {
  return Object.entries(packageJson.dependencies ?? {})
    .filter(([, spec]) => typeof spec === 'string' && spec.startsWith('file:'))
    .map(([name, spec]) => ({ name, spec }));
}

async function listToolPackageDirectories(root) {
  const toolsDir = path.join(root, 'tools');
  const entries = await readdir(toolsDir, { withFileTypes: true });
  const packageDirectories = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const directory = `tools/${entry.name}`;
    if (await pathExists(path.join(root, directory, 'package.json'))) {
      packageDirectories.push(directory);
    }
  }

  return packageDirectories.sort();
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function hasTrackedContent(root, packageDirectory, packageFileEntry) {
  const target = `${packageDirectory}/${packageFileEntry}`;
  const { stdout } = await execFileAsync('git', ['ls-files', target], { cwd: root });
  return stdout.trim().length > 0;
}

async function isIgnored(root, relativePath) {
  const result = await execFileAsync('git', ['check-ignore', '-q', relativePath], { cwd: root })
    .then(() => true)
    .catch((error) => {
      if (error.code === 1) return false;
      throw error;
    });
  return result;
}

async function validatePackageFiles(root, releasePackage, packageJson, errors) {
  if (!Array.isArray(packageJson.files) || packageJson.files.length === 0) {
    errors.push(`${releasePackage.directory}/package.json files must list publish artifacts`);
    return;
  }

  const generatedAtRelease = new Set(releasePackage.generatedAtRelease ?? []);

  for (const entry of packageJson.files) {
    const relativePath = `${releasePackage.directory}/${entry}`;
    const absolutePath = path.join(root, relativePath);
    const generated = generatedAtRelease.has(entry);

    if (!(await pathExists(absolutePath))) {
      errors.push(`${releasePackage.directory}/package.json files entry missing on disk: ${entry}`);
      continue;
    }

    const entryStat = await stat(absolutePath);
    if (entryStat.isDirectory()) {
      if ((await readdir(absolutePath, { recursive: true })).length === 0) {
        errors.push(`${releasePackage.directory}/package.json files entry has no contents: ${entry}`);
        continue;
      }
    }

    if (generated) {
      if (!(await isIgnored(root, relativePath))) {
        errors.push(`${releasePackage.directory}/package.json generated release entry should be ignored by git: ${entry}`);
      }
      continue;
    }

    if (!(await hasTrackedContent(root, releasePackage.directory, entry))) {
      errors.push(`${releasePackage.directory}/package.json files entry is not tracked by git: ${entry}`);
    }

    if (await isIgnored(root, relativePath)) {
      errors.push(`${releasePackage.directory}/package.json files entry is ignored by .gitignore: ${entry}`);
    }
  }
}

async function validatePackedFiles(root, releasePackage, packageJson, errors) {
  const { stdout } = await execFileAsync(
    'npm',
    [
      'pack',
      `./${releasePackage.directory}`,
      '--dry-run',
      '--json',
      '--cache',
      path.join(root, '.npm-cache-release-validation'),
    ],
    { cwd: root },
  );
  const [packResult] = JSON.parse(stdout);
  const packedFiles = new Set(packResult.files.map((file) => file.path));

  if (!packedFiles.has('package.json')) {
    errors.push(`${releasePackage.directory} npm pack output missing package.json`);
  }

  for (const entry of packageJson.files) {
    if (releasePackage.generatedAtRelease?.includes(entry)) {
      continue;
    }

    if (packedFiles.has(entry)) {
      continue;
    }

    const prefix = `${entry.replace(/\/$/, '')}/`;
    const hasChild = [...packedFiles].some((filePath) => filePath.startsWith(prefix));
    if (!hasChild) {
      errors.push(`${releasePackage.directory} npm pack output missing files entry: ${entry}`);
    }
  }
}

function validateLocalFileDependencies(releasePackage, packageJson, releaseDoc, errors) {
  const failOnLocalFileDependencies = process.env.ZJ_LOOP_RELEASE_READY === '1';
  const allowed = new Set(releasePackage.localFileDependencies ?? []);
  const found = localFileDependencies(packageJson);

  for (const dependency of found) {
    if (failOnLocalFileDependencies) {
      errors.push(
        `${releasePackage.directory}/package.json has release-blocking local file dependency: ${dependency.name} ${dependency.spec}`,
      );
      continue;
    }

    if (!allowed.has(dependency.name)) {
      errors.push(`${releasePackage.directory}/package.json has untracked local file dependency: ${dependency.name} ${dependency.spec}`);
    }
  }

  for (const allowedDependency of allowed) {
    const foundDependency = found.find((dependency) => dependency.name === allowedDependency);
    if (!foundDependency) {
      errors.push(`${releasePackage.directory} manifest expects local file dependency not found: ${allowedDependency}`);
      continue;
    }

    assertIncludes(
      releaseDoc,
      `${releasePackage.packageName} -> ${allowedDependency} (${foundDependency.spec})`,
      'docs/RELEASE.md',
      errors,
    );
  }
}

export async function validateReleaseWorkflows(root = ROOT) {
  const errors = [];
  const releaseDoc = await readFile(path.join(root, 'docs/RELEASE.md'), 'utf8');
  const releaseDirectories = new Set(RELEASE_PACKAGES.map((releasePackage) => releasePackage.directory));
  const packageDirectories = await listToolPackageDirectories(root);

  validateUniqueReleasePackageFields(errors);

  for (const directory of packageDirectories) {
    const packageJson = JSON.parse(await readFile(path.join(root, directory, 'package.json'), 'utf8'));
    const hasPublicPublishConfig = packageJson.publishConfig?.access === 'public';
    const hasPublishSurface = hasPublicPublishConfig || Boolean(packageJson.bin);

    if (hasPublishSurface && !releaseDirectories.has(directory) && packageJson.private !== true) {
      errors.push(`${directory}/package.json has publish surface but is missing from RELEASE_PACKAGES`);
    }
  }

  for (const releasePackage of RELEASE_PACKAGES) {
    const packageJson = JSON.parse(
      await readFile(path.join(root, releasePackage.directory, 'package.json'), 'utf8'),
    );
    const workflow = await readFile(path.join(root, releasePackage.workflow), 'utf8');

    if (packageJson.name !== releasePackage.packageName) {
      errors.push(
        `${releasePackage.directory}/package.json name mismatch: ${packageJson.name} !== ${releasePackage.packageName}`,
      );
    }

    if (packageJson.private === true) {
      errors.push(`${releasePackage.directory}/package.json release-managed package must not be private`);
    }

    if (packageJson.publishConfig?.access !== 'public') {
      errors.push(`${releasePackage.directory}/package.json release-managed package must set publishConfig.access=public`);
    }

    await validatePackageFiles(root, releasePackage, packageJson, errors);
    await validatePackedFiles(root, releasePackage, packageJson, errors);
    validateLocalFileDependencies(releasePackage, packageJson, releaseDoc, errors);

    assertIncludes(workflow, releasePackage.tagPattern, releasePackage.workflow, errors);
    assertIncludes(workflow, `working-directory: ${releasePackage.directory}`, releasePackage.workflow, errors);
    assertIncludes(workflow, `cache-dependency-path: ${releasePackage.directory}/package-lock.json`, releasePackage.workflow, errors);
    assertIncludes(workflow, 'npm publish --access public', releasePackage.workflow, errors);
    assertIncludes(workflow, 'NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}', releasePackage.workflow, errors);
    if (releasePackage.provenancePublishing) {
      assertIncludes(workflow, 'id-token: write', releasePackage.workflow, errors);
      assertIncludes(workflow, '--provenance', releasePackage.workflow, errors);
    }

    assertIncludes(releaseDoc, releasePackage.packageName, 'docs/RELEASE.md', errors);
    assertIncludes(releaseDoc, releasePackage.directory, 'docs/RELEASE.md', errors);
    assertIncludes(releaseDoc, releasePackage.tagPattern, 'docs/RELEASE.md', errors);
    assertIncludes(releaseDoc, path.basename(releasePackage.workflow), 'docs/RELEASE.md', errors);
  }

  if (errors.length) {
    throw new Error(errors.join('\n'));
  }

  return { packageCount: RELEASE_PACKAGES.length };
}

async function main() {
  const result = await validateReleaseWorkflows();
  console.log(`Release workflows valid: ${result.packageCount} packages ✓`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  });
}
