# Release playbook — npm packages

This repo ships two public npm packages from `tools/`:

| Package | Directory | Release tag |
|---------|-----------|-------------|
| `@jununfly/zj-loop-audit` | `tools/zj-loop-audit` | `zj-loop-audit-v*` |
| `@jununfly/zj-loop-init` | `tools/zj-loop-init` | `zj-loop-init-v*` |
| `@jununfly/zj-loop-cost` | `tools/zj-loop-cost` | `zj-loop-cost-v*` |

## One-time setup (trusted publishing — recommended)

Link npm to GitHub, then for **each package** on [npmjs.com](https://www.npmjs.com/) → package **Settings** → **Trusted Publisher** → **GitHub Actions**:

| Package | Repository | Workflow filename |
|---------|--------------|-------------------|
| `@jununfly/zj-loop-audit` | `jununfly/ZAgenticLoop` | `release-zj-loop-audit.yml` |
| `@jununfly/zj-loop-init` | `jununfly/ZAgenticLoop` | `release-zj-loop-init.yml` |
| `@jununfly/zj-loop-cost` | `jununfly/ZAgenticLoop` | `release-zj-loop-cost.yml` |

Names must match **exactly** (case-sensitive). No `NPM_TOKEN` secret is required when trusted publishing is configured.

**Auth:** release workflows use repo secret `NPM_TOKEN` (Automation token). Refresh it at [npmjs.com](https://www.npmjs.com/) → Access Tokens if publishes fail with `E401`/`E404`.

**Retry without re-tagging:** Actions → Release workflow → **Run workflow** → enter the tag (e.g. `zj-loop-audit-v1.4.2`).

**Trusted publishing (optional):** configure per package on npm; OIDC alone is not sufficient unless `NPM_TOKEN` is removed and trusted publishers are verified.

## Version bump

Edit `version` in the package `package.json`, update that package's `CHANGELOG.md` if present, and commit to `main` via PR.

## Publish

Tag pushes trigger the release workflows:

```bash
# zj-loop-audit (runs tests before publish)
git tag zj-loop-audit-v1.3.0
git push origin zj-loop-audit-v1.3.0

# zj-loop-init (bundles starters/templates, runs smoke tests)
git tag zj-loop-init-v1.2.0
git push origin zj-loop-init-v1.2.0

# zj-loop-cost (bundles patterns/registry.yaml)
git tag zj-loop-cost-v1.0.0
git push origin zj-loop-cost-v1.0.0
```

Workflows: `.github/workflows/release-zj-loop-audit.yml`, `.github/workflows/release-zj-loop-init.yml`, `.github/workflows/release-zj-loop-cost.yml`.

## Verify after publish

```bash
npx @jununfly/zj-loop-audit --help
npx @jununfly/zj-loop-init --help
npx @jununfly/zj-loop-cost --help

mkdir /tmp/zj-loop-init-test && cd /tmp/zj-loop-init-test
npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok --dry-run
```

## Before npm is live (local / monorepo)

```bash
cd tools/zj-loop-audit && npm ci && npm test && node dist/cli.js ../.. --suggest
cd tools/zj-loop-init && npm ci && npm test && node dist/cli.js /tmp/target --pattern daily-triage --dry-run
```