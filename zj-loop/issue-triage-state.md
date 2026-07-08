# Issue Triage State

Last run: 2026-07-08

## Current Capability

- Route: `issue-triage-report`
  - Consumer kind: `report-consumer`
  - Execution mode: `report-only`
  - Completion form: `report-evidence`
  - Protocol maturity: `replayed`
  - Runner maturity: `missing`

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

## Boundary

Issue Triage is report-only in this repository. It must not write public issue
comments, mutate labels, assign issues, set milestones, close/reopen issues,
perform formal lifecycle transitions, batch-mutate an issue tracker, create
Issue Fix Requests, or start consumer work.

Future issue side effects require a separate `issue-triage-action` consumer and
must not be added to `issue-triage-report`.
