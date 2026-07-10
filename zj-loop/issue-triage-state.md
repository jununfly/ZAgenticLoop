# Issue Triage State

Last run: 2026-07-10

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
  - Runner maturity: `replayed` plus live workflow-dispatch dogfood evidence

## Allowed Observations

- `missing-info-observation`
- `possible-duplicate-observation`
- `label-suggestion-observation`
- `human-attention-candidate`
- `issue-backlog-summary`

## Evidence

- 2026-07-09 dogfood run applied `issue-backlog-triage` to the live
  `jununfly/ZAgenticLoop` open issue backlog. The route remained report-only:
  no public issue comments, labels, assignments, milestones, close/reopen
  actions, formal lifecycle transitions, Issue Fix Requests, or consumer work
  were created.
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

## Dogfood Run — 2026-07-09

Scan window: `open-issues:2026-07-09`

Source command:

```bash
gh issue list --state open --limit 50 --json number,title,body,labels,assignees,createdAt,updatedAt,url,author,comments
```

Observed open issues:

| Issue | Signal kind | Recommended state | Decision | Request id | Notes |
| --- | --- | --- | --- | --- | --- |
| [#7](https://github.com/jununfly/ZAgenticLoop/issues/7) | `label-suggestion-observation` | `ready-for-agent` | `rd_issue_triage_54138473c258` | `triage-transition-ea7301f8e65a` | Concrete product gap and acceptance criteria for surfacing PRD next-command handoff comments while preserving report-only defaults. |
| [#52](https://github.com/jununfly/ZAgenticLoop/issues/52) | `human-attention-candidate` | `ready-for-human` | `rd_issue_triage_3f36a2a58044` | `triage-transition-eda47c28b2cd` | Plan activation carrier appears consumed/merged; maintainer should decide whether to close or retain it as durable plan context. |
| [#6](https://github.com/jununfly/ZAgenticLoop/issues/6) | `human-attention-candidate` | `ready-for-human` | `rd_issue_triage_896b7bfa27cb` | `triage-transition-2d17fd72d00f` | Multi-part product design scope should be split or prioritized before agent delegation. |
| [#4](https://github.com/jununfly/ZAgenticLoop/issues/4) | `possible-duplicate-observation` | `ready-for-human` | `rd_issue_triage_525a3ce971db` | `triage-transition-a6d5a168d79d` | Possible overlap with #6 around audit warning categories and exact remediation commands. |

Backlog summary: 4 open issues scanned; 1 `ready-for-agent` recommendation,
2 human-attention candidates, and 1 possible-overlap observation.

Maintainer/collaborator confirmation commands, if a transition should be
promoted later:

```text
/zj-loop confirm-triage-transition triage-transition-ea7301f8e65a
/zj-loop confirm-triage-transition triage-transition-eda47c28b2cd
/zj-loop confirm-triage-transition triage-transition-2d17fd72d00f
/zj-loop confirm-triage-transition triage-transition-a6d5a168d79d
```

Report-only side-effect audit for this run:

```text
public_issue_comment_created: false
tracker_state_changed: false
label_changed: false
assignment_changed: false
milestone_changed: false
issue_closed_or_reopened: false
formal_lifecycle_transitioned: false
issue_fix_request_created: false
consumer_work_started: false
```

## Dogfood Run — 2026-07-10

Scan window: `open-issues:2026-07-10`

Source command:

```bash
gh issue list --state open --limit 50 --json number,title,body,labels,assignees,createdAt,updatedAt,url,author,comments
```

Observed open issues:

| Issue | Signal kind | Recommended state | Decision | Request id | Notes |
| --- | --- | --- | --- | --- | --- |
| [#89](https://github.com/jununfly/ZAgenticLoop/issues/89) | `label-suggestion-observation` | `ready-for-agent` | `rd_issue_triage_20f373a95e92` | `triage-transition-02d0ef43b214` | GitLab provider dogfood report with concrete hardening gaps across CI template portability, runner configuration, vendored package behavior, route vocabulary, request body wording, closeout contracts, and specialized route expectations. |

Backlog summary: 1 open issue scanned; 1 `ready-for-agent` recommendation.

Maintainer/collaborator confirmation command, if the transition should be
promoted later:

```text
/zj-loop confirm-triage-transition triage-transition-02d0ef43b214
```

Replay and report-only evidence:

- Local route replay gate passed: `npm run test:issue-backlog-triage`.
- Local end-to-end replay passed:
  `node scripts/issue-backlog-triage-e2e-replay.mjs`.
- Dedupe key:
  `issue-backlog-triage:jununfly/ZAgenticLoop:open-issues:2026-07-10:label-suggestion-observation:issue-89`.
- Confirmation phrase remains fixed if promoted:
  `CONFIRM_TRIAGE_TRANSITION`.
- Stale-after timestamp: `2026-07-17T10:00:00.000Z`.

Report-only side-effect audit for this run:

```text
public_issue_comment_created: false
tracker_state_changed: false
label_changed: false
assignment_changed: false
milestone_changed: false
issue_closed_or_reopened: false
formal_lifecycle_transitioned: false
issue_fix_request_created: false
consumer_work_started: false
```

## Confirmed Transition Dogfood — 2026-07-10

Source issue: [#89](https://github.com/jununfly/ZAgenticLoop/issues/89)

Confirmed request:

```text
/zj-loop confirm-triage-transition triage-transition-02d0ef43b214

CONFIRM_TRIAGE_TRANSITION
```

Execution evidence:

- Maintainer confirmation phrase was provided in the Codex session.
- Local transition gate passed: `npm run test:issue-triage-transition-e2e`.
- Confirmed transition status: `confirmed`.
- Confirmed transition run id: `afa1027b2078`.
- Planned and created Issue Fix Request id: `ifr_triage_6b1bcf67fbf9`.
- Requested consumer: `roadmap-sliced-development`.
- Source issue request carrier:
  https://github.com/jununfly/ZAgenticLoop/issues/89#issuecomment-4934172412
- Dedupe verification: `gh issue view 89 --json number,url,comments`
  showed exactly one `<!-- zj-loop:issue-fix-request` carrier comment for
  `ifr_triage_6b1bcf67fbf9`.

Live side-effect audit:

```text
source_issue: https://github.com/jununfly/ZAgenticLoop/issues/89
public_issue_comment_created_by_runner: true
public_issue_comment_kind: source_issue_issue_fix_request
tracker_state_changed: false
label_changed: false
assignment_changed: false
milestone_changed: false
issue_closed_or_reopened_by_runner: false
formal_lifecycle_transitioned: false
independent_issue_fix_request_created: false
consumer_work_started: false
dedupe_result: exactly_one_structured_issue_fix_request_comment
```

## Boundary

Issue Backlog Triage is report-only in this repository. It may record
recommended triage transition evidence and fixed confirmation commands, but it
must not write public issue comments, mutate labels, assign issues, set
milestones, close/reopen issues, perform formal lifecycle transitions,
batch-mutate an issue tracker, create Issue Fix Requests, or start consumer
work.

Issue side effects are separated into `issue-triage-transition` and
`issue-triage-action`. `issue-triage-transition` is a request-only, replayed
consumer that creates or dedupes Issue Fix Request comments on the source issue
for `ready-for-agent` after fixed confirmation. Independent Issue Fix Request
issues are narrow exceptions for missing source issues, cross-repository
permission limits, source issues unsuitable for automation evidence, or explicit
human-requested isolation.
`issue-triage-action` handles narrowly allowlisted labels or fixed comment
templates and remains dry-run. Neither route may perform source issue mutation
until workflow-dispatch dogfood evidence exists and the Route Table is explicitly promoted to
`execution.mode: live`.

## Confirmed Transition Dogfood — 2026-07-09

Source issue: [#7](https://github.com/jununfly/ZAgenticLoop/issues/7)

Confirmed request:

```text
/zj-loop confirm-triage-transition triage-transition-ea7301f8e65a

CONFIRM_TRIAGE_TRANSITION
```

Historical execution evidence:

- Maintainer confirmation comment was present on source issue #7:
  https://github.com/jununfly/ZAgenticLoop/issues/7#issuecomment-4924123652
- Published package path verified with
  `@jununfly/zj-loop-core@0.1.3 zj-loop-issue-triage-transition confirm-plan`.
- Confirmed transition status: `confirmed`.
- Planned Issue Fix Request id: `ifr_triage_c57037197eb2`.
- Historical dogfood created an independent Issue Fix Request carrier:
  [#70](https://github.com/jununfly/ZAgenticLoop/issues/70).
- Follow-up simplification work found this split carrier created status drift
  risk because source issue #7 was not the lifecycle home. New confirmed
  transitions default to source issue Issue Fix Request comments instead.

Source issue side-effect audit after confirmed transition:

```text
source_issue: https://github.com/jununfly/ZAgenticLoop/issues/7
public_issue_comment_created_by_runner: false
tracker_state_changed: false
label_changed: false
assignment_changed: false
milestone_changed: false
issue_closed_or_reopened: false
formal_lifecycle_transitioned: false
issue_fix_request_created_on_independent_carrier: true
consumer_work_started: false
```

Carrier contract audit:

```text
carrier_issue: https://github.com/jununfly/ZAgenticLoop/issues/70
schema: zj-loop.issue_fix_request.v1
request_id: ifr_triage_c57037197eb2
requested_consumer: roadmap-sliced-development
status: requested
failure_policy.retry: new_request_only
verification_gate.commands: git diff --check
```

## Source Issue Carrier Live Dogfood — 2026-07-09

Live chain:

```text
Issue Backlog
-> Route Decision
-> Recommended Triage Transition
-> Confirmed Triage Transition
-> Source Issue Fix Request Comment
```

Replay and live evidence:

- Local replay gate: `npm run test:issue-backlog-triage`.
- Local transition gate: `npm run test:issue-triage-transition-e2e`.
- Live workflow-dispatch run:
  https://github.com/jununfly/ZAgenticLoop/actions/runs/29018974110
- Source issue request carrier:
  https://github.com/jununfly/ZAgenticLoop/issues/7#issuecomment-4925192831
- Source issue: https://github.com/jununfly/ZAgenticLoop/issues/7
- Confirmed transition request id: `triage-transition-ea7301f8e65a`.
- Issue Fix Request id: `ifr_triage_10ad5374e8d7`.
- Requested consumer: `roadmap-sliced-development`.

Live side-effect audit:

```text
source_issue: https://github.com/jununfly/ZAgenticLoop/issues/7
public_issue_comment_created_by_runner: true
public_issue_comment_kind: source_issue_issue_fix_request
tracker_state_changed: false
label_changed: false
assignment_changed: false
milestone_changed: false
issue_closed_or_reopened_by_runner: false
formal_lifecycle_transitioned: false
independent_issue_fix_request_created: false
consumer_work_started: false
dedupe_result: exactly_one_structured_issue_fix_request_comment
```

Live dogfood failures found before success:

| Failure | Repair PR | Result |
| --- | --- | --- |
| Maintainer confirmation comments containing the transition request id could be mistaken for an existing Issue Fix Request carrier. | [#75](https://github.com/jununfly/ZAgenticLoop/pull/75) | Dedupe now requires `<!-- zj-loop:issue-fix-request` plus the request id. |
| GitHub Actions step used `gh issue view/comment` without `GH_TOKEN`. | [#77](https://github.com/jununfly/ZAgenticLoop/pull/77) | Workflow step now sets `GH_TOKEN: ${{ github.token }}`. |

Closeout gap:

- Directly related issues/PRs were not closed by the loop after success.
- #7 and #77 were closed manually by the maintainer.
- Future closeout planning should make the next close action explicit and
  auditable: close target, close reason, evidence links, guard, and whether the
  action is only recommended or can be executed by a narrow closeout consumer.
