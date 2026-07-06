# Dogfood Reference Case

This document records how the ZAgenticLoop repository operates its own patterns,
tools, and configuration as a dogfood reference. It is meant for maintainers who
need to understand how the repo proves that its loop artifacts still work
together.

## Purpose

The reference repo should not only describe Agentic Loop Working. It should run
enough of its own loop system to catch drift between:

- pattern documents and `patterns/registry.yaml`
- starter scaffolds and `zj-loop-init`
- readiness scoring and real repo artifacts
- workflow automation and canonical `zj-loop/*` state paths
- published package metadata and local monorepo source

The dogfood setup is deliberately layered. Some loops are fully scheduled, some
are report-only, and some are declared candidates for future automation.

## Configured Dogfood

| Dogfood | Configuration | Execution mode | Purpose |
|---------|---------------|----------------|---------|
| Loop Readiness Audit | `.github/workflows/audit.yml` -> `scripts/ci-audit-gates.sh` -> local `tools/zj-loop-audit` | Push, PR, daily schedule | Prove the reference repo and starters still meet readiness gates |
| Validate Patterns & Registry | `.github/workflows/validate-patterns.yml` -> `scripts/ci-validate-gates.sh` | Push and PR | Keep pattern docs, registry, starters, release workflows, and tool package tests aligned |
| Daily Triage | `.github/workflows/daily-triage.yml` + `zj-loop/STATE.md` + `zj-loop/zj-loop-run-log.md` | Weekday scheduled workflow and manual dispatch | Run L1 report-only operational triage and record loop activity |
| Changelog Drafter | `.github/workflows/changelog-drafter.yml` | Weekly schedule and manual dispatch | Open or refresh release-prep issues without publishing |
| Release Workflow Validation | `scripts/validate-release-workflows.mjs` | Validate gate | Ensure every release-managed npm package has matching workflow, tag pattern, and pack output |
| Drift Check | `tools/zj-loop-sync` | Local/CI tool package test, optional manual check | Detect mismatch between loop state, loop config, and required files |
| Runtime Constraints | `zj-loop/zj-loop-constraints.md` + `skills/zj-loop-constraints/SKILL.md` | Skill-level guardrail | Make repo-specific operating rules loadable at run start |

## Operating Artifacts

The active dogfood state lives under `zj-loop/`:

- `zj-loop/ZJ-LOOP.md` documents active loops, budget, safety, and local run commands.
- `zj-loop/STATE.md` is the Daily Triage memory spine.
- `zj-loop/zj-loop-run-log.md` is append-only run evidence.
- `zj-loop/zj-loop-budget.md` records token/run budgets.
- `zj-loop/zj-loop-constraints.md` defines binding repo rules.
- `zj-loop/zj-loop-safety.md` records safety policy and denylist guidance.

The canonical state path is `zj-loop/STATE.md`. Workflows and starters should
not create root-level `STATE.md` or root-level run logs.

## How The Configuration Is Created

There are two configuration sources:

1. **Scaffolded loop artifacts** from `zj-loop-init`.
   - Pattern starters create `zj-loop/STATE.md`, `zj-loop/ZJ-LOOP.md`, budget,
     run-log, skills, and verifier artifacts.
   - Optional artifacts such as safety and pattern registry are added with
     `zj-loop-init . --add safety,pattern-registry`.
   - `--force` is only for explicit optional artifacts and should be reviewed
     before committing.

2. **Repository-specific workflow wiring** in `.github/workflows/`.
   - Audit and validate workflows call local scripts.
   - Daily Triage writes `zj-loop/STATE.md`, appends
     `zj-loop/zj-loop-run-log.md`, runs the same validate/audit gates, then
     opens an automated state PR only if those gates pass.
   - Changelog Drafter is L1/report-only and writes GitHub issue comments, not
     release tags or package publications.

This split is intentional: `zj-loop-init` proves the starter contract, while
GitHub Actions proves this repo can operate the contract continuously.

## Daily Triage Flow

The Daily Triage workflow is the clearest self-running dogfood loop:

1. Check out the repo and record run start.
2. Build local `tools/zj-loop-audit`.
3. Audit the reference repo and extract readiness score/level.
4. Check recent validate/audit workflow health.
5. Rewrite `zj-loop/STATE.md` with current high-priority items.
6. Append one JSON entry to `zj-loop/zj-loop-run-log.md`.
7. Run `scripts/ci-validate-gates.sh` and `scripts/ci-audit-gates.sh`.
8. Stop if either gate fails.
9. If state/run-log changed, create an automated branch and PR.
10. If the same date branch already exists, overwrite it from current `main`
    instead of rebasing stale generated state.
    The workflow may fetch that generated branch only to refresh
    `--force-with-lease` metadata before replacement.
11. Post commit statuses for branch protection because `GITHUB_TOKEN` does not
    trigger normal PR workflows.
12. Squash-merge the automated PR after inline statuses are posted, without
    requiring repository-level auto-merge to be enabled.
13. On Mondays, open or refresh a weekly loop report issue.

The loop remains L1/report-only. It updates operational memory and creates
reviewable evidence, but it does not perform product or code fixes.

## Gate Model

The two top-level gates are intentionally reused by workflows and local checks:

- `scripts/ci-audit-gates.sh`
  - installs/builds/tests `tools/zj-loop-audit`
  - audits the reference repo
  - audits every starter against L1 threshold
  - requires the reference repo to stay at least L2

- `scripts/ci-validate-gates.sh`
  - verifies pattern files and registry entries match
  - checks required pattern sections
  - validates templates
  - validates registry schema
  - checks `zj-loop-init` bundled assets are synced
  - validates release workflows
  - runs relevant tool package tests

For local verification after dogfood changes, run:

```bash
node tools/zj-loop-sync/dist/cli.js . --json
node tools/zj-loop-audit/dist/cli.js . --json
bash scripts/ci-audit-gates.sh
bash scripts/ci-validate-gates.sh
```

If a local sandbox cannot resolve npm registry hosts, rerun the same validate
gate with normal network access. Treat network resolution failures separately
from gate failures.

## Release-Managed Packages

Release-managed package metadata is checked by
`scripts/validate-release-workflows.mjs`. The package list should stay aligned
with workflow files and tag patterns:

- `@jununfly/zj-loop-core`
- `@jununfly/zj-loop-audit`
- `@jununfly/zj-loop-init`
- `@jununfly/zj-loop-cost`
- `@jununfly/zj-loop-sync`
- `@jununfly/zj-loop-mcp-server`
- `@jununfly/zj-goal-audit`

Packages that depend on `@jununfly/zj-loop-core` should be checked after core
releases so local package metadata and lockfiles do not drift behind the latest
published core version.

## Current Boundaries

These are not yet fully automated dogfood loops:

- PR Steward is declared as L2 assisted/manual or future Action.
- Dependency Sweeper is declared as L2 patch-only, not a continuously scheduled
  self-maintainer.
- CI Sweeper and Post-Merge Cleanup are opportunistic/future loops.
- Changelog Drafter is report-only and issue-based; it does not publish releases.

Keep these labels explicit. Do not present declared/candidate loops as active
scheduled dogfood.

## Drift Checklist

When dogfood config changes, check:

- Workflow paths use `zj-loop/STATE.md` and `zj-loop/zj-loop-run-log.md`.
- Pattern registry state paths use `zj-loop/*-state.md`.
- Starter README copy commands create state files under `zj-loop/`.
- `zj-loop-init` bundled registry/templates are regenerated after registry or
  starter changes.
- `zj-loop-cost` bundled `registry.json` is regenerated after registry changes.
- `zj-loop-sync` reports `100 / healthy` with no issues.
- `zj-loop-audit` reports `100 / L3` with no recommendations for this repo.
- Full audit and validate gates pass.

## Why This Case Matters

The reference repo is the product's own proof surface. A user should be able to
inspect it and see:

- a concrete state spine
- scheduled report-only automation
- reusable verification gates
- constraints loaded as a skill
- release workflow checks
- starter and registry drift detection

That combination is the dogfood story: ZAgenticLoop is maintained by the same
loop primitives it teaches, but with clear human gates and explicit boundaries.
