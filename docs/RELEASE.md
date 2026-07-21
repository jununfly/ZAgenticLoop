# Release playbook — npm packages

This repo has eight release-managed public npm packages from `tools/`:

| Package | Directory | Release tag |
|---------|-----------|-------------|
| `@jununfly/zj-loop-gitlab-infra` | `tools/zj-loop-gitlab-infra` | `zj-loop-gitlab-infra-v*` |
| `@jununfly/zj-loop-core` | `tools/zj-loop-core` | `zj-loop-core-v*` |
| `@jununfly/zj-loop-audit` | `tools/zj-loop-audit` | `zj-loop-audit-v*` |
| `@jununfly/zj-loop-init` | `tools/zj-loop-init` | `zj-loop-init-v*` |
| `@jununfly/zj-loop-cost` | `tools/zj-loop-cost` | `zj-loop-cost-v*` |
| `@jununfly/zj-loop-sync` | `tools/zj-loop-sync` | `zj-loop-sync-v*` |
| `@jununfly/zj-loop-mcp-server` | `tools/zj-loop-mcp-server` | `zj-loop-mcp-server-v*` |
| `@jununfly/zj-goal-audit` | `tools/zj-goal-audit` | `zj-goal-audit-v*` |

## One-time setup (first release)

First release uses a GitHub repository secret named `NPM_TOKEN`.

Create an npm automation token with publish access to the `@jununfly` scope,
then add it in GitHub: `jununfly/ZAgenticLoop` → **Settings** → **Secrets and
variables** → **Actions** → **New repository secret** → `NPM_TOKEN`.

Release workflows pass that secret as `NODE_AUTH_TOKEN` and run
`npm publish --access public --provenance`. Keep `id-token: write` in the
workflow permissions so npm can attach provenance to token-based publishes.

Refresh the token at [npmjs.com](https://www.npmjs.com/) → Access Tokens if
publishes fail with `E401` or package-scope authorization errors.

## Trusted Publisher hardening (after first release)

After the first token-based publish, link npm to GitHub for **each package** on
[npmjs.com](https://www.npmjs.com/) → package **Settings** → **Trusted
Publisher** → **GitHub Actions**:

| Package | Repository | Workflow filename |
|---------|--------------|-------------------|
| `@jununfly/zj-loop-gitlab-infra` | `jununfly/ZAgenticLoop` | `release-zj-loop-gitlab-infra.yml` |
| `@jununfly/zj-loop-core` | `jununfly/ZAgenticLoop` | `release-zj-loop-core.yml` |
| `@jununfly/zj-loop-audit` | `jununfly/ZAgenticLoop` | `release-zj-loop-audit.yml` |
| `@jununfly/zj-loop-init` | `jununfly/ZAgenticLoop` | `release-zj-loop-init.yml` |
| `@jununfly/zj-loop-cost` | `jununfly/ZAgenticLoop` | `release-zj-loop-cost.yml` |
| `@jununfly/zj-loop-sync` | `jununfly/ZAgenticLoop` | `release-zj-loop-sync.yml` |
| `@jununfly/zj-loop-mcp-server` | `jununfly/ZAgenticLoop` | `release-zj-loop-mcp-server.yml` |
| `@jununfly/zj-goal-audit` | `jununfly/ZAgenticLoop` | `release-zj-goal-audit.yml` |

Names must match **exactly** (case-sensitive). After trusted publishing is
verified, workflows can remove the `NPM_TOKEN` dependency in a dedicated
hardening change.

**Retry without re-tagging:** Actions → Release workflow → **Run workflow** → enter the tag (e.g. `zj-loop-audit-v0.1.0`).

For the first `0.1.0` release, the dependent package tag pushes were retried
through `workflow_dispatch` after moving tags to the final release-ready commit.
Keep that path available for release reruns, but prefer creating tags only
after `main` is green.

## Release universe standard

A package under `tools/` is part of the release universe when it has a public
publish surface: `publishConfig.access: public` or an npm `bin` entry, unless
the package explicitly sets `private: true`. Release-managed packages must have:

- a unique entry in `RELEASE_PACKAGES`
- `publishConfig.access: public`
- a matching release workflow, tag pattern, docs row, and release auth row
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

Release-managed packages may temporarily depend on the shared core package
through local monorepo paths during development:

- `@jununfly/zj-loop-core -> @jununfly/zj-loop-gitlab-infra` is a published registry dependency.
- `@jununfly/zj-loop-audit -> @jununfly/zj-loop-core (file:../zj-loop-core)`
- `@jununfly/zj-loop-init -> @jununfly/zj-loop-core (file:../zj-loop-core)`
- `@jununfly/zj-loop-cost -> @jununfly/zj-loop-core (file:../zj-loop-core)`
- `@jununfly/zj-loop-sync -> @jununfly/zj-loop-core (file:../zj-loop-core)`
- `@jununfly/zj-loop-mcp-server -> @jununfly/zj-loop-core (file:../zj-loop-core)`

`npm pack` preserves these `file:` dependency specs in the published
`package.json`. Do not tag these packages for public npm release until the core
dependency is migrated to a publishable version dependency or another explicit
packaging strategy. The release workflow validator fails on any new untracked
`file:` dependency, and `npm run test:release-ready` fails on every remaining
`file:` dependency.

Current closeout status as of July 1, 2026: `@jununfly/zj-loop-core@0.1.0`
was published and checked with
`npm view @jununfly/zj-loop-core@0.1.0 version --registry https://registry.npmjs.org`,
which returned `0.1.0`. Dependent `@jununfly/zj-loop-*` packages now use
`@jununfly/zj-loop-core: ^0.1.0` and package-local lockfiles resolved that
registry version.

The first release completed on July 1, 2026. These packages are published and
registry-resolvable on the official npm registry:

- `@jununfly/zj-loop-core@0.1.0`
- `@jununfly/zj-loop-audit@0.1.0`
- `@jununfly/zj-loop-init@0.1.0`
- `@jununfly/zj-loop-cost@0.1.0`
- `@jununfly/zj-loop-sync@0.1.0`
- `@jununfly/zj-loop-mcp-server@0.1.0`
- `@jununfly/zj-goal-audit@0.1.0`

The GitLab infra tracer release is a separate ordered migration:

1. merge the PR containing `@jununfly/zj-loop-gitlab-infra@0.1.0` and
   `@jununfly/zj-loop-core@0.1.10`
2. publish `zj-loop-gitlab-infra-v0.1.0`
3. verify `npm view @jununfly/zj-loop-gitlab-infra@0.1.0 version --registry https://registry.npmjs.org`
4. publish `zj-loop-core-v0.1.10`
5. update the target GitLab project to use `@jununfly/zj-loop-core@0.1.10`
   and run the read-only Schedule Health dogfood

Smoke tests used `--registry https://registry.npmjs.org` because npm mirrors
can lag immediately after a first publish.

## Publish

Tag pushes trigger the release workflows:

### Core-first execution checklist

Do not create release tags from a dirty worktree. The first publish should use
the reviewed `origin/main` commit that contains the release-prep changes.

1. Commit and merge the release-prep branch to `origin/main`.
2. Check out or pull the final `origin/main` commit locally.
3. Run the core gate:

```bash
npm --prefix tools/zj-loop-core ci
npm --prefix tools/zj-loop-core test
npm pack ./tools/zj-loop-core --dry-run --json --cache .npm-cache-release-validation
npm run test:release-workflows
git diff --check
```

4. Confirm the version is still unpublished:

```bash
npm view @jununfly/zj-loop-core@0.1.0 version --registry https://registry.npmjs.org
```

Expected result before first publish: `E404`.

5. Tag and push core:

```bash
# zj-loop-core (shared package used by zj-loop-* tools)
git tag zj-loop-core-v0.1.0
git push origin zj-loop-core-v0.1.0
```

6. Wait for `.github/workflows/release-zj-loop-core.yml` to complete.
7. Confirm npm can resolve core:

```bash
npm view @jununfly/zj-loop-core@0.1.0 version --registry https://registry.npmjs.org
```

Only after this command returns `0.1.0` should dependent packages migrate from
`file:../zj-loop-core` to `^0.1.0`.

### Dependent package tags

After `@jununfly/zj-loop-core@0.1.0` is registry-resolvable and dependent
packages have refreshed package-local lockfiles, tag pushes trigger the
remaining release workflows:

```bash
# zj-loop-audit (runs tests before publish)
git tag zj-loop-audit-v0.1.0
git push origin zj-loop-audit-v0.1.0

# zj-loop-init (bundles starters/templates, runs smoke tests)
git tag zj-loop-init-v0.1.0
git push origin zj-loop-init-v0.1.0

# zj-loop-cost (bundles patterns/registry.yaml)
git tag zj-loop-cost-v0.1.0
git push origin zj-loop-cost-v0.1.0

# zj-loop-sync (drift detection CLI)
git tag zj-loop-sync-v0.1.0
git push origin zj-loop-sync-v0.1.0

# zj-loop-mcp-server (read-only MCP adapter)
git tag zj-loop-mcp-server-v0.1.0
git push origin zj-loop-mcp-server-v0.1.0

# zj-goal-audit (goal readiness package)
git tag zj-goal-audit-v0.1.0
git push origin zj-goal-audit-v0.1.0
```

Workflows: `.github/workflows/release-zj-loop-core.yml`, `.github/workflows/release-zj-loop-audit.yml`, `.github/workflows/release-zj-loop-init.yml`, `.github/workflows/release-zj-loop-cost.yml`, `.github/workflows/release-zj-loop-sync.yml`, `.github/workflows/release-zj-loop-mcp-server.yml`, `.github/workflows/release-zj-goal-audit.yml`.

## Verify after publish

```bash
npm view @jununfly/zj-loop-core version
npx @jununfly/zj-loop-audit --help
npx @jununfly/zj-loop-init --help
npx @jununfly/zj-loop-cost --help
npx @jununfly/zj-loop-sync --help
npx @jununfly/zj-goal-audit --help

mkdir /tmp/zj-loop-init-test && cd /tmp/zj-loop-init-test
npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok --dry-run
```

`@jununfly/zj-loop-mcp-server` is an MCP stdio server, not a regular help CLI.
Verify it by checking the published manifest and configuring it in an MCP
client:

```bash
npm view @jununfly/zj-loop-mcp-server version bin
```

## Local / monorepo development

Local monorepo development can use package-local installs and source builds.
Root `npm run build:tools` and `npm run test:tools` run against the checked-in
package installs and do not refresh package-local locks by default.

CI validate gates and release workflows do run package-local installs:

- `scripts/ci-validate-gates.sh` runs `run-tool-package-scripts.mjs ... --install`
  for the validate gate packages.
- Release workflows run `npm ci` inside each package working directory before
  publishing.

Before tagging a package that depends on `@jununfly/zj-loop-core`, verify that
package's dependency and lockfile use a registry version range, not
`file:../zj-loop-core`. A lockfile generated from an old `file:` lock can
preserve the local link even after `package.json` is changed, so release
migration must verify both `package.json` and `package-lock.json`.

For the current core version, dependent packages use
`@jununfly/zj-loop-core: ^0.1.0`. In npm semver, `^0.1.0`
accepts compatible `0.1.x` patches but not `0.2.0`, which is appropriate while
core is still pre-1.0. The historical first-release publish order was:

1. publish `@jununfly/zj-loop-core`
2. regenerate each dependent package lockfile against the registry dependency
3. run package-local `npm ci`, `npm test`, and `npm pack` checks
4. tag and publish dependent `@jununfly/zj-loop-*` packages
5. publish the independent `@jununfly/zj-goal-audit` goal readiness package
   when needed

Do not publish dependent packages in the same release step that first publishes
core unless the registry dependency can be resolved by package-local `npm ci`.

```bash
cd tools/zj-loop-audit && npm ci && npm test && node dist/cli.js ../.. --suggest
cd tools/zj-loop-init && npm ci && npm test && node dist/cli.js /tmp/target --pattern daily-triage --dry-run
```
