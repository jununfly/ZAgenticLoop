#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const RELEASE_PACKAGES = [
  {
    id: 'zj-loop-audit',
    packageName: '@jununfly/zj-loop-audit',
    directory: 'tools/zj-loop-audit',
    workflow: '.github/workflows/release-zj-loop-audit.yml',
    tagPattern: 'zj-loop-audit-v*',
    trustedPublishing: true,
  },
  {
    id: 'zj-loop-init',
    packageName: '@jununfly/zj-loop-init',
    directory: 'tools/zj-loop-init',
    workflow: '.github/workflows/release-zj-loop-init.yml',
    tagPattern: 'zj-loop-init-v*',
    trustedPublishing: true,
  },
  {
    id: 'zj-loop-cost',
    packageName: '@jununfly/zj-loop-cost',
    directory: 'tools/zj-loop-cost',
    workflow: '.github/workflows/release-zj-loop-cost.yml',
    tagPattern: 'zj-loop-cost-v*',
    trustedPublishing: true,
  },
  {
    id: 'goal-audit',
    packageName: '@cobusgreyling/goal-audit',
    directory: 'tools/goal-audit',
    workflow: '.github/workflows/release-goal-audit.yml',
    tagPattern: 'goal-audit-v*',
    trustedPublishing: true,
  },
];

function assertIncludes(haystack, needle, label, errors) {
  if (!haystack.includes(needle)) {
    errors.push(`${label} missing: ${needle}`);
  }
}

export async function validateReleaseWorkflows(root = ROOT) {
  const errors = [];
  const releaseDoc = await readFile(path.join(root, 'docs/RELEASE.md'), 'utf8');

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

    assertIncludes(workflow, releasePackage.tagPattern, releasePackage.workflow, errors);
    assertIncludes(workflow, `working-directory: ${releasePackage.directory}`, releasePackage.workflow, errors);
    assertIncludes(workflow, `cache-dependency-path: ${releasePackage.directory}/package-lock.json`, releasePackage.workflow, errors);
    assertIncludes(workflow, 'npm publish --access public', releasePackage.workflow, errors);
    if (releasePackage.trustedPublishing) {
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
