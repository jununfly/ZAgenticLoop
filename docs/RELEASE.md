# Release playbook — npm packages

This repo has seven release-managed public npm packages from `tools/`:

| Package | Directory | Release tag |
|---------|-----------|-------------|
| `@jununfly/zj-loop-core` | `tools/zj-loop-core` | `zj-loop-core-v*` |
| `@jununfly/zj-loop-audit` | `tools/zj-loop-audit` | `zj-loop-audit-v*` |
| `@jununfly/zj-loop-init` | `tools/zj-loop-init` | `zj-loop-init-v*` |
| `@jununfly/zj-loop-cost` | `tools/zj-loop-cost` | `zj-loop-cost-v*` |
| `@jununfly/zj-loop-sync` | `tools/zj-loop-sync` | `zj-loop-sync-v*` |
| `@jununfly/zj-loop-mcp-server` | `tools/zj-loop-mcp-server` | `zj-loop-mcp-server-v*` |
| `@cobusgreyling/goal-audit` | `tools/goal-audit` | `goal-audit-v*` |

## One-time setup (trusted publishing — recommended)

Link npm to GitHub, then for **each package** on [npmjs.com](https://www.npmjs.com/) → package **Settings** → **Trusted Publisher** → **GitHub Actions**:

| Package | Repository | Workflow filename |
|---------|--------------|-------------------|
| `@jununfly/zj-loop-core` | `jununfly/ZAgenticLoop` | `release-zj-loop-core.yml` |
| `@jununfly/zj-loop-audit` | `jununfly/ZAgenticLoop` | `release-zj-loop-audit.yml` |
| `@jununfly/zj-loop-init` | `jununfly/ZAgenticLoop` | `release-zj-loop-init.yml` |
| `@jununfly/zj-loop-cost` | `jununfly/ZAgenticLoop` | `release-zj-loop-cost.yml` |
| `@jununfly/zj-loop-sync` | `jununfly/ZAgenticLoop` | `release-zj-loop-sync.yml` |
| `@jununfly/zj-loop-mcp-server` | `jununfly/ZAgenticLoop` | `release-zj-loop-mcp-server.yml` |
| `@cobusgreyling/goal-audit` | `jununfly/ZAgenticLoop` | `release-goal-audit.yml` |

Names must match **exactly** (case-sensitive). No `NPM_TOKEN` secret is required when trusted publishing is configured.

**Auth:** release workflows use repo secret `NPM_TOKEN` (Automation token). Refresh it at [npmjs.com](https://www.npmjs.com/) → Access Tokens if publishes fail with `E401`/`E404`.

**Retry without re-tagging:** Actions → Release workflow → **Run workflow** → enter the tag (e.g. `zj-loop-audit-v1.4.2`).

**Trusted publishing (optional):** configure per package on npm; OIDC alone is not sufficient unless `NPM_TOKEN` is removed and trusted publishers are verified.

## Release universe standard

A package under `tools/` is part of the release universe when it has a public
publish surface: `publishConfig.access: public` or an npm `bin` entry, unless
the package explicitly sets `private: true`. Release-managed packages must have:

- a unique entry in `RELEASE_PACKAGES`
- `publishConfig.access: public`
- a matching release workflow, tag pattern, docs row, and trusted publisher row
- a non-empty `files` allowlist whose committed/generated artifacts are covered
  by the generated artifacts policy below
- no untracked local `file:` dependencies

The root `test:release-workflows` gate enforces this standard and fails when a
tool package exposes a publish surface without being covered by the release
manifest.

Use release-ready mode before tagging packages:

```bash
npm run test:release-ready
```

Release-ready mode rejects every local `file:` dependency in a release-managed
package. The normal gate allows documented local blockers so monorepo
development can continue before `@jununfly/zj-loop-core` is published.
Before core dependency migration, this command is expected to fail and list the
dependent `@jununfly/zj-loop-*` packages that still use `file:../zj-loop-core`.

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
- `@jununfly/zj-loop-sync -> @jununfly/zj-loop-core (file:../zj-loop-core)`
- `@jununfly/zj-loop-mcp-server -> @jununfly/zj-loop-core (file:../zj-loop-core)`

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

# zj-loop-sync (drift detection CLI)
git tag zj-loop-sync-v1.0.0
git push origin zj-loop-sync-v1.0.0

# zj-loop-mcp-server (read-only MCP adapter)
git tag zj-loop-mcp-server-v1.0.0
git push origin zj-loop-mcp-server-v1.0.0

# goal-audit (companion package)
git tag goal-audit-v1.0.0
git push origin goal-audit-v1.0.0
```

Workflows: `.github/workflows/release-zj-loop-core.yml`, `.github/workflows/release-zj-loop-audit.yml`, `.github/workflows/release-zj-loop-init.yml`, `.github/workflows/release-zj-loop-cost.yml`, `.github/workflows/release-zj-loop-sync.yml`, `.github/workflows/release-zj-loop-mcp-server.yml`, `.github/workflows/release-goal-audit.yml`.

## Verify after publish

```bash
npm view @jununfly/zj-loop-core version
npx @jununfly/zj-loop-audit --help
npx @jununfly/zj-loop-init --help
npx @jununfly/zj-loop-cost --help
npx @jununfly/zj-loop-sync --help
npx @jununfly/zj-loop-mcp-server --help
npx @cobusgreyling/goal-audit --help

mkdir /tmp/zj-loop-init-test && cd /tmp/zj-loop-init-test
npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok --dry-run
```

## Before npm is live (local / monorepo)

Local monorepo development may keep `file:../zj-loop-core` dependencies and
package-lock links while `@jununfly/zj-loop-core` is not published. Root
`npm run build:tools` and `npm run test:tools` run against the checked-in
package installs and do not refresh package-local locks by default.

CI validate gates and release workflows do run package-local installs:

- `scripts/ci-validate-gates.sh` runs `run-tool-package-scripts.mjs ... --install`
  for the validate gate packages.
- Release workflows run `npm ci` inside each package working directory before
  publishing.

Before tagging a package that depends on `@jununfly/zj-loop-core`, first publish
core, then migrate that package's dependency and lockfile from
`file:../zj-loop-core` to a registry version range. A lockfile generated from an
old `file:` lock can preserve the local link even after `package.json` is
changed, so release migration must verify both `package.json` and
`package-lock.json`.

For the current core version, dependent packages should use
`@jununfly/zj-loop-core: ^0.1.0` after core is published. In npm semver, `^0.1.0`
accepts compatible `0.1.x` patches but not `0.2.0`, which is appropriate while
core is still pre-1.0. Publish order is:

1. publish `@jununfly/zj-loop-core`
2. regenerate each dependent package lockfile against the registry dependency
3. run package-local `npm ci`, `npm test`, and `npm pack` checks
4. tag and publish dependent `@jununfly/zj-loop-*` packages
5. publish the independent `@cobusgreyling/goal-audit` companion package when
   needed

Do not publish dependent packages in the same release step that first publishes
core unless the registry dependency can be resolved by package-local `npm ci`.

```bash
cd tools/zj-loop-audit && npm ci && npm test && node dist/cli.js ../.. --suggest
cd tools/zj-loop-init && npm ci && npm test && node dist/cli.js /tmp/target --pattern daily-triage --dry-run
```
