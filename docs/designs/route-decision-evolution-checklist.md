# Route Decision Evolution Checklist

This checklist orders the next Route Decision work for ZAgenticLoop. It is for
maintainers deciding what to implement next, what to promote to a higher version
of automation, and what should stay report-only until the contract is clearer.

The ordering favors small replayable slices, clear evidence boundaries, and low
risk of confusing producers, dispatchers, and consumers.

## Current Baseline

Implemented in the dogfood route table:

- `human`: report-only escalation for high/unknown risk.
- `ignore`: report-only noise recording.
- `daily-triage-report`: report-only Daily Triage state evidence.
- `pr-steward-report`: report-only PR event evidence.
- `pr-steward-fix-request`: request-only Issue Fix Request for failed PR checks.
- `ci-sweeper`: Issue Fix Request route with the first live deterministic Fix
  Consumer path.
- `dependency-sweeper`: request-only Issue Fix Request route.
- `changelog-drafter-report`: report-only release-window evidence.
- `roadmap-sliced-development`: activation-comment route.
- `post-merge-roadmap-closeout`: report-only post-merge cleanup contract check
  plus explicit guarded executor for operator-approved closeout.

Key boundary: Route Decision and Dispatcher work must not do consumer work.
Consumer claim, repair, drafting, changelog edits, PR creation, tagging,
publishing, label changes, and issue lifecycle transitions need explicit later
slices.

## Recommended Order

### 1. Issue Triage Report Route

Status: implemented
Type: new Route Decision
Recommended next action: use as reference for later report-only route slices

Proposed chain:

```text
Issue Backlog Signal -> Route Decision -> Issue Triage Report Evidence
```

Why first:

- `issue-triage-report` replaces the old issue-triage placeholder with an
  implemented `report-only` route.
- It fills the cleanest remaining Route Decision gap without crossing into
  formal issue lifecycle transitions.
- It helps Daily Triage consume backlog health without becoming an issue
  lifecycle engine.

Recommended first slice:

- Route id: `issue-triage-report`.
- Request kind: `report-only`.
- Consumer: `issue-triage`.
- Evidence store: `zj-loop/issue-triage-state.md`.
- Allowed `signal_kind` values: `missing-info-observation`,
  `possible-duplicate-observation`, `label-suggestion-observation`,
  `human-attention-candidate`, and `issue-backlog-summary`.
- Denied in first slice: closing issues, label mutation, state transitions such
  as `ready-for-agent`, public issue comments, assignment, milestone changes.
- Human gate: only high/unknown risk, security/privacy, auth/billing/legal,
  destructive action, formal lifecycle transition, public issue comment, or
  label mutation requirements.
- Dedupe: `issue-triage:<repo>:<scan_window>:<signal_kind>:<subject>`.
- Fixed Route Decision statuses: `recorded`, `already-recorded`, `rejected`,
  and `routed-to-human-review`.

Required evidence:

- Deterministic replay for backlog summary, duplicate candidate, high-risk human
  gate, duplicate report, and denied lifecycle mutation.
- Durable testing doc under `docs/testing/`.
- Route Table Architecture uses `issue-triage-report` as the implemented route
  name and request kind.

### 2. Dependency Sweeper Claim Contract

Status: implemented
Type: version upgrade for an existing route
Recommended next action: use as reference for later claim-only Fix Consumer slices

Proposed chain:

```text
Dependency Alert -> Route Decision -> Issue Fix Request -> Dependency Sweeper Claim Evidence
```

Why second:

- `dependency-sweeper` already creates bounded Issue Fix Requests.
- The next missing boundary is not package mutation; it is consumer claim and
  lifecycle evidence.
- Claim coverage makes request-only routes less abstract while staying short of
  lockfile edits and Fix PR creation.

Recommended first upgrade:

- Keep route id `dependency-sweeper`.
- Add consumer claim replay using the existing Issue Fix Request lifecycle
  contract.
- Require consumer id match, capability match, verifier gate presence, direct
  dependency signal, patch/minor scope, and main branch.
- Deny mismatched consumer claims and high-risk/major updates.
- No package.json edits, lockfile edits, PR creation, or auto-merge.
- Claim evidence transitions an existing Issue Fix Request from `requested` to
  `consumed`; it does not start dependency repair.

Required evidence:

- Replay for requested -> consumed.
- Replay for consumer mismatch denied.
- Replay for missing verifier gate denied.
- Replay for non-requested request denied.
- Replay for high-risk/major human gate before request/claim.
- State/evidence target remains `zj-loop/dependency-sweeper-state.md` or
  structured Issue Fix Request lifecycle comments.

### 3. PR Steward Claim Contract

Status: implemented
Type: version upgrade for an existing route
Recommended next action: use as reference for later claim-only PR-facing Fix Consumer slices

Proposed chain:

```text
Pull Request Event -> Route Decision -> Issue Fix Request -> PR Steward Claim Evidence
```

Why third:

- `pr-steward-fix-request` now creates/dedupes independent Issue Fix Requests.
- The next safe upgrade is to let PR Steward claim a request, not repair code or
  comment on the source PR.
- This clarifies the boundary between "PR needs fixing" and "PR Steward starts
  assisted work".

Recommended first upgrade:

- Keep route id `pr-steward-fix-request`.
- Add claim-only replay for PR Steward.
- Require failing GitHub status/check rollup, non-draft PR, base `main`, fixed
  request subject, and matching consumer.
- No source PR comments, labels, rebase, merge, workflow dispatch, or repair.
- Human gate before any public PR side effect or code change.

Required evidence:

- Replay for requested -> consumed by `pr-steward`.
- Replay for mismatched consumer denied.
- Replay for missing verifier gate, stale head SHA, non-main base, repeated
  claim, or duplicate existing request denied before claim evidence.
- Docs in `docs/testing/pr-steward-report-e2e.md`.

### 4. Changelog Drafter Draft Request

Status: implemented
Type: version upgrade for an existing route
Recommended next action: use as reference for report-only follow-up routes that
separate request candidate evidence from consumer execution

Proposed chain:

```text
Release Window Evidence -> Route Decision -> Changelog Draft Request -> Changelog Drafter
```

Why fourth:

- `changelog-drafter-report` already records release-window evidence.
- Drafting release notes is consumer work and should not be hidden inside the
  report-only route.
- A separate request makes it clear when the project moves from "evidence
  exists" to "draft release notes".

Recommended first upgrade:

- New route id: `changelog-drafter-draft-request`.
- Request kind remains `report-only`; this slice does not introduce a general
  `draft-request` lifecycle.
- Consumer: `changelog-drafter`.
- Evidence store: `zj-loop/changelog-drafter-state.md`.
- Input must reference an existing `changelog-drafter-report` decision.
- Deny tag/release events, publish requests, changelog PRs, and package
  publishing.
- Human gate required for breaking/security/major/large windows before any
  draft work.

Required evidence:

- Contract decision that `draft-request` is not a new request kind in this
  slice; `changelog-drafter-draft-request` is a report-only follow-up route.
- Replay for normal draft candidate, human-gated candidate, duplicate window,
  and denied publish-adjacent signal.

### 5. Post-Merge Roadmap Closeout Execution

Status: implemented
Type: version upgrade for an existing route
Recommended next action: dogfood on real merged Roadmap-Sliced PRs and keep
live mode behind explicit operator invocation

Proposed chain:

```text
Merged Roadmap PR -> Route Decision -> Post-Merge Contract -> Cleanup Actions
```

Why fifth:

- `post-merge-roadmap-closeout` is currently report-only, but live manual
  cleanup has repeatedly followed the same contract: confirm merged PR, delete
  roadmap branch, close carrier issue if no pending follow-ups.
- This is a good automation candidate because the action set is small and
  contract-guarded.

Implemented upgrade:

- Keep route id `post-merge-roadmap-closeout`.
- Do not make it a broad cleanup agent.
- Allow only:
  - delete merged `zjal/` branch named in valid contract
  - close only the carrier issue named in valid contract
- Require merged PR, same repository, branch match, non-protected branch, clean
  worktree, expected repository, expected activation carrier issue,
  `no_pending_followups: true`, and valid `zj-loop.post-merge-contract`.
- Missing or invalid contract remains report-only.
- Default mode is dry-run. `--live` is required for branch deletion, carrier
  issue comment, and carrier issue closure.
- Runtime execution uses `scripts/post-merge-roadmap-closeout.mjs`; tests use an
  injected runner and never call real `git` or `gh`.
- Usability upgrade adds `npm run post-merge-closeout -- ...` for maintainer
  local execution.
- Evidence upgrade makes the executor generate the PR comment body and write the
  full JSON plan to an artifact file.
- Automatic trigger upgrade runs dry-run on merged PRs and comments evidence on
  the merged PR; live cleanup remains explicit.
- Optional live workflow dispatch requires the fixed confirmation phrase
  `DELETE_MERGED_ROADMAP_BRANCH_AND_CLOSE_CARRIER`.
- Protocol upgrade accepts only the current `kind/version/consumer/mode` YAML
  object and retires the legacy mapping shape.

Required evidence:

- Replay for dry-run and side-effect-enabled mode: implemented.
- Tests proving ordinary linked issues cannot be closed: implemented.
- Tests proving protected branches and branch mismatches are denied: implemented
  by the contract gate.
- Human approval before enabling live side effects in this repository: still
  required by `zj-loop/zj-loop-constraints.md`.
- Workflow structure test for automatic dry-run evidence, artifact upload, and
  fixed live confirmation phrase: implemented.

### 6. CI Sweeper Request Hardening

Status: implemented
Type: version hardening for an existing live route
Recommended next action: dogfood through Daily Triage workflow runs and use the
replay suite as the regression boundary for future CI Sweeper changes

Proposed chain:

```text
CI Failure -> Route Decision -> Issue Fix Request -> CI Sweeper -> Fix PR / Escalation
```

Why sixth:

- `ci-sweeper` is already the first live Fix Consumer path.
- The priority is hardening, not broadening: better loop prevention,
  source-run replay, and duplicate behavior.

Implemented hardening:

- Make generated branch denial and duplicate request evidence more explicit in
  route table docs.
- Add replay scenarios for same-day branch overwrite behavior, stale workflow
  run ids, and repeated failed repairs.
- Keep deterministic repair allowlist narrow.
- No auto-merge.

Required evidence:

- Replay for generated branch denied: implemented in
  `scripts/ci-sweeper-e2e-replay.test.mjs`.
- Replay for duplicate `source_run_id` and existing lifecycle:
  `scripts/ci-sweeper-lifecycle.test.mjs` and
  `scripts/ci-sweeper-e2e-replay.test.mjs`.
- Replay for repair PR and escalation issue: implemented.
- Evidence that Daily Triage reports existing lifecycle instead of repeatedly
  dispatching the same failed run: implemented through
  `scripts/ci-sweeper-lifecycle.mjs` and
  `scripts/daily-triage-workflow-contract.test.mjs`.
- Stale `source_run_id` route denial: implemented in
  `scripts/route-ci-failure.test.mjs`.

### 7. Roadmap-Sliced Activation Resume / Failure Recovery

Status: candidate
Type: version hardening for an existing activation route
Recommended next action: run after CI Sweeper hardening

Proposed chain:

```text
Issue Slash Command -> Route Decision -> Activation Request -> Roadmap-Sliced Consumer
```

Why seventh:

- The activation route is already fixed and heavily used.
- The next value is not a new route; it is better failure/resume evidence so
  agents know when to resume versus create a new activation request.

Recommended hardening:

- Add explicit replay for failed activation followed by a new request.
- Add explicit replay for resume of consumed request without a new activation.
- Add audit evidence for duplicate commands after consumed state.
- Keep command shape parameterless in this phase.

Required evidence:

- Tests in activation contract and dispatcher.
- Durable docs clarifying that failed requests are terminal, while consumed
  requests may be resumed by Roadmap-Sliced Development without a new
  activation.

### 8. Route Decision Contract Normalization

Status: candidate
Type: cross-cutting version upgrade
Recommended next action: run only after the route-specific backlog above

Why later:

- Normalization is valuable, but doing it too early risks abstract refactors
  before enough concrete route shapes are known.
- After issue-triage, claim contracts, changelog draft request, and post-merge
  cleanup, the common fields will be clearer.

Recommended scope:

- Extract shared helpers for:
  - route match diagnostics
  - side-effect flags
  - duplicate evidence
  - human gate reasons
  - report evidence shape
- Preserve route-specific replay files.
- Avoid introducing a generic runtime queue.

Required evidence:

- No behavior changes in existing replay suites.
- `npm run test:route-decision`.
- `bash scripts/ci-validate-gates.sh`.

## Work Items To Avoid For Now

- Tag/release-triggered Changelog Drafter automation.
- Automatic changelog PRs.
- Package publishing.
- Auto-merge for any consumer.
- Broad workflow-dispatch routes without request evidence.
- Formal issue lifecycle transitions from Daily Triage.
- Replacing route-specific replay files with one opaque mega-dispatcher.

## Implementation Rule

Every item above that changes code should use Roadmap-Sliced Development:

1. Create or reuse an issue-triggered Activation Request.
2. Consume it into a `zjal/<roadmap-id>` branch.
3. Keep the process roadmap in the PR while review is active.
4. Commit each slice with status, notes, and verification evidence updated
   before the commit.
5. Close out by moving decisions into durable docs, deleting process files, and
   opening a draft PR with a valid post-merge cleanup contract.
