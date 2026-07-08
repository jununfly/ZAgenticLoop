# Live Runner Upgrades Roadmap

Roadmap id: `live-runner-upgrades`
Branch: `zjal/live-runner-upgrades`
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
- `dependency-sweeper`: `claim-only` fix-runner with missing runner. Candidate
  for verifier-backed dependency repair PR or escalation.
- `pr-steward-fix-request`: `claim-only` fix-runner with missing runner.
  Candidate for verifier-backed PR repair/escalation handoff, not PR mutation.
- `changelog-drafter-draft-request`: `report-only` draft-consumer with missing
  runner. Candidate for draft evidence or draft PR.
- `issue-triage-report`: must stay report-only. Future side effects require a
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

Status: pending

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

### 1-2 Route Table Live Eligibility Gate

Status: pending

Scope:

- Extend deterministic eligibility checks where needed so live promotion fails
  closed when evidence, maturity, completion form, or side-effect level is
  inconsistent.
- Keep the Route Table as source of truth.

Verification:

- `tools/zj-loop-core` route tests cover live-ready and not-live-ready examples.
- `zj-loop-audit` catches live rows without sufficient runner evidence.

## Layer 2: Cleanup and Fix Runners

Purpose: upgrade the highest-value bounded runners first.

### 2-1 Post-Merge Cleanup Live Runner

Status: pending

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

### 2-2 Dependency Sweeper Live Runner

Status: pending

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

### 2-3 PR Steward Live Runner

Status: pending

Scope:

- Implement or defer a runner for failed PR check rollups that creates a
  verifier-backed repair PR or escalation issue.
- Do not mutate the source PR directly: no source PR comments, labels, rebase,
  merge, workflow dispatch, or direct repair on the source branch unless a later
  route explicitly allows it.

Verification:

- Replay covers current-head-SHA match, stale-head denial, non-main denial,
  repair PR/escalation completion, and no source PR side effects.

## Layer 3: Draft and Triage Actions

Purpose: handle non-fix consumers without pretending reports are runners.

### 3-1 Changelog Drafter Live Draft Consumer

Status: pending

Scope:

- Implement or defer a live draft consumer that turns existing release-window
  evidence into draft evidence or a draft PR.
- Keep tag, release, publish, and final changelog acceptance behind human
  approval.

Verification:

- Replay covers draft evidence/draft PR, duplicate, human-gated window,
  missing report rejection, and escalation.

### 3-2 Issue Triage Action Route Design

Status: pending

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

## Layer 4: Release Readiness

### 4-1 Product and Docs Alignment

Status: pending

Scope:

- Update Route Consumer Execution Architecture and Dogfood Reference Case with
  the new live/non-live matrix.
- Update README/Quickstart only if user-facing claims need to change.

Verification:

- Docs match Route Table truth.
- No product copy claims all consumers are live unless they are.

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

Start with `1-1 Runner Lifecycle Contract`.
