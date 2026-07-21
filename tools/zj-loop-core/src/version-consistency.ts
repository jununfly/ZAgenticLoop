import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const VERSION_LOCK_PATH = 'zj-loop/version-lock.json';
export const VERSION_CONSISTENCY_SCHEMA = 'zj-loop.version_consistency_result.v1';

type VersionLockFile = {
  path: string;
  sha256: string;
  template_hash?: string;
};

export type VersionLock = {
  schema: 'zj-loop.version-lock.v1';
  core: { package: string; version: string; source: string };
  vendor?: { path: string; sha256: string };
  generated_files: Record<string, VersionLockFile>;
};

export type VersionConsistencyResult = {
  schema: typeof VERSION_CONSISTENCY_SCHEMA;
  status: 'healthy' | 'blocked';
  reason: 'version-match' | 'version-drift';
  side_effects_executed: false;
  expected: { core_package: string; core_version: string; core_source: string; lock_path: string };
  observed: { package_version: string; workflow_references: string[]; checkout_sha: string | null };
  checks: Array<{ name: string; status: 'passed' | 'failed'; expected?: string; observed?: string; path?: string }>;
  errors: string[];
  provenance: { provider: string; project: string | null; pipeline: string | null; job: string | null; commit: string | null };
};

async function sha256(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

export function generatedFileHash(text: string): string {
  return createHash('sha256').update(text.replace(/^# zj-loop-template-hash: .+$/m, '# zj-loop-template-hash: <computed>')).digest('hex').slice(0, 16);
}

function extractTemplateHash(text: string): string | null {
  return text.match(/^# zj-loop-template-hash: (?<hash>[a-f0-9]{16})$/m)?.groups?.hash ?? null;
}

function asLock(value: unknown): VersionLock {
  if (!value || typeof value !== 'object') throw new Error('version lock must be an object');
  const lock = value as Partial<VersionLock>;
  if (lock.schema !== 'zj-loop.version-lock.v1') throw new Error('unsupported version lock schema');
  if (!lock.core?.package || !lock.core.version || !lock.core.source) throw new Error('version lock core metadata is incomplete');
  if (!lock.generated_files || typeof lock.generated_files !== 'object') throw new Error('version lock generated_files is required');
  return lock as VersionLock;
}

async function readPackageVersion(): Promise<string> {
  const packageUrl = new URL('../package.json', import.meta.url);
  const packageJson = JSON.parse(await readFile(packageUrl, 'utf8')) as { version?: string };
  if (!packageJson.version) throw new Error('core package version is missing');
  return packageJson.version;
}

export async function checkVersionConsistency(input: {
  root?: string;
  provider?: string;
  checkoutSha?: string;
  project?: string;
  pipeline?: string;
  job?: string;
} = {}): Promise<VersionConsistencyResult> {
  const root = path.resolve(input.root ?? '.');
  const checks: VersionConsistencyResult['checks'] = [];
  const errors: string[] = [];
  let lock: VersionLock | null = null;
  try {
    lock = asLock(JSON.parse(await readFile(path.join(root, VERSION_LOCK_PATH), 'utf8')));
    checks.push({ name: 'version-lock', status: 'passed', path: VERSION_LOCK_PATH });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    checks.push({ name: 'version-lock', status: 'failed', path: VERSION_LOCK_PATH });
  }

  const packageVersion = await readPackageVersion();
  const expectedPackage = lock?.core.package ?? '@jununfly/zj-loop-core';
  const expectedVersion = lock?.core.version ?? 'unknown';
  if (lock && packageVersion === expectedVersion) checks.push({ name: 'core-package-version', status: 'passed', expected: expectedVersion, observed: packageVersion });
  else {
    errors.push(`core package version mismatch: expected ${expectedVersion}, observed ${packageVersion}`);
    checks.push({ name: 'core-package-version', status: 'failed', expected: expectedVersion, observed: packageVersion });
  }

  const references: string[] = [];
  if (lock) {
    for (const [relativePath, expectedFile] of Object.entries(lock.generated_files)) {
      const filePath = path.join(root, relativePath);
      try {
        const text = await readFile(filePath, 'utf8');
        const observedHash = await sha256(filePath);
        const templateHash = extractTemplateHash(text);
        const fileOk = observedHash === expectedFile.sha256;
        const templateOk = !expectedFile.template_hash || templateHash === expectedFile.template_hash || generatedFileHash(text) === expectedFile.template_hash;
        const referenceMatches = text.match(/@jununfly\/zj-loop-core@[^\s'"\\]+|(?:\.\/)?zj-loop\/vendor\/jununfly-zj-loop-core-[^\s'"\\]+\.tgz/g) ?? [];
        references.push(...referenceMatches);
        if (!fileOk || !templateOk) {
          errors.push(`generated file drift: ${relativePath}`);
          checks.push({ name: 'generated-file', status: 'failed', expected: expectedFile.sha256, observed: observedHash, path: relativePath });
        } else checks.push({ name: 'generated-file', status: 'passed', expected: expectedFile.sha256, observed: observedHash, path: relativePath });
      } catch {
        errors.push(`generated file missing: ${relativePath}`);
        checks.push({ name: 'generated-file', status: 'failed', path: relativePath });
      }
    }
    const sourceOk = references.length > 0 && references.every((reference) => reference === lock?.core.source || reference === lock?.vendor?.path);
    if (!sourceOk) {
      errors.push(`core package reference drift: expected ${lock.core.source}${lock.vendor ? ` or ${lock.vendor.path}` : ''}`);
      checks.push({ name: 'core-package-reference', status: 'failed', expected: lock.core.source, observed: references.join(', ') || '(none)' });
    } else checks.push({ name: 'core-package-reference', status: 'passed', expected: lock.core.source, observed: references.join(', ') });
    if (lock.vendor) {
      const vendorPath = path.join(root, lock.vendor.path);
      try {
        const observed = await sha256(vendorPath);
        if (observed !== lock.vendor.sha256) throw new Error(`vendor SHA256 mismatch: expected ${lock.vendor.sha256}, observed ${observed}`);
        checks.push({ name: 'vendor-sha256', status: 'passed', expected: lock.vendor.sha256, observed, path: lock.vendor.path });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        checks.push({ name: 'vendor-sha256', status: 'failed', expected: lock.vendor.sha256, path: lock.vendor.path });
      }
    }
  }

  return {
    schema: VERSION_CONSISTENCY_SCHEMA,
    status: errors.length === 0 ? 'healthy' : 'blocked',
    reason: errors.length === 0 ? 'version-match' : 'version-drift',
    side_effects_executed: false,
    expected: { core_package: expectedPackage, core_version: expectedVersion, core_source: lock?.core.source ?? '', lock_path: VERSION_LOCK_PATH },
    observed: { package_version: packageVersion, workflow_references: references, checkout_sha: input.checkoutSha ?? process.env.CI_COMMIT_SHA ?? process.env.GITHUB_SHA ?? null },
    checks,
    errors,
    provenance: { provider: input.provider ?? process.env.CI_SERVER_NAME ?? 'unknown', project: input.project ?? process.env.CI_PROJECT_PATH ?? process.env.GITHUB_REPOSITORY ?? null, pipeline: input.pipeline ?? process.env.CI_PIPELINE_ID ?? process.env.GITHUB_RUN_ID ?? null, job: input.job ?? process.env.CI_JOB_ID ?? process.env.GITHUB_JOB ?? null, commit: input.checkoutSha ?? process.env.CI_COMMIT_SHA ?? process.env.GITHUB_SHA ?? null },
  };
}
