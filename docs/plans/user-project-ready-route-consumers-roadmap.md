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

Status: completed

Intent:

- Define a small published CLI/API command shape for action-capable consumers.
- Keep Route Decision authorization before runner execution.
- Preserve consumer-specific completion forms and evidence carriers.

Verification:

- `cd tools/zj-loop-core && npm test`
- route replay tests for deny/skip/success/failure evidence
- `git diff --check`

Evidence:

- Added published package contract API `buildConsumerRunPlan()`.
- Added `zj-loop-consumer plan <route-or-consumer>` CLI.
- The plan blocks disabled routes, invalid execution contracts, and
  action-capable routes that are dogfooded/replayed but not
  `user-project-ready`.
- Report-only routes produce an evidence plan without worker side effects.
- README, Chinese README, and Quickstart document the packaged consumer gate.

### Leaf 2-2: Generated Workflow Consumer Gate Integration

Status: completed

Intent:

- Make every generated workflow call the published `zj-loop-consumer plan`
  contract after Route Decision evidence.
- Pin generated workflow core package references to the next core version that
  contains the consumer gate.
- Keep non-user-project-ready action routes blocked rather than silently
  running side effects.

Verification:

- `cd tools/zj-loop-core && npm test`
- `cd tools/zj-loop-init && npm test`
- `node tools/zj-loop-audit/dist/cli.js .`
- `git diff --check`

Evidence:

- All `templates/github-actions/zj-loop-*.yml` workflows now write
  `consumer-plan.json` to the workflow summary.
- Dogfood generated workflows under `.github/workflows/zj-loop-*.yml` are
  synchronized and carry valid generated metadata hashes.
- `@jununfly/zj-loop-core` is prepared for `0.1.3` so generated workflows can
  pin a package version containing `zj-loop-consumer`.

### Leaf 2-3: Route-Specific Consumer Runner Promotion

Status: completed

Intent:

- Promote route-specific consumer entry points into published package surfaces
  without collapsing distinct consumer lifecycles into a generic runner.
- Keep shared guard logic in `zj-loop-consumer plan`, while each action-capable
  route has a narrow command that pins route identity.
- Use narrow commands in generated workflows where the workflow is already an
  action-capable route.

Verification:

- `cd tools/zj-loop-core && npm test`
- `cd tools/zj-loop-init && npm test`
- `node tools/zj-loop-audit/dist/cli.js .`
- `git diff --check`

Evidence:

- Added narrow commands for action-capable routes:
  `zj-loop-ci-sweeper`, `zj-loop-roadmap-activation`,
  `zj-loop-pr-steward`, `zj-loop-dependency-sweeper`,
  `zj-loop-changelog-drafter`, `zj-loop-issue-triage-action`, and
  `zj-loop-post-merge-closeout`.
- Each command currently owns the route-specific entry point and delegates to
  the shared consumer plan gate; it does not yet execute route-specific
  repair/draft/cleanup side effects.
- Generated action-capable workflows for CI Sweeper, Dependency Sweeper, and
  Post-Merge Closeout use their narrow commands. Report workflows stay on the
  generic planner to avoid conflating report evidence with fix/action requests.

### Leaf 2-4: Packaged Live Runner Evidence Contract

Status: completed

Intent:

- Move the shared live-runner evidence envelope out of repository-local
  `scripts/` into `@jununfly/zj-loop-core`.
- Preserve consumer-kind completion forms, side-effect levels, status checks,
  and append-only structured comment parsing.

Verification:

- `cd tools/zj-loop-core && npm test`
- `git diff --check`

Evidence:

- Added `buildLiveRunnerEvidence()`, `validateLiveRunnerEvidence()`,
  `buildLiveRunnerEvidenceComment()`, and
  `parseLiveRunnerEvidenceComments()` to the published core package.
- Added core tests for consumer-kind completion form validation, invalid status
  rejection, structured comment roundtrip, and invalid JSON reporting.

### Leaf 2-5: Route-Specific Execution APIs

Status: completed

Intent:

- Move concrete repair/draft/cleanup execution planning and evidence builders
  out of repository-local `scripts/` into package APIs behind the narrow
  commands.
- Preserve route-specific request carriers and completion forms.

Verification:

- targeted route-specific command tests
- `npm run test:route-decision`
- `npm run test:post-merge-roadmap-closeout`
- `git diff --check`

Progress:

- CI Sweeper now has a packaged repair-plan API and
  `zj-loop-ci-sweeper repair-plan` command that returns deterministic command
  evidence for package builds and root validation commands.
- The package-level API keeps execution planning route-specific instead of
  introducing a generic live runner that would blur repair, draft, and cleanup
  lifecycles.
- Post-Merge Roadmap Closeout now has a packaged closeout-plan API and
  `zj-loop-post-merge-closeout closeout-plan` command for contract parsing,
  dry-run guard evidence, GitHub PR input collection, and structured dry-run
  comments. Destructive live cleanup remains behind the route-specific closeout
  boundary and fixed confirmation phrase.
- Issue Fix Request contract helpers now live in `@jununfly/zj-loop-core` for
  shared fix-runner validation, comments, dedupe, state derivation, and lifecycle
  transitions.
- Dependency Sweeper now has a packaged repair-plan API and
  `zj-loop-dependency-sweeper repair-plan` command that validates consumed
  Issue Fix Requests, produces deterministic repair PR actions, and returns
  live-runner evidence through an injected runner boundary.
- PR Steward now has a packaged fix-plan API and `zj-loop-pr-steward fix-plan`
  command that validates consumed PR Issue Fix Requests, verifies the source PR
  head SHA, produces either independent repair PR actions or an escalation
  issue action, and records that the source PR is not commented, labeled,
  rebased, merged, or workflow-dispatched by the runner.
- Changelog Drafter now has a packaged draft-plan API and
  `zj-loop-changelog-drafter draft-plan` command that validates draft request
  evidence, produces draft evidence or draft PR actions, and records that no
  tags, releases, package publishes, or final changelog acceptance happen in the
  draft consumer.
- Issue Triage Action now has a packaged action-plan API and
  `zj-loop-issue-triage-action action-plan` command that loads Route Table
  state, validates allowlisted labels/fixed comment templates, escalates human
  guarded requests, and rejects live side effects while the consumer remains
  dry-run only.
- Roadmap Activation now has a packaged activation-plan API and
  `zj-loop-roadmap-activation activation-plan` command that keeps
  activation-comment separate from Issue Fix Request, enforces maintainer/write
  permission, returns create/duplicate/resume/denied audit comments, and blocks
  duplicate activation loops.

Evidence:

- `cd tools/zj-loop-core && npm test`
- `node tools/zj-loop-audit/dist/cli.js .`
- `git diff --check`

## Parent 3: Generated-Bundle E2E Dogfood

Completion condition: every action-capable consumer has generated-bundle
workflow-dispatch dogfood evidence or is explicitly not claimed
user-project-ready.

### Leaf 3-1: Generated Bundle Test Harness

Status: completed

Intent:

- Initialize temporary user projects with `zj-loop-init --add github-actions`.
- Enable selected routes with fixed confirmation phrases.
- Execute packaged runner commands and assert durable evidence output.

Verification:

- `cd tools/zj-loop-init && npm test`
- `cd tools/zj-loop-core && npm test`
- `npm run check:zj-loop-init`
- `node tools/zj-loop-audit/dist/cli.js .`
- `git diff --check`

Evidence:

- Generated GitHub Actions bundle now includes
  `zj-loop-roadmap-activation.yml`, so Roadmap-Sliced activation is part of the
  same user-project workflow surface as the other route consumers.
- Generated action-capable workflows call the narrow packaged route commands:
  `zj-loop-ci-sweeper repair-plan`,
  `zj-loop-dependency-sweeper repair-plan`,
  `zj-loop-pr-steward fix-plan`,
  `zj-loop-changelog-drafter draft-plan`,
  `zj-loop-issue-triage-action action-plan`,
  `zj-loop-roadmap-activation activation-plan`, and
  `zj-loop-post-merge-closeout closeout-plan`.
- Workflow-dispatch JSON inputs are passed through environment variables before
  writing request files, avoiding brittle shell interpolation of user-provided
  JSON.
- The generated Route Table template marks generated-bundle routes as
  `user-project-ready` while keeping side-effecting routes disabled by default;
  enablement remains explicit through Route Table commands and fixed
  confirmation phrases.
- `tools/zj-loop-init/test/cli.test.mjs` asserts the 9-workflow bundle, narrow
  command calls, Route Table route ids, default-disabled action route, and the
  no direct single-quoted `${{ inputs.* }}` shell interpolation guard.
- Dogfood `zj-loop/zj-loop-route-table.yaml` remains a current-repo evidence
  matrix, not a blind copy of the user-project template; differences are
  intentional because dogfood maturity records this repository's live/replayed
  status.

### Leaf 3-2: Product Docs And Release Gate

Status: completed

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

Evidence:

- README, README.zh-CN, and Quickstart now expose the generated-bundle route
  menu so user projects can choose their first ready path deliberately.
- Dogfood Reference Case and Route Consumer Execution Architecture now document
  the generated-bundle release gate and the distinction between user-project
  template readiness and this repository's dogfood evidence matrix.
- Added `scripts/validate-generated-bundle-release-gate.mjs` and
  `npm run test:generated-bundle-release-gate`.
- `scripts/ci-validate-gates.sh` now runs the generated-bundle release gate,
  covering workflow/template drift, `@jununfly/zj-loop-core` package pin drift,
  Route Table route existence, and default-disabled action route readiness.
- `node scripts/validate-generated-bundle-release-gate.mjs`
- `npm run check:zj-loop-init`
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
