# Issue Triage State

Last run: 2026-07-08

## Current Capability

- Route: `issue-backlog-triage`
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
- Route: `issue-triage-transition`
  - Consumer kind: `triage-action-consumer`
  - Execution mode: `request-only`
  - Completion forms: `triage-transition-confirmed`,
    `issue-fix-request-created`, `triage-action-skipped`, `escalation-issue`
  - Protocol maturity: `designed`
  - Runner maturity: `replayed`

## Allowed Observations

- `missing-info-observation`
- `possible-duplicate-observation`
- `label-suggestion-observation`
- `human-attention-candidate`
- `issue-backlog-summary`

## Evidence

- Issue Backlog Triage replay verifies allowed observations, recommended
  triage transition contracts, fixed status enum, already-recorded dedupe,
  unsupported signal rejection, hard human guard routing, forbidden protocol
  fields, `ready-for-agent` Issue Fix Request side-effect planning, and
  `wontfix` default confirmation blocking:
  `scripts/issue-backlog-triage-e2e-replay.test.mjs`.
- Report-only dispatcher replay verifies `human`, `ignore`, and
  `daily-triage-report` create evidence without Issue Fix Requests, activation
  requests, workflow dispatch, or consumer work:
  `scripts/report-only-route-dispatcher.test.mjs`.
- Issue Triage Action runner replay verifies allowlisted label dry-run, fixed
  comment dry-run, unsupported label rejection, freeform comment rejection,
  human-guard escalation, and live refusal until dogfood enables it:
  `scripts/issue-triage-action-runner.test.mjs`.
- Issue Triage Transition runner verifies maintainer/collaborator confirmation,
  exact slash command matching, fixed confirmation phrase, `ready-for-agent`
  Issue Fix Request carrier body generation, `needs-info` triage notes
  planning, and default `wontfix` escalation:
  `tools/zj-loop-core/test/issue-triage-transition-runner.test.mjs`.

## Boundary

Issue Backlog Triage is report-only in this repository. It may record
recommended triage transition evidence and fixed confirmation commands, but it
must not write public issue comments, mutate labels, assign issues, set
milestones, close/reopen issues, perform formal lifecycle transitions,
batch-mutate an issue tracker, create Issue Fix Requests, or start consumer
work.

Issue side effects are separated into `issue-triage-transition` and
`issue-triage-action`. `issue-triage-transition` is a request-only, replayed
consumer that creates or dedupes independent Issue Fix Request carriers for
`ready-for-agent` after fixed confirmation.
`issue-triage-action` handles narrowly allowlisted labels or fixed comment
templates and remains dry-run. Neither route may perform source issue mutation
until workflow-dispatch dogfood evidence exists and the Route Table is explicitly promoted to
`execution.mode: live`.
