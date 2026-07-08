# Route Consumer Execution Roadmap

Roadmap id: `route-consumer-execution`
Branch: `zjal/route-consumer-execution`
Status: active
Started: 2026-07-08

## Goal

Align Route Table, audit/status tooling, generated templates, dogfood docs, and
consumer runner contracts so every action-capable Route consumer can eventually
execute to its own bounded completion form without giving false completion
signals.

This roadmap must not claim release readiness until both layers below are
complete. Intermediate milestones may be committed and reviewed, but the release
target is the full route-consumer execution architecture, not only transparency
fields.

## Durable Decisions

- `zj-loop-route enable` means a route is visible and may be considered for
  dispatch. It does not authorize live side effects.
- Live execution requires a separate command shape such as
  `zj-loop-route execution set <route-or-consumer> --mode live --confirm "enable <consumer> live execution"`.
- `zj-loop-route status` should show a compact capability table by default:
  enabled state, execution mode, side effect level, protocol maturity, and
  runner maturity.
- `zj-loop-audit` must detect mismatches between product/docs claims and Route
  Table execution truth. Implement as ordered branches: warning first, fail
  later.
- User-project route table templates must include the full execution and
  maturity matrix from the start, while keeping live off by default.
- Land order: update dogfood Route Table truth first, durable architecture docs
  second, then templates/audit/status.
- Split maturity into:
  - `maturity.protocol: missing | designed | replayed | dogfooded | user-project-ready`
  - `maturity.runner: missing | designed | replayed | dogfooded | user-project-ready`
- `execution.mode` is a fixed enum:
  `report-only | request-only | claim-only | dry-run | live`.
- `side_effect_level` is a fixed enum:
  `none | evidence | request | claim | issue-comment | label | branch | pr | draft-pr | cleanup`.
- `execution.mode: live` requires runner maturity `dogfooded` or
  `user-project-ready` plus recent successful evidence.
- Automatic claim requires request schema, route allowlist, request verifier
  requirements, consumer capabilities, active request status, and scope/evidence
  completeness to match deterministically.
- Consumer capabilities live in `zj-loop/zj-loop-route-table.yaml` as light
  route/consumer contract fields. Optional external manifests may be added only
  if a consumer becomes too complex.
- Consumer `kind` is mandatory and constrains allowed execution modes and side
  effect levels.
- Execution/maturity/capability state stays in Route Table, not
  `patterns/registry.yaml`.
- The terminal architecture must be expressed as hard gates, not scattered
  recommendations.
- Completion forms are consumer-kind specific:
  - `fix-runner`: `repair-pr | escalation-issue`
  - `draft-consumer`: `draft-pr | draft-evidence | escalation-issue`
  - `cleanup-consumer`: `cleanup-done | cleanup-skipped | escalation-issue`
  - `activation-consumer`: `roadmap-branch-pr | activation-failed | activation-resumable`
- Add durable architecture doc
  `docs/designs/route-consumer-execution-architecture.md` as the single source
  of truth. Keep `docs/designs/dogfood-reference-case.md` as current dogfood
  overview and capability map only.
- Formal release waits until both execution contract foundation and consumer
  runner completion are done. Milestones may be committed separately.

## Completion Definition

This roadmap is complete only when:

- Dogfood Route Table records execution truth for all current routes.
- Durable docs explain the route-consumer execution architecture and current
  dogfood capability map without duplicate architecture drift.
- Templates generated for user projects include execution/maturity/capability
  fields and truthful defaults.
- Audit/status tooling surfaces execution truth and mismatches.
- Claim eligibility and kind/mode/side-effect constraints are deterministic.
- Action-capable consumers either execute to their bounded completion form or
  are explicitly marked with incomplete runner maturity and no live claim.
- Verification evidence exists for each completed leaf.
- Process roadmap content is absorbed into durable docs or PR body before this
  file is deleted.

## Layer 1: Execution Contract Foundation

Purpose: make the system unable to misrepresent capability.

### 1-1 Dogfood Route Table Truth

Status: completed

Scope:

- Update `zj-loop/zj-loop-route-table.yaml` rows with:
  - `consumer_kind`
  - `execution.mode`
  - `side_effect_level`
  - `maturity.protocol`
  - `maturity.runner`
  - light `capabilities`
  - recent evidence pointers where available
- Preserve current route behavior. This slice records truth; it does not
  upgrade runners.

Verification:

- YAML remains parseable by existing scripts.
- No route is silently promoted to live.
- `git diff --check`.

Evidence:

- Existing `zj-loop-core` parser read all 13 routes after the field update.
- `git diff --check` passed.
- Live mode is limited to currently dogfooded bounded consumers:
  `ci-sweeper` and `roadmap-sliced-development`.

Durable decision target:

- `docs/designs/route-consumer-execution-architecture.md`
- `docs/designs/dogfood-reference-case.md`

### 1-2 Durable Architecture Doc

Status: completed

Scope:

- Create `docs/designs/route-consumer-execution-architecture.md`.
- Document taxonomy, schema enums, hard gates, claim contract, completion
  forms, live enablement, release boundary, and phased roadmap.
- Link from `docs/designs/route-table-architecture.md` and
  `docs/designs/dogfood-reference-case.md` without duplicating the full model.

Verification:

- Terminology matches Route Table fields.
- No uppercase retired planning-signal protocol names are introduced.
- `git diff --check`.

Evidence:

- Added `docs/designs/route-consumer-execution-architecture.md`.
- Linked it from Route Table Architecture and Dogfood Reference Case.
- Retired uppercase planning-signal protocol terms were not introduced.
- `git diff --check` passed.

### 1-3 Deterministic Contract Helpers

Status: completed

Scope:

- Add or extend deterministic scripts/API for:
  - route kind versus execution mode / side effect validation
  - claim eligibility from request, consumer capabilities, and Route Table
  - live readiness from runner maturity and evidence
- Keep lifecycle decisions route-specific; do not create a generic mega runner.

Verification:

- Node tests cover accepted and rejected examples.
- Existing route replay tests still pass.
- `git diff --check`.

Evidence:

- Added deterministic `validateRouteExecutionContract`, `isRouteLiveReady`,
  and `canClaimRequest` helpers in `@jununfly/zj-loop-core`.
- Added route tests for kind/mode validation, live readiness, and claim
  capability/verifier matching.
- `npm run build` passed in `tools/zj-loop-core`.
- `node --test tools/zj-loop-core/test/route.test.mjs` passed.
- Current dogfood Route Table validates with the new contract helper.

### 1-4 Status Surface

Status: completed

Scope:

- Add compact `zj-loop-route status` capability table.
- Include JSON/verbose path for detailed evidence.
- Keep default output compact enough for humans and agents to scan.

Verification:

- CLI test or deterministic fixture covers table and JSON output.
- Existing CLI commands still work.
- `git diff --check`.

Evidence:

- `zj-loop-route status` now prints a compact capability table by default.
- `zj-loop-route status --json` preserves full route capability fields.
- `npm run build` passed in `tools/zj-loop-core`.
- `node --test tools/zj-loop-core/test/route.test.mjs` passed.
- `node tools/zj-loop-core/dist/route-cli.js status --root .` shows the
  dogfood capability table.

### 1-5 Audit Warning Branch

Status: completed

Scope:

- Add warning-level audit for:
  - missing execution/maturity fields
  - docs/README claims that imply live execution while Route Table says
    report/request/claim/dry-run or runner maturity is insufficient
  - live routes without dogfooded/user-project-ready runner evidence
- Do not fail generated bundles yet for missing fields in this branch.

Verification:

- Audit test covers warning output.
- `cd tools/zj-loop-audit && npm run build`
- `node dist/cli.js ../..`
- `git diff --check`.

Evidence:

- Added warning-level Route Table execution transparency checks to
  `zj-loop-audit`.
- Added audit tests for missing transparency fields and live mode without
  recent evidence.
- `npm run build` passed in `tools/zj-loop-audit`.
- `node --test tools/zj-loop-audit/test/auditor.test.mjs` passed.
- `node tools/zj-loop-audit/dist/cli.js .` passed with L3 and no route
  execution warnings for the current dogfood table.

### 1-6 Template and Init Defaults

Status: completed

Scope:

- Update route table templates generated by `zj-loop-init`.
- Include full execution/maturity/capability matrix with truthful defaults.
- Keep live default off.
- Ensure generated workflow bundle still calls published deterministic
  scripts/APIs, not repository-local dogfood internals.

Verification:

- `npm run check:zj-loop-init`
- `bash scripts/ci-validate-gates.sh`
- `git diff --check`.

Evidence:

- Updated canonical route table template with execution, maturity,
  capabilities, and truthful non-live defaults.
- `zj-loop-init` bundled assets were regenerated through its bundle script.
- `node --test test/cli.test.mjs` passed in `tools/zj-loop-init`.
- `npm run check:zj-loop-init` passed.
- `bash scripts/ci-validate-gates.sh` passed after rerun with network access
  because the sandboxed first run could not resolve `registry.npmmirror.com`.

### 1-7 Audit Fail Upgrade Branch

Status: completed

Scope:

- Upgrade the warning branch into fail conditions where appropriate:
  - generated bundle missing required execution/maturity fields
  - live mode without valid maturity/evidence
  - kind/mode/side-effect inconsistency
- Keep migration path explicit in docs.

Verification:

- Audit fail tests cover missing/invalid fields.
- `cd tools/zj-loop-audit && npm run build`
- `node dist/cli.js ../..`
- `git diff --check`.

Evidence:

- Generated workflow bundles now fail audit when Route Table rows are missing
  execution transparency fields.
- Live routes without runner maturity/evidence and kind/mode/side-effect
  inconsistencies now fail audit.
- Non-bundle missing fields remain warning-level to preserve migration path.
- `npm run build` passed in `tools/zj-loop-audit`.
- `node --test tools/zj-loop-audit/test/auditor.test.mjs` passed.
- `node tools/zj-loop-audit/dist/cli.js .` passed with L3.

## Layer 2: Consumer Runner Completion

Purpose: move action-capable consumers from protocol evidence toward real
bounded execution.

### 2-1 CI Sweeper Completion Evidence

Status: completed

Scope:

- Confirm CI Sweeper is the reference live `fix-runner`.
- Ensure Route Table, status, audit, docs, and evidence all agree on its live
  capability and bounded repair scope.

Verification:

- Existing CI Sweeper deterministic repair tests and validate/audit gates.
- Recent live or replay evidence linked from Route Table/docs.

Evidence:

- Updated `zj-loop/ci-sweeper-state.md` with live dogfood evidence and
  completion boundaries.
- Updated Dogfood Reference Case to mark CI Sweeper as live dogfooded
  `fix-runner` with `repair-pr` / `escalation-issue` outcomes.
- `node --test scripts/ci-sweeper-deterministic-repair.test.mjs scripts/ci-sweeper-e2e-replay.test.mjs scripts/ci-sweeper-lifecycle.test.mjs scripts/route-ci-failure.test.mjs scripts/ci-sweeper-workflow-contract.test.mjs` passed.
- `node tools/zj-loop-audit/dist/cli.js .` passed with L3.

### 2-2 Dependency Sweeper Runner

Status: completed

Scope:

- Progress Dependency Sweeper beyond claim-only only when it can create bounded
  repair PRs with verifier-backed evidence.
- Keep majors/high-risk updates human-gated.

Verification:

- E2E replay for request -> claim -> bounded repair PR or escalation.
- Capability match tests.

Evidence:

- Added `zj-loop/dependency-sweeper-state.md` documenting current claim-only
  capability and runner-missing boundary.
- Dogfood Reference Case now points to the state file and Route Table truth.
- `node --test scripts/dependency-sweeper-route-e2e-replay.test.mjs scripts/dependency-sweeper-claim-e2e-replay.test.mjs` passed.
- `node tools/zj-loop-audit/dist/cli.js .` passed with L3.
- Decision: do not promote Dependency Sweeper to live until a verifier-backed
  repair PR or escalation runner exists.

### 2-3 PR Steward Runner

Status: completed

Scope:

- Progress PR Steward from report/request/claim evidence to bounded repair or
  stewarding PR creation only where route allowlist and verifier requirements
  match.
- Preserve no rebase/merge/comment mutation unless explicitly allowed by route.

Verification:

- E2E replay for failed status/check rollup -> Issue Fix Request -> claim ->
  bounded outcome.
- Capability match tests.

Evidence:

- Added `zj-loop/pr-steward-state.md` documenting current report-only and
  claim-only capability.
- Dogfood Reference Case now points to the PR Steward state file and Route
  Table truth.
- `node --test scripts/pr-steward-report-e2e-replay.test.mjs scripts/pr-steward-fix-request-e2e-replay.test.mjs scripts/pr-steward-claim-e2e-replay.test.mjs` passed.
- `node tools/zj-loop-audit/dist/cli.js .` passed with L3.
- Decision: do not promote PR Steward to live until a current-head-SHA
  verifier-backed repair PR or escalation runner exists.

### 2-4 Changelog Drafter Draft Consumer

Status: completed

Scope:

- Treat Changelog Drafter as `draft-consumer`, not `fix-runner`.
- Move from draft-request evidence toward draft PR or draft evidence as its
  completion form.
- Human approval remains required before release/tag/publish.

Verification:

- E2E replay for release window evidence -> draft request -> draft outcome or
  escalation.

Evidence:

- Added `zj-loop/changelog-drafter-state.md` documenting current report-only
  draft-consumer capability and runner-missing boundary.
- Dogfood Reference Case now points to the Changelog Drafter state file and
  Route Table truth.
- `node --test scripts/changelog-drafter-report-e2e-replay.test.mjs scripts/changelog-drafter-draft-request-e2e-replay.test.mjs` passed.
- `node tools/zj-loop-audit/dist/cli.js .` passed with L3.
- Decision: do not promote Changelog Drafter beyond report-only until a
  bounded draft PR, draft evidence, or escalation runner exists.

### 2-5 Post-Merge Cleanup Consumer

Status: completed

Scope:

- Treat Post-Merge Cleanup as `cleanup-consumer`.
- Allow only narrow contract-backed live cleanup:
  merged `zjal/*` branch deletion and contract carrier issue closure.
- Keep fixed confirmation phrase for optional operator path.

Verification:

- Post-merge closeout tests and dry-run/live guard tests.
- Evidence includes cleanup-done, cleanup-skipped, or escalation.

Evidence:

- Added `zj-loop/post-merge-state.md` documenting current dry-run route,
  replayed runner, and narrow live cleanup boundary.
- Dogfood Reference Case now points to the Post-Merge Cleanup state file and
  Route Table truth.
- `node --test scripts/post-merge-roadmap-closeout-contract.test.mjs scripts/post-merge-roadmap-closeout-e2e-replay.test.mjs scripts/post-merge-roadmap-closeout.test.mjs scripts/validate-post-merge-closeout-workflow.test.mjs` passed.
- `node tools/zj-loop-audit/dist/cli.js .` passed with L3.
- Decision: keep automatic behavior dry-run; live cleanup remains fixed-phrase
  operator execution limited to contract carrier issue closeout and merged
  `zjal/*` branch deletion.

### 2-6 Roadmap-Sliced Activation Consumer

Status: completed

Scope:

- Treat Roadmap-Sliced Development as `activation-consumer`.
- Activation may auto-consume and bootstrap roadmap branch/process roadmap.
- Slice implementation remains bounded by Roadmap-Sliced gates and must not
  become an unbounded auto loop.

Verification:

- Activation request replay and resume/failure tests.
- Dogfood evidence for issue-triggered activation leading to roadmap branch/PR.

Evidence:

- Added `zj-loop/roadmap-activation-state.md` documenting live activation
  capability, dogfood evidence, replay coverage, and bounded implementation
  boundary.
- Dogfood Reference Case now points to the Roadmap Activation state file and
  Route Table truth.
- `node --test scripts/roadmap-activation-e2e-replay.test.mjs scripts/roadmap-activation-dispatcher.test.mjs` passed.
- `node tools/zj-loop-audit/dist/cli.js .` passed with L3.
- Decision: activation may auto-consume and bootstrap branch/process state, but
  slice implementation remains bounded by Roadmap-Sliced gates and must not
  become an unbounded auto loop.

### 2-7 Report-Only Boundaries

Status: pending

Scope:

- Keep Daily Triage, Issue Triage report, manual smoke, human, and ignore out
  of the action-capable completion target.
- If future Issue Triage side effects are needed, model them as a separate
  `issue-triage-action` consumer, not as `issue-triage-report`.

Verification:

- Route Table kind/mode validation rejects side effects on report-only routes.
- Docs do not describe report-only routes as runners.

### 2-8 Release Readiness Closeout

Status: pending

Scope:

- Confirm both layers are complete.
- Merge process roadmap decisions into durable docs.
- Delete this process roadmap before merge to main unless explicitly retained
  as durable planning history.
- Prepare release notes that do not overclaim live automation.

Verification:

- `bash scripts/ci-validate-gates.sh`
- `bash scripts/ci-audit-gates.sh`
- `git diff --check`

## Current Next Leaf

Continue with `2-7 Report-Only Boundaries`.
