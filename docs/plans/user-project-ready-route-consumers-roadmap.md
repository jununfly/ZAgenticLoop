# User-Project-Ready Route Consumers Roadmap

Status: active
Branch: codex-user-project-ready-route-consumers
Activation method: issue-triggered Activation Request process, executed locally
from the accepted plan context in
`docs/plans/user-project-ready-route-consumer-checklist.md`.

## Goal

Make generated user-project bundles support all action-capable Route consumers
as independently selectable ready paths. Users should install one bundle, inspect
readiness with Route Table tooling, and choose their first enabled live path
without being forced into a single reference route.

## Parent 1: Shared User-Project Readiness Contract

Completion condition: generated bundle route ids, workflow selectors, docs, and
tests agree on one readiness contract.

### Leaf 1-1: Generated Bundle Route Identity Alignment

Status: completed

Intent:

- Align generated workflow dispatch selectors with route ids used by the dogfood
  Route Table and user-facing docs.
- Add deterministic checks so future generated-bundle route id drift fails in
  tests.
- Keep report-only routes visibly report-only and action-capable routes separate.

Verification:

- `cd tools/zj-loop-init && npm test`
- `npm run check:zj-loop-init`
- `git diff --check`

Evidence:

- Generated workflow templates dispatch `pr-steward-report`,
  `issue-triage-report`, `changelog-drafter-report`, and
  `post-merge-roadmap-closeout`.
- Generated Route Table template separates report/action/fix-request routes:
  `pr-steward-report` / `pr-steward-fix-request`,
  `issue-triage-report` / `issue-triage-action`, and
  `changelog-drafter-report` / `changelog-drafter-draft-request`.
- `tools/zj-loop-init/test/cli.test.mjs` asserts generated workflow selectors
  and route ids so old generic route names cannot silently return.

### Leaf 1-2: User-Project Readiness Status Surface

Status: completed

Intent:

- Extend status/audit output so generated user-projects can see which consumers
  are `missing`, `replayed`, `dogfooded`, or `user-project-ready`.
- Ensure README/Quickstart describe user self-selection instead of a single
  first route.

Verification:

- `cd tools/zj-loop-core && npm test`
- `node tools/zj-loop-audit/dist/cli.js .`
- `git diff --check`

Evidence:

- `zj-loop-route status` now includes a `readiness` column.
- `zj-loop-route status --json` exposes `readiness`,
  `readiness_reasons`, and `user_project_ready`.
- `classifyRouteReadiness()` separates `user-project-ready`,
  `dogfooded-live`, `live-missing-evidence`, `replayed`, `designed`, and
  `missing` so dogfood evidence cannot masquerade as user-project readiness.
- README, Chinese README, and Quickstart describe route self-selection and the
  difference between `dogfooded-live` and `user-project-ready`.

## Parent 2: Packaged Consumer Runner Surface

Completion condition: generated workflows call published package commands/APIs
instead of repository-local scripts.

### Leaf 2-1: Runner Command Contract

Status: in-progress

Intent:

- Define a small published CLI/API command shape for action-capable consumers.
- Keep Route Decision authorization before runner execution.
- Preserve consumer-specific completion forms and evidence carriers.

Verification:

- `cd tools/zj-loop-core && npm test`
- route replay tests for deny/skip/success/failure evidence
- `git diff --check`

### Leaf 2-2: Consumer Runner Promotion

Status: pending

Intent:

- Promote existing replay/live runner logic into packaged deterministic surfaces
  for CI Sweeper, Roadmap activation, PR Steward, Dependency Sweeper, Changelog
  Drafter, Issue Triage Action, and Post-Merge Roadmap Closeout.
- Generated workflows must not call repository-local `scripts/`.

Verification:

- targeted consumer runner tests
- `npm run test:route-decision`
- `npm run test:post-merge-roadmap-closeout`
- `git diff --check`

## Parent 3: Generated-Bundle E2E Dogfood

Completion condition: every action-capable consumer has generated-bundle
workflow-dispatch dogfood evidence or is explicitly not claimed
user-project-ready.

### Leaf 3-1: Generated Bundle Test Harness

Status: pending

Intent:

- Initialize temporary user projects with `zj-loop-init --add github-actions`.
- Enable selected routes with fixed confirmation phrases.
- Execute packaged runner commands and assert durable evidence output.

Verification:

- generated-bundle E2E tests
- `bash scripts/ci-validate-gates.sh`
- `bash scripts/ci-audit-gates.sh`

### Leaf 3-2: Product Docs And Release Gate

Status: pending

Intent:

- Update README/Quickstart with the route selection menu and exact enablement
  commands.
- Update dogfood and architecture docs with actual user-project-ready evidence.
- Add release gate checks for generated workflow drift, package version drift,
  and route execution contract drift.

Verification:

- `bash scripts/ci-validate-gates.sh`
- `bash scripts/ci-audit-gates.sh`
- `git diff --check`

## Closeout

Status: pending

Completion condition:

- All leaves completed, deferred with explicit follow-up, or intentionally
  linked to a later release.
- Durable decisions merged into design docs and README.
- Process roadmap/checklist deleted or moved to durable docs.
- PR body includes verification evidence and branch cleanup plan.
