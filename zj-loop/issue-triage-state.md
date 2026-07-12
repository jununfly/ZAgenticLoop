# Issue Triage State

Last run: 2026-07-12

This file records the current issue triage route state for this repository.
Detailed historical dogfood transcripts are intentionally not kept here once
their source issues, carriers, PRs, or durable docs have absorbed the evidence.

## Current Capability

- Route: `issue-backlog-triage`
  - Consumer: `issue-triage`
  - Consumer kind: `report-consumer`
  - Execution mode: `report-only`
  - Completion form: `report-evidence`
  - Protocol maturity: `replayed`
  - Runner maturity: `missing`
  - Side effects: forbidden
- Route: `issue-triage-transition`
  - Consumer: `issue-triage-transition`
  - Consumer kind: `triage-action-consumer`
  - Execution mode: `request-only`
  - Completion forms: `triage-transition-confirmed`,
    `issue-fix-request-created`, `triage-action-skipped`,
    `escalation-issue`
  - Protocol maturity: `designed`
  - Runner maturity: `replayed`
  - Side effects: source issue Issue Fix Request comment only, after fixed
    maintainer/collaborator confirmation
- Route: `issue-triage-action`
  - Consumer: `issue-triage-action`
  - Consumer kind: `triage-action-consumer`
  - Execution mode: `dry-run`
  - Completion forms: `triage-label-applied`, `triage-comment-posted`,
    `triage-action-skipped`, `escalation-issue`
  - Protocol maturity: `designed`
  - Runner maturity: `replayed`
  - Side effects: planned only; live issue mutation remains disabled

## Current Open Triage Work

- Active report-only scan:
  - Scan window: `open-issues:2026-07-12`
  - Open issues scanned: 3
  - Side effects executed: none
- Promoted transitions:
  - Source issue: `#104`
  - Transition request: `triage-transition-104-20260712`
  - Issue Fix Request: `ifr_triage_a064f4b67c1c`
  - Requested consumer: `roadmap-sliced-development`
  - Carrier comment:
    https://github.com/jununfly/ZAgenticLoop/issues/104#issuecomment-4949612301
  - Consumer status: requested; not yet consumed by Roadmap-Sliced Development
  - Source issue: `#105`
  - Transition request: `triage-transition-105-20260712`
  - Issue Fix Request: `ifr_triage_ec14f0deb2c5`
  - Requested consumer: `roadmap-sliced-development`
  - Carrier comment:
    https://github.com/jununfly/ZAgenticLoop/issues/105#issuecomment-4949612303
  - Consumer status: requested; not yet consumed by Roadmap-Sliced Development
  - Source issue: `#106`
  - Transition request: `triage-transition-106-20260712`
  - Issue Fix Request: `ifr_triage_2b661c2e8360`
  - Requested consumer: `roadmap-sliced-development`
  - Carrier comment:
    https://github.com/jununfly/ZAgenticLoop/issues/106#issuecomment-4949612316
  - Consumer status: requested; not yet consumed by Roadmap-Sliced Development
- Promoted transition:
  - Source issue: `#101`
  - Transition request: `triage-transition-af8f4278cf7b`
  - Issue Fix Request: `ifr_triage_c3dc6d47a53b`
  - Requested consumer: `roadmap-sliced-development`
  - Carrier comment:
    https://github.com/jununfly/ZAgenticLoop/issues/101#issuecomment-4943180683
  - Consumer status: consumed by Roadmap-Sliced Development
  - Consumed evidence:
    https://github.com/jununfly/ZAgenticLoop/issues/101#issuecomment-4943236762
- Open issue recommendations:
  - `#104`: `label-suggestion-observation`, recommended
    `ready-for-agent`; promoted to a source issue Issue Fix Request carrier
    for `roadmap-sliced-development`.
  - `#105`: `label-suggestion-observation`, recommended
    `ready-for-agent`; promoted to a source issue Issue Fix Request carrier
    for `roadmap-sliced-development`.
  - `#106`: `label-suggestion-observation`, recommended
    `ready-for-agent`; promoted to a source issue Issue Fix Request carrier
    for `roadmap-sliced-development`.
  - `#101`: `label-suggestion-observation`, recommended
    `ready-for-agent`; promoted to a source issue Issue Fix Request carrier
    for `roadmap-sliced-development`.
  - `#100`: `human-attention-candidate`, recommended `ready-for-human`;
    this issue is already an Issue Fix Request carrier for CI Sweeper, so
    triage must not create a nested Issue Fix Request.
- Previously tracked dogfood source issues and carriers have been closed or
  absorbed into durable documentation:
  - `#7` closed 2026-07-09
  - `#70` closed 2026-07-09
  - `#89` closed 2026-07-10
  - `#92` closed 2026-07-10

## Dogfood Run - 2026-07-11

Scan window: `all-issues:2026-07-11`

Source command:

```bash
gh issue list --repo jununfly/ZAgenticLoop --state all --limit 300 --json number,title,state,labels,assignees,createdAt,updatedAt,closedAt,url,author,body,comments
```

Backlog summary:

- Total issues scanned: 43
- Open issues: 2
- Closed issues: 41
- Open issue observations:
  - 1 `label-suggestion-observation`
  - 1 `human-attention-candidate`
- All tracker side effects remained disabled.

Observed open issues:

| Issue | Signal kind | Recommended state | Decision | Request id | Notes |
| --- | --- | --- | --- | --- | --- |
| [#101](https://github.com/jununfly/ZAgenticLoop/issues/101) | `label-suggestion-observation` | `ready-for-agent` | `rd_issue_triage_4e946fd3c5ef` | `triage-transition-af8f4278cf7b` | GitLab provider bundle feedback is detailed enough for roadmap-sliced implementation: CI fragment image/tag inheritance, private runner Node path, GitLab MR metadata fetch, dispatch/execution readiness split, provider metadata, manual replay support, production-safe profiles, audit substrate checks, YAML-preserving route enablement, and branch slug trimming. |
| [#100](https://github.com/jununfly/ZAgenticLoop/issues/100) | `human-attention-candidate` | `ready-for-human` | `rd_issue_triage_612e31c5b0c4` | `triage-transition-e6cda7db8a7e` | Existing CI Sweeper Issue Fix Request for failed run [29135923254](https://github.com/jununfly/ZAgenticLoop/actions/runs/29135923254). It should be consumed or closed through the existing `ci-sweeper` lifecycle, not converted into a nested Issue Fix Request. |

Maintainer/collaborator confirmation command if `#101` should be promoted:

```text
/zj-loop confirm-triage-transition triage-transition-af8f4278cf7b
```

Fixed confirmation phrase:

```text
CONFIRM_TRIAGE_TRANSITION
```

Confirmed transition evidence:

- Transition request: `triage-transition-af8f4278cf7b`
- Confirmed transition status: `confirmed`
- Issue Fix Request id: `ifr_triage_c3dc6d47a53b`
- Requested consumer: `roadmap-sliced-development`
- Source issue request carrier:
  https://github.com/jununfly/ZAgenticLoop/issues/101#issuecomment-4943180683
- Consumer lifecycle evidence:
  https://github.com/jununfly/ZAgenticLoop/issues/101#issuecomment-4943236762
- Dedupe verification: `gh issue view 101 --json number,title,state,url,comments`
  showed exactly one `<!-- zj-loop:issue-fix-request` carrier comment for
  `ifr_triage_c3dc6d47a53b`.

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

## Dogfood Run - 2026-07-12

Scan window: `open-issues:2026-07-12`

Source command:

```bash
gh issue list --repo jununfly/ZAgenticLoop --state open --limit 100 --json number,title,state,labels,assignees,createdAt,updatedAt,url,author,body,comments
```

Backlog summary:

- Open issues scanned: 3
- Open issue observations:
  - 3 `label-suggestion-observation`
- Report-only tracker side effects executed: none
- Confirmed transition side effects executed:
  - 3 source issue Issue Fix Request carrier comments
  - no labels changed
  - no assignments changed
  - no milestones changed
  - no issues closed or reopened
  - no independent carrier issues created

Observed open issues:

| Issue | Signal kind | Recommended state | Decision | Request id | Carrier |
| --- | --- | --- | --- | --- | --- |
| [#104](https://github.com/jununfly/ZAgenticLoop/issues/104) | `label-suggestion-observation` | `ready-for-agent` | `rd_issue_triage_104_20260712` | `triage-transition-104-20260712` | [ifr_triage_a064f4b67c1c](https://github.com/jununfly/ZAgenticLoop/issues/104#issuecomment-4949612301) |
| [#105](https://github.com/jununfly/ZAgenticLoop/issues/105) | `label-suggestion-observation` | `ready-for-agent` | `rd_issue_triage_105_20260712` | `triage-transition-105-20260712` | [ifr_triage_ec14f0deb2c5](https://github.com/jununfly/ZAgenticLoop/issues/105#issuecomment-4949612303) |
| [#106](https://github.com/jununfly/ZAgenticLoop/issues/106) | `label-suggestion-observation` | `ready-for-agent` | `rd_issue_triage_106_20260712` | `triage-transition-106-20260712` | [ifr_triage_2b661c2e8360](https://github.com/jununfly/ZAgenticLoop/issues/106#issuecomment-4949612316) |

Fixed confirmation phrase used by the automatic route run:

```text
CONFIRM_TRIAGE_TRANSITION
```

Boundary note:

- This run executed through `issue-triage-transition` only.
- The created Issue Fix Requests request `roadmap-sliced-development`, but
  Roadmap-Sliced Development has not consumed these requests yet.
- Any branch/PR work for these issues must be performed by the
  `roadmap-sliced-development` consumer.

Product finding:

- `zj-loop-issue-triage-transition confirm-plan` currently does not expose a
  `createdAt` input. The first generated carrier bodies used the runner's
  default timestamp; the comments were edited in place to match the actual run
  timestamp. This should be fixed in the deterministic CLI so future automatic
  route runs do not need post-generation correction.

## Allowed Observations

`issue-backlog-triage` may record these observation kinds only:

- `missing-info-observation`
- `possible-duplicate-observation`
- `label-suggestion-observation`
- `human-attention-candidate`
- `issue-backlog-summary`

## Boundary

`issue-backlog-triage` is report-only in this repository. It may record issue
or discussion backlog observations and recommended triage transition evidence,
but it must not write public issue comments, mutate labels, assign issues, set
milestones, close or reopen issues, perform formal lifecycle transitions,
batch-mutate an issue tracker, create Issue Fix Requests, or start consumer
work.

Issue side effects are separated into dedicated consumers:

- `issue-triage-transition` consumes fixed confirmed transition requests. For
  `ready-for-agent`, it creates or dedupes an Issue Fix Request comment on the
  source issue after maintainer/collaborator confirmation with the exact
  `/zj-loop confirm-triage-transition <request-id>` command and fixed
  `CONFIRM_TRIAGE_TRANSITION` phrase.
- `issue-triage-action` handles narrowly allowlisted labels or fixed comment
  templates and remains dry-run. It must not perform live issue mutation until
  the Route Table explicitly promotes it.

Independent Issue Fix Request issues are narrow exceptions for missing source
issues, cross-repository permission limits, source issues unsuitable for
automation evidence, or explicit human-requested isolation.

## Verification Evidence

Current replay and contract coverage:

- Issue backlog triage replay:
  `scripts/issue-backlog-triage-e2e-replay.test.mjs`
- Report-only dispatcher replay:
  `scripts/report-only-route-dispatcher.test.mjs`
- Issue triage transition runner tests:
  `tools/zj-loop-core/test/issue-triage-transition-runner.test.mjs`
- Issue triage action runner replay:
  `scripts/issue-triage-action-runner.test.mjs`

Useful verification commands:

```bash
npm run test:issue-backlog-triage
npm run test:issue-triage-transition-e2e
npm run test:route-decision
bash scripts/ci-validate-gates.sh
git diff --check
```

## Historical Evidence Index

Resolved dogfood details are preserved in durable docs instead of this runtime
state file:

- `docs/designs/dogfood-reference-case.md`
- `docs/designs/route-consumer-execution-architecture.md`
- `docs/designs/route-table-architecture.md`
- `docs/designs/triage-architecture.md`
- `docs/designs/user-project-execution-ready-bundle.md`

Historical findings already absorbed:

- Source issue Issue Fix Request comments replaced independent carrier issues
  as the default when a source issue exists.
- Marker-based dedupe is required for Issue Fix Request comments.
- GitHub Actions issue comment/write steps require `GH_TOKEN`.
- Successful roadmap consumption needs explicit post-merge closeout planning so
  source issues, carrier comments, and branches do not remain ambiguous.
