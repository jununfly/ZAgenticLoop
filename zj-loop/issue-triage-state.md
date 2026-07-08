# Issue Triage State

Last run: 2026-07-08

## Current Capability

- Route: `issue-triage-report`
  - Consumer kind: `report-consumer`
  - Execution mode: `report-only`
  - Completion form: `report-evidence`
  - Protocol maturity: `replayed`
  - Runner maturity: `missing`
- Route: `issue-triage-action`
  - Consumer kind: `triage-action-consumer`
  - Execution mode: `dry-run`
  - Completion forms: `triage-label-applied`, `triage-comment-posted`,
    `triage-action-skipped`, `escalation-issue`
  - Protocol maturity: `designed`
  - Runner maturity: `replayed`

## Allowed Observations

- `missing-info-observation`
- `possible-duplicate-observation`
- `label-suggestion-observation`
- `human-attention-candidate`
- `issue-backlog-summary`

## Evidence

- Issue Triage replay verifies allowed observations, fixed status enum,
  already-recorded dedupe, unsupported signal rejection, hard human guard
  routing, and forbidden protocol fields:
  `scripts/issue-triage-report-e2e-replay.test.mjs`.
- Report-only dispatcher replay verifies `human`, `ignore`, and
  `daily-triage-report` create evidence without Issue Fix Requests, activation
  requests, workflow dispatch, or consumer work:
  `scripts/report-only-route-dispatcher.test.mjs`.
- Issue Triage Action runner replay verifies allowlisted label dry-run, fixed
  comment dry-run, unsupported label rejection, freeform comment rejection,
  human-guard escalation, and live refusal until dogfood enables it:
  `scripts/issue-triage-action-runner.test.mjs`.

## Boundary

Issue Triage is report-only in this repository. It must not write public issue
comments, mutate labels, assign issues, set milestones, close/reopen issues,
perform formal lifecycle transitions, batch-mutate an issue tracker, create
Issue Fix Requests, or start consumer work.

Issue side effects are separated into `issue-triage-action`. That route is a
dry-run, replayed consumer only. It may plan narrowly allowlisted labels or
fixed comment templates, but it must not perform live issue mutation until
workflow-dispatch dogfood evidence exists and the Route Table is explicitly
promoted to `execution.mode: live`.
