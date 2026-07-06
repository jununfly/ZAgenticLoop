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
- route table policy and cross-loop dispatch boundaries
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
| CI Sweeper | `.github/workflows/ci-sweeper.yml` + `zj-loop/zj-loop-route-table.yaml` + `zj-loop/ci-sweeper-state.md` | Route-dispatched workflow from Daily Triage | Attempt allowlisted deterministic repairs for failed validate/audit runs; create PR only when repair produces real non-state diffs and repair/validate/audit gates pass |
| CI Sweeper E2E Replay | `scripts/ci-sweeper-e2e-replay.mjs` + `scripts/ci-sweeper-e2e-replay.test.mjs` | Validate gate and local replay | Prove Daily Triage -> Route Table -> CI Sweeper reaches repair PR, escalation issue, duplicate, and denied outcomes from deterministic fixtures |
| Changelog Drafter | `.github/workflows/changelog-drafter.yml` | Weekly schedule and manual dispatch | Open or refresh release-prep issues without publishing |
| Release Workflow Validation | `scripts/validate-release-workflows.mjs` | Validate gate | Ensure every release-managed npm package has matching workflow, tag pattern, and pack output |
| Drift Check | `tools/zj-loop-sync` | Local/CI tool package test, optional manual check | Detect mismatch between loop state, loop config, and required files |
| Runtime Constraints | `zj-loop/zj-loop-constraints.md` + `skills/zj-loop-constraints/SKILL.md` | Skill-level guardrail | Make repo-specific operating rules loadable at run start |
| Route Table | `zj-loop/zj-loop-route-table.yaml` + MCP `loop://route-table` | Control-plane policy | Keep route decisions visible without turning them into runtime queue state |

## Operating Artifacts

The active dogfood state lives under `zj-loop/`:

- `zj-loop/ZJ-LOOP.md` documents active loops, budget, safety, and local run commands.
- `zj-loop/STATE.md` is the Daily Triage memory spine.
- `zj-loop/zj-loop-run-log.md` is append-only run evidence.
- `zj-loop/zj-loop-budget.md` records token/run budgets.
- `zj-loop/zj-loop-route-table.yaml` records routing policy for loop signals.
- `zj-loop/ci-sweeper-state.md` records CI Sweeper route requests and repair
  outcomes.
- `zj-loop/zj-loop-constraints.md` defines binding repo rules.
- `zj-loop/zj-loop-safety.md` records safety policy and denylist guidance.

The canonical state path is `zj-loop/STATE.md`. Workflows and starters should
not create root-level `STATE.md` or root-level run logs.

## How The Configuration Is Created

There are two configuration sources:

1. **Scaffolded loop artifacts** from `zj-loop-init`.
   - Pattern starters create `zj-loop/STATE.md`, `zj-loop/ZJ-LOOP.md`,
     route table, budget, run-log, skills, and verifier artifacts.
   - Optional artifacts such as safety and pattern registry are added with
     `zj-loop-init . --add safety,pattern-registry`.
   - `--force` is only for explicit optional artifacts and should be reviewed
     before committing.

2. **Repository-specific workflow wiring** in `.github/workflows/`.
   - Audit and validate workflows call local scripts.
   - Daily Triage writes `zj-loop/STATE.md`, appends
     `zj-loop/zj-loop-run-log.md`, runs the same validate/audit gates, then
     opens an automated state PR only if those gates pass.
   - Daily Triage also consults `zj-loop/zj-loop-route-table.yaml`; when
     validate/audit workflow health is failing and the `ci-sweeper` route is
     enabled, it dispatches `.github/workflows/ci-sweeper.yml`.
   - CI Sweeper runs deterministic build/bundle repair steps and opens a PR
     only when those steps produce non-state diffs and repair/validate/audit
     gates pass. If no deterministic repair exists or gates still fail, it
     opens or updates an escalation issue instead.
   - This repository explicitly enables the `ci-sweeper` dispatch route as a
     dogfood exception. Starter defaults should still keep side-effect routes
     disabled or report-only until a project deliberately enables the matching
     dispatcher.
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
5. Build a Route Decision from `zj-loop/zj-loop-route-table.yaml`.
6. Check for an existing CI Sweeper PR or escalation issue with the same
   request branch or dedupe key.
7. Rewrite `zj-loop/STATE.md` with current high-priority items and concise
   Route Decision evidence.
8. Append one JSON entry to `zj-loop/zj-loop-run-log.md`.
9. Dispatch CI Sweeper when validate/audit failure matches the enabled
   `ci-sweeper` route and no duplicate request exists.
10. Run `scripts/ci-validate-gates.sh` and `scripts/ci-audit-gates.sh`.
11. Stop if either gate fails.
12. If state/run-log changed, create an automated branch and PR.
13. If the same date branch already exists, overwrite it from current `main`
    instead of rebasing stale generated state.
    The workflow may fetch that generated branch only to refresh
    `--force-with-lease` metadata before replacement.
14. Post commit statuses for branch protection because `GITHUB_TOKEN` does not
    trigger normal PR workflows.
15. Squash-merge the automated PR after inline statuses are posted, without
    requiring repository-level auto-merge to be enabled.
16. On Mondays, open or refresh a weekly loop report issue.

Daily Triage itself remains a producer. It updates operational memory, creates
reviewable evidence, and may dispatch an allowlisted consumer, but it does not
perform product or code fixes directly.

## CI Sweeper Flow

The CI Sweeper dogfood path is intentionally narrow:

1. Daily Triage sees the latest `validate-patterns` or `audit` workflow run in
   failure.
2. `scripts/route-ci-failure.mjs` checks the `ci-sweeper` route in
   `zj-loop/zj-loop-route-table.yaml` and emits a replayable route decision.
3. Daily Triage checks branch allowlist, generated-branch loop prevention, and
   duplicate request evidence before dispatch.
4. Daily Triage dispatches `.github/workflows/ci-sweeper.yml` with the failed
   workflow name, run id, run URL, head branch, head SHA, dedupe key, and
   deterministic request branch.
5. CI Sweeper records the route request in `zj-loop/ci-sweeper-state.md`.
6. CI Sweeper runs `scripts/ci-sweeper-deterministic-repair.mjs`, which rebuilds
   release-managed packages and refreshes deterministic generated artifacts.
7. CI Sweeper reruns validate/audit gates.
8. If deterministic repair produced non-state diffs, it creates or refreshes a
   fix PR only after repair, validate, and audit gates all pass. If no
   deterministic repair exists, or any gate still fails, it opens or updates an
   escalation issue.

This first version deliberately does not run a general-purpose coding agent in
CI. Agent runtime integration can be layered behind the same route request after
the deterministic path proves the dispatch, dedupe, evidence, and PR handoff
contract.

## CI Sweeper E2E Replay

The e2e replay script is the local, deterministic proof that the route-dispatch
chain still reaches the expected terminal behavior without creating real
GitHub PRs or issues.

Run it locally with:

```bash
node scripts/ci-sweeper-e2e-replay.mjs
node --test scripts/ci-sweeper-e2e-replay.test.mjs
```

The replay covers four dogfood cases:

| Scenario | Expected outcome | Purpose |
| --- | --- | --- |
| `repair-pr` | `repair-pr` | A validate/audit failure on `main` dispatches CI Sweeper and would create a repair PR when repair, validate, and audit gates pass. |
| `escalation-issue` | `escalation-issue` | A dispatch that still has failing gates becomes an escalation issue, not a green repair PR. |
| `duplicate-request` | `duplicate-request` | A matching pending request prevents duplicate dispatch. |
| `route-denied-generated-branch` | `route-denied` | A generated `automated/ci-sweeper-*` branch cannot recursively trigger CI Sweeper. |

Each replay result includes a step trace:

```text
daily-triage-signal
  -> route-table-decision
  -> ci-sweeper-dispatch
  -> ci-sweeper-outcome
```

When the validate gate fails, inspect `/tmp/ci-sweeper-e2e-replay.json` first.
It records the expected outcome, actual outcome, Route Decision, dedupe key,
request branch, and the terminal replay step. This makes failures replayable
without reading GitHub Actions logs line by line.

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
  - replays the Daily Triage -> Route Table -> CI Sweeper dogfood chain
  - runs relevant tool package tests

For local verification after dogfood changes, run:

```bash
node tools/zj-loop-sync/dist/cli.js . --json
node tools/zj-loop-audit/dist/cli.js . --json
node scripts/ci-sweeper-e2e-replay.mjs
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
- CI Sweeper is route-dispatched and deterministic-repair only; it is not a
  general-purpose autonomous coding agent.
- Post-Merge Cleanup is opportunistic/future.
- Changelog Drafter is report-only and issue-based; it does not publish releases.

Keep these labels explicit. Do not present declared/candidate loops as active
scheduled dogfood.

## Drift Checklist

When dogfood config changes, check:

- Workflow paths use `zj-loop/STATE.md` and `zj-loop/zj-loop-run-log.md`.
- Pattern registry state paths use `zj-loop/*-state.md`.
- Starter README copy commands create state files under `zj-loop/`.
- `zj-loop/zj-loop-route-table.yaml` exists and keeps cross-component dispatch
  routes disabled until the consumer workflow/state owner is ready.
- `ci-sweeper` route remains limited to validate/audit failures unless the route
  table and CI Sweeper workflow are updated together.
- `scripts/ci-sweeper-e2e-replay.mjs` scenarios still cover repair PR,
  escalation issue, duplicate request, and route-denied generated branch paths.
- The dogfood route table may enable `ci-sweeper`, but starters should not copy
  that enablement as a default side-effect route.
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
