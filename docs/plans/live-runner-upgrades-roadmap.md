# Live Runner Upgrades Roadmap

Roadmap id: `live-runner-upgrades`
Branch: `zjal/live-runner-docs-alignment`
Status: active
Started: 2026-07-08

## Goal

Move suitable Route consumers from `claim-only`, `report-only`, or `dry-run`
toward truthful live runners without weakening Route Decision boundaries,
human-review constraints, or loop-prevention gates.

The target is not "make every route live." The target is:

- every action-capable consumer has a bounded live runner, or a durable reason
  why it must stay non-live for now
- report-only routes remain report-only unless a separate action-capable route
  is introduced
- live mode is backed by deterministic guard checks, replay tests, dogfood
  evidence, and consumer-owned state
- user-facing docs do not imply live execution before the Route Table and
  evidence support it

## Current Baseline

Already live or dogfooded:

- `ci-sweeper`: live `fix-runner`, narrow validate/audit repair or escalation.
- `roadmap-sliced-development`: live `activation-consumer`, activation
  bootstrap only.

Upgrade candidates:

- `post-merge-roadmap-closeout`: `dry-run` cleanup-consumer with replayed
  runner. Candidate for guarded live cleanup.
- `dependency-sweeper`: `claim-only` fix-runner with replayed runner. Candidate
  for workflow-dispatch dogfood before live promotion.
- `pr-steward-fix-request`: `claim-only` fix-runner with replayed runner.
  Candidate for workflow-dispatch dogfood before live promotion.
- `changelog-drafter-draft-request`: `report-only` draft-consumer with replayed
  runner. Candidate for workflow-dispatch dogfood before live promotion.
- `issue-triage-action`: `dry-run` triage-action-consumer with replayed runner.
  Candidate for workflow-dispatch dogfood before any live issue mutation.
- `issue-triage-report`: must stay report-only. Side effects belong to the
  separate `issue-triage-action` consumer.

## Durable Decisions

- A Route Table row may move to `execution.mode: live` only after replay tests,
  deterministic guards, and dogfood evidence exist.
- Live runners must end in kind-specific completion forms:
  - `fix-runner`: `repair-pr` or `escalation-issue`
  - `draft-consumer`: `draft-pr`, `draft-evidence`, or `escalation-issue`
  - `cleanup-consumer`: `cleanup-done`, `cleanup-skipped`, or
    `escalation-issue`
  - `activation-consumer`: `roadmap-branch-pr`, `activation-failed`, or
    `activation-resumable`
- Claim-only is not live. A claim may prove eligibility, but it must not imply
  repair, branch creation, PR creation, workflow dispatch, or issue mutation.
- Report-only routes must not gain side effects. If a report route needs action,
  create a separate action-capable route with its own consumer kind, guards, and
  tests.
- Generated user-project workflows must call published package scripts/APIs.
  Repo-local dogfood scripts may be used only for this repository's own
  dogfood workflows.
- Each live runner must be loop-safe:
  - deterministic dedupe key
  - source branch/issue/request allowlist
  - request lifecycle status check
  - verifier requirements
  - bounded retry/escalation path
  - no auto-merge

## Completion Definition

This roadmap is complete when:

- all candidate consumers have either a live runner or an explicit durable
  deferral with next unblocker
- Route Table execution/maturity fields match implementation reality
- consumer-owned state files record current capability and recent evidence
- docs reflect the new live/non-live boundary without overclaiming
- replay and workflow tests cover success, skip/refusal, duplicate, and failure
  paths for every upgraded runner
- full validate/audit gates pass
- this process roadmap is merged into durable docs/state or deleted at closeout

## Layer 1: Live Runner Substrate

Purpose: avoid each consumer inventing its own side-effect lifecycle.

### 1-1 Runner Lifecycle Contract

Status: completed

Scope:

- Inventory existing lifecycle comment/body shapes for Issue Fix Request,
  activation, post-merge cleanup, and CI Sweeper.
- Define the smallest shared runner evidence contract needed by live runners:
  status, completion form, request id/source, verifier evidence, side effects,
  duplicate key, and escalation reference.
- Prefer deterministic helper functions when the contract can be validated by
  code.

Verification:

- Existing replay tests still pass.
- New or updated contract tests cover accepted and rejected live-runner
  evidence examples.
- `git diff --check`.

Evidence:

- Added `scripts/live-runner-contract.mjs` with deterministic live-runner
  evidence validation, comment build, and comment parse helpers.
- Added `scripts/live-runner-contract.test.mjs` covering accepted completion
  forms, kind/form mismatch, status/form mismatch, required verifier/source
  evidence, side-effect shape, and comment round-trip.
- Updated Route Consumer Execution Architecture with the shared evidence
  envelope boundary.
- `node --test scripts/live-runner-contract.test.mjs` passed.
- `node tools/zj-loop-audit/dist/cli.js .` passed with L3.
- `git diff --check` passed.

### 1-2 Route Table Live Eligibility Gate

Status: completed

Scope:

- Extend deterministic eligibility checks where needed so live promotion fails
  closed when evidence, maturity, completion form, or side-effect level is
  inconsistent.
- Keep the Route Table as source of truth.

Verification:

- `tools/zj-loop-core` route tests cover live-ready and not-live-ready examples.
- `zj-loop-audit` catches live rows without sufficient runner evidence.

Evidence:

- Extended `@jununfly/zj-loop-core` RouteStatus with `completion_forms`.
- `validateRouteExecutionContract` now rejects consumer-kind/completion-form
  mismatches and missing completion forms.
- Added route tests for invalid completion forms and missing live evidence.
- `npm run build` passed in `tools/zj-loop-core`.
- `node --test tools/zj-loop-core/test/route.test.mjs` passed.
- `node tools/zj-loop-audit/dist/cli.js .` passed with L3.
- `git diff --check` passed.

## Layer 2: Cleanup and Fix Runners

Purpose: upgrade the highest-value bounded runners first.

### 2-1 Post-Merge Cleanup Live Runner

Status: completed

Scope:

- Decide whether current guarded live cleanup is sufficient to mark the route
  `live`, or whether it should remain `dry-run` with optional operator live
  path.
- If promoted, keep the scope narrow: delete only the merged `zjal/*` branch
  named in the valid post-merge contract and close only the activation carrier
  issue named in the same contract.
- Record live evidence in `zj-loop/post-merge-state.md`.

Verification:

- Post-merge contract, executor, workflow, and e2e replay tests.
- Route Table live readiness tests.

Evidence:

- Post-Merge live executor now returns `zj-loop.live_runner_evidence.v1`
  evidence for executed cleanup and refused escalation-shaped outcomes.
- `zj-loop/post-merge-state.md` records that the executor is live-capable while
  the Route Table remains `dry-run` until real workflow-dispatch live evidence
  exists.
- `node --test scripts/post-merge-roadmap-closeout.test.mjs scripts/live-runner-contract.test.mjs` passed.
- `node tools/zj-loop-audit/dist/cli.js .` passed with L3.
- `git diff --check` passed.
- Decision: do not promote `post-merge-roadmap-closeout` to
  `execution.mode: live` in this slice. The current automatic route is dry-run;
  live cleanup remains explicit operator execution with fixed confirmation.

### 2-2 Dependency Sweeper Live Runner

Status: completed

Scope:

- Implement or defer a deterministic dependency repair runner for low/medium
  patch/minor direct dependency updates.
- Allowed live completion forms: repair PR or escalation issue.
- Keep major, high-risk, critical CVE, denylisted package, and verifier failure
  human-gated.

Verification:

- Replay covers request -> claim -> repair PR.
- Replay covers request -> claim -> escalation issue.
- Tests prove no manifest/lockfile edits occur before claim eligibility.

Evidence:

- Added `scripts/dependency-sweeper-live-runner.mjs`, a guarded npm
  patch/minor runner that only acts on already consumed Dependency Sweeper Issue
  Fix Requests.
- Added `scripts/dependency-sweeper-live-runner.test.mjs` covering package
  subject propagation, claim-before-repair refusal, repair PR evidence,
  escalation evidence, high-risk refusal, empty-diff escalation, explicit
  dependency section guard, and fixed confirmation phrase guard.
- Extended Issue Fix Request subjects and Route Decisions with dependency
  package/version/risk fields needed by the runner.
- Updated Route Table truth to `maturity.runner: replayed` while keeping
  `execution.mode: claim-only`.
- Updated Dependency Sweeper state, Dogfood Reference Case, Route Table
  Architecture, and Route Consumer Execution Architecture.
- `node --test scripts/dependency-sweeper-live-runner.test.mjs scripts/dependency-sweeper-claim-e2e-replay.test.mjs scripts/dependency-sweeper-route-e2e-replay.test.mjs scripts/live-runner-contract.test.mjs` passed.
- Decision: do not promote `dependency-sweeper` to `execution.mode: live` in
  this slice. The runner is replayed and guarded, but live promotion still
  requires real workflow-dispatch dogfood evidence for repair PR or escalation
  issue creation.

### 2-3 PR Steward Live Runner

Status: completed

Scope:

- Implement or defer a runner for failed PR check rollups that creates a
  verifier-backed repair PR or escalation issue.
- Do not mutate the source PR directly: no source PR comments, labels, rebase,
  merge, workflow dispatch, or direct repair on the source branch unless a later
  route explicitly allows it.

Verification:

- Replay covers current-head-SHA match, stale-head denial, non-main denial,
  repair PR/escalation completion, and no source PR side effects.

Evidence:

- Added `scripts/pr-steward-live-runner.mjs`, a guarded runner for already
  consumed PR Steward Issue Fix Requests.
- Added `scripts/pr-steward-live-runner.test.mjs` covering claim-before-repair
  refusal, current-head-SHA match, stale-head denial, non-main denial, repair
  PR evidence, escalation issue evidence, verifier failure escalation, repair
  file allowlist, fixed confirmation phrase, and no source PR side effects.
- Updated Route Table truth to `maturity.runner: replayed` while keeping
  `execution.mode: claim-only`.
- Updated PR Steward state, Dogfood Reference Case, Route Table Architecture,
  and Route Consumer Execution Architecture.
- `node --test scripts/pr-steward-live-runner.test.mjs scripts/pr-steward-claim-e2e-replay.test.mjs scripts/pr-steward-fix-request-e2e-replay.test.mjs scripts/live-runner-contract.test.mjs` passed.
- Decision: do not promote `pr-steward-fix-request` to `execution.mode: live`
  in this slice. The runner is replayed and guarded, but live promotion still
  requires real workflow-dispatch dogfood evidence for independent repair PR or
  escalation issue creation.

## Layer 3: Draft and Triage Actions

Purpose: handle non-fix consumers without pretending reports are runners.

### 3-1 Changelog Drafter Live Draft Consumer

Status: completed

Scope:

- Implement or defer a live draft consumer that turns existing release-window
  evidence into draft evidence or a draft PR.
- Keep tag, release, publish, and final changelog acceptance behind human
  approval.

Verification:

- Replay covers draft evidence/draft PR, duplicate, human-gated window,
  missing report rejection, and escalation.

Evidence:

- Added `scripts/changelog-drafter-live-runner.mjs`, a guarded runner for
  existing Changelog Drafter `draft-request-candidate` evidence.
- Added `scripts/changelog-drafter-live-runner.test.mjs` covering
  `draft-evidence`, `draft-pr`, empty-diff escalation, human-gated refusal,
  duplicate refusal, safe draft path guard, fixed confirmation phrase, and
  release-side-effect denial.
- Added `scripts/write-file-once.mjs` and `scripts/write-file-once.test.mjs`
  as a deterministic helper for draft artifact creation without overwrite.
- Updated Route Table truth to `maturity.runner: replayed` while keeping
  `execution.mode: report-only`.
- Updated Changelog Drafter state, Dogfood Reference Case, Route Table
  Architecture, and Route Consumer Execution Architecture.
- `node --test scripts/changelog-drafter-live-runner.test.mjs scripts/changelog-drafter-draft-request-e2e-replay.test.mjs scripts/changelog-drafter-report-e2e-replay.test.mjs scripts/live-runner-contract.test.mjs` passed.
- Decision: do not promote `changelog-drafter-draft-request` beyond
  `execution.mode: report-only` in this slice. The runner is replayed and
  guarded, but live promotion still requires real workflow-dispatch dogfood
  evidence for draft evidence or draft PR creation.

### 3-2 Issue Triage Action Route Design

Status: completed

Scope:

- Keep `issue-triage-report` report-only.
- Design a separate `issue-triage-action` route only if side effects are worth
  adding.
- Define which low-risk actions could ever be live, such as adding a narrowly
  allowlisted label or posting a fixed comment template.

Verification:

- Report-only replay still proves `issue-triage-report` cannot mutate issues.
- Any action route remains disabled or non-live until its own runner and tests
  exist.

Evidence:

- Added `triage-action-consumer` to the Route execution and live-runner
  evidence contracts.
- Added `issue-triage-action` as a separate dry-run Route Table row with
  allowlisted labels, fixed comment templates, human-guard escalation, and no
  live side effects.
- Added `scripts/issue-triage-action-runner.mjs` and
  `scripts/issue-triage-action-runner.test.mjs` covering allowlisted label
  dry-run, fixed comment dry-run, unsupported label rejection, freeform comment
  rejection, human-guard escalation, and live refusal.
- Updated Issue Triage state and durable docs to preserve the report/action
  boundary.
- `npm run build` passed in `tools/zj-loop-core`.
- `npm run build` passed in `tools/zj-loop-audit`.
- `node --test scripts/issue-triage-action-runner.test.mjs scripts/issue-triage-report-e2e-replay.test.mjs scripts/live-runner-contract.test.mjs` passed.
- `node --test tools/zj-loop-core/test/route.test.mjs` passed.
- `npm run test:route-decision` passed.
- `node tools/zj-loop-audit/dist/cli.js .` passed with L3.
- `git diff --check` passed.

## Layer 4: Release Readiness

### 4-1 Product and Docs Alignment

Status: completed

Scope:

- Update Route Consumer Execution Architecture and Dogfood Reference Case with
  the new live/non-live matrix.
- Update README/Quickstart only if user-facing claims need to change.

Verification:

- Docs match Route Table truth.
- No product copy claims all consumers are live unless they are.

Evidence:

- Updated README and README.zh-CN with current automation boundary tables.
- Updated the Chinese README with the generated GitHub Actions bundle setup
  and Route Table enable/disable commands.
- Updated `zj-loop/ZJ-LOOP.md` and Dogfood Reference verification commands to
  include replayed live runner/action tests.
- Updated this roadmap and Roadmap-Sliced state to reflect the current branch
  and completed 4-1 slice.
- `git diff --check` passed.
- `node tools/zj-loop-audit/dist/cli.js .` passed with L3.

### 4-2 Closeout

Status: pending

Scope:

- Run full validate/audit gates.
- Merge process roadmap decisions into durable docs/state.
- Delete this process roadmap before PR merge unless explicitly retained.
- Prepare PR body with post-merge cleanup contract.

Verification:

- `bash scripts/ci-validate-gates.sh`
- `bash scripts/ci-audit-gates.sh`
- `git diff --check`

## Current Next Leaf

Continue with `4-2 Closeout`.
