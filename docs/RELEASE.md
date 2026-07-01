# Release playbook — npm packages

This repo has five release-managed public npm packages from `tools/`:

| Package | Directory | Release tag |
|---------|-----------|-------------|
| `@jununfly/zj-loop-core` | `tools/zj-loop-core` | `zj-loop-core-v*` |
| `@jununfly/zj-loop-audit` | `tools/zj-loop-audit` | `zj-loop-audit-v*` |
| `@jununfly/zj-loop-init` | `tools/zj-loop-init` | `zj-loop-init-v*` |
| `@jununfly/zj-loop-cost` | `tools/zj-loop-cost` | `zj-loop-cost-v*` |
| `@cobusgreyling/goal-audit` | `tools/goal-audit` | `goal-audit-v*` |

## One-time setup (trusted publishing — recommended)

Link npm to GitHub, then for **each package** on [npmjs.com](https://www.npmjs.com/) → package **Settings** → **Trusted Publisher** → **GitHub Actions**:

| Package | Repository | Workflow filename |
|---------|--------------|-------------------|
| `@jununfly/zj-loop-core` | `jununfly/ZAgenticLoop` | `release-zj-loop-core.yml` |
| `@jununfly/zj-loop-audit` | `jununfly/ZAgenticLoop` | `release-zj-loop-audit.yml` |
| `@jununfly/zj-loop-init` | `jununfly/ZAgenticLoop` | `release-zj-loop-init.yml` |
| `@jununfly/zj-loop-cost` | `jununfly/ZAgenticLoop` | `release-zj-loop-cost.yml` |
| `@cobusgreyling/goal-audit` | `jununfly/ZAgenticLoop` | `release-goal-audit.yml` |

Names must match **exactly** (case-sensitive). No `NPM_TOKEN` secret is required when trusted publishing is configured.

**Auth:** release workflows use repo secret `NPM_TOKEN` (Automation token). Refresh it at [npmjs.com](https://www.npmjs.com/) → Access Tokens if publishes fail with `E401`/`E404`.

**Retry without re-tagging:** Actions → Release workflow → **Run workflow** → enter the tag (e.g. `zj-loop-audit-v1.4.2`).

**Trusted publishing (optional):** configure per package on npm; OIDC alone is not sufficient unless `NPM_TOKEN` is removed and trusted publishers are verified.

## Version bump

Edit `version` in the package `package.json`, update that package's `CHANGELOG.md` if present, and commit to `main` via PR.

## Generated artifacts policy

Release-managed packages have two artifact classes. For packages with a `files`
allowlist in `package.json`, every listed entry must exist before publish and
must be covered by one of these classes:

- Commit `dist/` for release-managed CLI/library packages because package
  entrypoints and npm `bin` fields point at built JavaScript.
- Commit small package-bundled runtime data such as
  `tools/zj-loop-init/registry.yaml` and `tools/zj-loop-cost/registry.json`.
- Generate large mirrored package data during release tests, then publish it
  from the package working tree. Today this applies to
  `tools/zj-loop-init/starters/` and `tools/zj-loop-init/templates/`, which are
  copied from the repo root by `npm test` / `npm run build` and ignored by git
  inside the package.
- Do not commit transient local outputs such as `node_modules/`, temporary
  folders, logs, or ad hoc build scratch files.

The root `test:release-workflows` gate checks package docs, workflows, and
publish artifact tracking/generation policy together.

## Local dependency blockers

Several release-managed packages still depend on the shared core package through
local monorepo paths:

- `@jununfly/zj-loop-audit -> @jununfly/zj-loop-core (file:../zj-loop-core)`
- `@jununfly/zj-loop-init -> @jununfly/zj-loop-core (file:../zj-loop-core)`
- `@jununfly/zj-loop-cost -> @jununfly/zj-loop-core (file:../zj-loop-core)`

`npm pack` preserves these `file:` dependency specs in the published
`package.json`. Do not tag these packages for public npm release until the core
dependency is migrated to a publishable version dependency or another explicit
packaging strategy. The release workflow validator fails on any new untracked
`file:` dependency and requires known blockers to stay documented here.

## Publish

Tag pushes trigger the release workflows:

```bash
# zj-loop-core (shared package used by zj-loop-* tools)
git tag zj-loop-core-v0.1.0
git push origin zj-loop-core-v0.1.0

# zj-loop-audit (runs tests before publish)
git tag zj-loop-audit-v1.3.0
git push origin zj-loop-audit-v1.3.0

# zj-loop-init (bundles starters/templates, runs smoke tests)
git tag zj-loop-init-v1.2.0
git push origin zj-loop-init-v1.2.0

# zj-loop-cost (bundles patterns/registry.yaml)
git tag zj-loop-cost-v1.0.0
git push origin zj-loop-cost-v1.0.0

# goal-audit (companion package)
git tag goal-audit-v1.0.0
git push origin goal-audit-v1.0.0
```

Workflows: `.github/workflows/release-zj-loop-core.yml`, `.github/workflows/release-zj-loop-audit.yml`, `.github/workflows/release-zj-loop-init.yml`, `.github/workflows/release-zj-loop-cost.yml`, `.github/workflows/release-goal-audit.yml`.

## Verify after publish

```bash
npm view @jununfly/zj-loop-core version
npx @jununfly/zj-loop-audit --help
npx @jununfly/zj-loop-init --help
npx @jununfly/zj-loop-cost --help
npx @cobusgreyling/goal-audit --help

mkdir /tmp/zj-loop-init-test && cd /tmp/zj-loop-init-test
npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok --dry-run
```

## Before npm is live (local / monorepo)

```bash
cd tools/zj-loop-audit && npm ci && npm test && node dist/cli.js ../.. --suggest
cd tools/zj-loop-init && npm ci && npm test && node dist/cli.js /tmp/target --pattern daily-triage --dry-run
```
