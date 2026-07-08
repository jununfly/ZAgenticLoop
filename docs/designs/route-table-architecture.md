# Route Table Architecture

This document defines the global Route Table design for ZAgenticLoop. It is a
durable architecture reference for maintainers and advanced users who need to
understand how signals move from discovery into the correct loop without making
Daily Triage the central executor.

Route Table routing semantics and request carriers are defined here. Consumer
execution readiness, maturity, capabilities, side effect levels, and completion
forms are defined in
[`route-consumer-execution-architecture.md`](route-consumer-execution-architecture.md).

## Purpose

The Route Table is a routing control plane. It answers:

- Which loop should own this signal next?
- Is the signal allowed to create an activation or dispatch request?
- What evidence, risk, status, and dedupe data must be recorded?
- Which component owns execution, verification, failure recovery, and triage
  state/evidence boundaries?

The Route Table does not execute implementation work. It creates or recommends
bounded requests for allowlisted consumers.

## Placement

Route Table belongs above individual triage patterns:

```text
Signal producers
  -> Route Table
  -> Route Decision
  -> Dispatcher
  -> Request carrier
  -> Consumer-owned workflow
```

Signal producers may include:

- Daily Triage
- Issue Triage
- CI events
- PR events
- dependency alerts
- release events
- maintainer slash commands
- human/operator input

Daily Triage is therefore one producer, not the owner of the Route Table.

## Signal Terminology

Use `Signal` as an abstract slot in generic protocol templates. Do not turn a
planning-related input into a capitalized protocol term unless it has a concrete
producer and contract.

Canonical activation chains should name the concrete producer:

```text
Issue Slash Command -> Route Decision -> Activation Request -> Roadmap-Sliced Development -> Roadmap Branch/PR
Daily Triage Candidate -> Route Decision -> Activation Request -> Roadmap-Sliced Development -> Roadmap Branch/PR
```

The abstract fix-request template remains valid:

```text
Signal -> Route Decision -> Issue Fix Request -> Fix Consumer -> Fix PR
```

The retired uppercase planning-signal phrase is intentionally forbidden across
the repository. Use explanatory natural language such as `plan-like signals` or
`planning-related input` only outside canonical chains.

Durable architecture lives here. Project-specific routing policy lives in
`zj-loop/zj-loop-route-table.yaml`, which `zj-loop-init` should scaffold by
default. The file is part of the loop control plane, alongside
`zj-loop/zj-loop-safety.md`, `zj-loop/zj-loop-budget.md`, and
`zj-loop/zj-loop-run-log.md`.

`zj-loop/zj-loop-route-table.yaml` is a policy file, not a runtime queue. It
defines allowlisted routes, guards, request kinds, lifecycle evidence targets,
and failure owners. Runtime lifecycle evidence belongs in append-only issue/PR
comments, consumer-owned state files, workflow runs, or PRs.

## Route Decision Contract

A Route Decision is the replayable record between an observed signal and any
activation or dispatch request.

Route Decision evidence must be persisted somewhere reviewable, such as an
Issue/PR comment, workflow summary, or deterministic replay fixture. It must not
exist only as a temporary function return value.

Minimum fields:

| Field | Purpose |
| --- | --- |
| `schema` | Contract id, currently `zj-loop.route_decision.v1`. |
| `decision_id` | Stable id for this routing decision. |
| `signal_id` | Stable id for the observed signal. |
| `source` | Origin such as `ci`, `issue`, `pr`, `dependency`, `release`, `chat`, or `human`. |
| `subject` | Issue number, PR number, workflow run, package, commit, or concise title. |
| `priority` | Importance axis, such as `P0`, `P1`, `P2`, `P3`, or `unknown`. |
| `state` | Triage lifecycle state, using the same independent `state` axis as Triage Architecture, such as `needs-triage`, `ready-for-agent`, `ready-for-human`, `duplicate`, or `none`. |
| `route` | Proposed route id, such as `ci-sweeper` or `human`. |
| `risk` | `low`, `medium`, `high`, or `unknown`. |
| `confidence` | `low`, `medium`, or `high`. |
| `evidence` | Reviewable links or concise evidence. |
| `producer` | Component that emitted the decision candidate. |
| `dedupe_key` | Stable key used to detect repeats. |
| `request_branch` | Optional deterministic branch name for workflow-dispatch routes that will create a PR; producer and consumer should share this value to avoid branch naming drift. |
| `request_kind` | `issue-fix-request`, `activation-comment`, `workflow-dispatch`, or `report-only`. |
| `requested_action` | `report`, `create-issue-fix-request`, `activate`, `comment`, or `ignore`. |
| `target_consumer` | Owning consumer if request creation is allowed. |
| `status` | `candidate`, `pending`, `consumed`, `duplicate`, `denied`, `failed`, or `closed`. |
| `created_at` | Timestamp for audit and dedupe windows. |

`priority`, `state`, and `route` must stay separate. A high-priority signal may
still need more information; a low-priority signal may still be ready for a
bounded agent route.

The `state` field represents triage state for the observed signal or issue.
`status` is about this route decision or request. Do not use triage state to
represent activation progress, and do not store activation lifecycle in
`zj-loop/STATE.md` or
`zj-loop/issue-triage-state.md`; plan activation lifecycle is derived from
append-only structured GitHub issue comments.

### Contract Construction Helpers

Shared Route Decision helper code may normalize only low-level construction
concerns such as stable ids, evidence arrays, route match diagnostics,
false-by-default side-effect flags, duplicate evidence metadata, and report
evidence base fields.

Shared helpers must not own route lifecycle decisions. In particular, they must
not introduce a global `statusForDecision`, generic `dispatchRouteDecision()`,
runtime queue, worker, consumer runner, or mega dispatcher. Request-kind
specific lifecycle remains with the route-specific dispatcher or replay file.

Route-specific replay files are durable protocol evidence and must remain
readable independently. They may reuse shared construction helpers, but they
must continue to document the concrete chain semantics for report-only routes,
Issue Fix Requests, activation comments, claims, and post-merge closeout.

Names that look similar are not automatically shared semantics. For example,
`issue-triage-report` keeps route matching local because it deliberately ignores
`signal_kind` during route matching and validates signal kind through a separate
allowlist and forbidden-field contract.

## Request Kinds

Request kinds are intentionally separate. A Route Table can govern all of them,
but their consumers and lifecycle contracts are not interchangeable.

| Request kind | Meaning |
| --- | --- |
| `issue-fix-request` | Creates or appends a semantic Issue Fix Request that may lead to a Fix PR. Only Fix Consumer protocol applies. |
| `activation-comment` | Creates an append-only activation request, such as Roadmap-Sliced Development. It must not be treated as a fix request. |
| `workflow-dispatch` | Direct workflow dispatch for narrowly scoped automation. Prefer pairing it with durable request evidence when it can create PRs. |
| `report-only` | Records or recommends an action without creating a side-effecting request. |

## Issue Fix Request Contract

The canonical fix chain is:

```text
Signal -> Route Decision -> Issue Fix Request -> Fix Consumer -> Fix PR
```

An Issue Fix Request is a semantic object. GitHub or GitLab issues are only
carriers. If no suitable issue tracker item exists, create an independent issue
with a title shaped like:

```text
[Issue Fix Request] <route_id>: <short summary>
```

If a suitable issue tracker item already exists, append a structured request
comment to that item instead of creating another issue.

The structured request comment is versioned and machine-parseable. Current
scripts use `<!-- zj-loop:issue-fix-request ... -->` with JSON payloads. The
hard required fields are:

| Field | Purpose |
| --- | --- |
| `schema` | Must be `zj-loop.issue_fix_request.v1`. |
| `request_id` | Stable request id. |
| `status` | One of `requested`, `duplicate`, `denied`, `consumed`, `pr_opened`, `failed`, `completed`. |
| `created_at` | Creation timestamp. |
| `source_signal` | Signal id, source, summary, and evidence URL. |
| `route_decision` | Embedded or linked replayable Route Decision. |
| `dedupe_key` | Stable duplicate suppression key. |
| `requested_consumer` | Target Fix Consumer and capability. |
| `fix_scope` | Repo, files/areas, and non-goals. |
| `acceptance_criteria` | Observable success criteria. |
| `verification_gate` | Commands or checks required before PR confidence. |
| `failure_policy` | Must require retry via a new request. |
| `lifecycle` | PR link, consumer, close/failure evidence. |

Active duplicate suppression applies to `requested`, `consumed`, and
`pr_opened`. `failed`, `completed`, and `denied` do not block a new request, but
the new request must use a new `request_id` and may reference
`parent_request_id`.

## Route Table Shape

A Route Table row describes a rule, not a job implementation.

Recommended fields:

| Field | Meaning |
| --- | --- |
| `route_id` | Stable route id. |
| `producer_scope` | Which producers may emit candidates for this route. |
| `match` | Deterministic or human-readable match condition. |
| `guards` | Risk, permission, branch, budget, and evidence gates. |
| `request_kind` | `issue-fix-request`, `activation-comment`, `workflow-dispatch`, or `report-only`. |
| `consumer` | Owning pattern, workflow, or skill. |
| `evidence_store` | Where request lifecycle evidence/status is recorded; this must point to an allowed evidence target, not a central queue. |
| `dedupe_window` | Time or lifecycle window for duplicate suppression. |
| `failure_owner` | Component responsible for recovery after request creation. |
| `human_gate` | Conditions that require human review. |

## Default Scaffold Contract

`zj-loop-init` should generate `zj-loop/zj-loop-route-table.yaml` by default
for every pattern starter.

Default generation does not mean every route is active. A starter may include
only routes that are relevant to the selected pattern, plus common safe routes
such as `human` and `ignore`. Routes that require side effects should stay
disabled or report-only until the project explicitly enables their dispatcher.

The default file should:

- explain that it is routing policy, not a work queue
- include `human` and `ignore` routes
- enable only `human`, `ignore`, and the selected pattern's own report-only
  route by default
- include cross-component dispatch routes as `enabled: false` unless a starter
  explicitly supports that route
- keep side-effect routes disabled or report-only until the project explicitly
  enables the relevant dispatcher
- declare where request lifecycle evidence/status is recorded
- require dedupe keys and human gates for automated dispatch routes

Default route enablement:

| Route kind | Default |
| --- | --- |
| `human` | `enabled: true` |
| `ignore` | `enabled: true` |
| Selected pattern's report-only route | `enabled: true` |
| Cross-component dispatch routes | `enabled: false` |
| Side-effect routes | `enabled: false` or `request_kind: report-only` |

Manual starter copies should not maintain starter-specific route table copies.
They should add the canonical route table with `zj-loop-init . --add
route-table`, which renders the shared template with the default Daily Triage
context. Existing route tables are skipped by default; `--force` performs a real
overwrite and must make that overwrite visible in CLI output.

## Workflow-Dispatch Bundle

`zj-loop-init . --add github-actions` installs the generated GitHub Actions
bundle for user projects. The bundle is portable workflow wiring, not hidden
business logic:

- generated workflows are named `zj-loop-*.yml`
- workflow files include generated metadata and a template hash
- workflow package references are pinned
- workflows call published `@jununfly/zj-loop-*` commands for deterministic
  Route Decision behavior
- workflows do not reinterpret Route Table semantics locally

The default runnable path is `manual-smoke-report`. It is report-only and writes
Route Decision evidence to the workflow summary. Side-effecting consumers remain
controlled by `zj-loop/zj-loop-route-table.yaml` and should be enabled with
`zj-loop-route enable <consumer> --confirm "<fixed phrase>"`.

`zj-loop-init . --upgrade github-actions` is the upgrade path for official
generated workflows. If a generated workflow was modified, upgrade renames the
old file with a `.bak` suffix and writes the new canonical workflow at the
original path. The `.bak` file is a basic overwrite-protection mechanism, not a
promise to migrate arbitrary local workflow customizations.

`zj-loop-audit` treats invalid generated workflow metadata, missing Route Table
for generated workflows, a disabled/non-report manual smoke route, and unpinned
core package references as workflow health failures.

## First Route Set

| Route | Request kind | Consumer | First behavior |
| --- | --- | --- | --- |
| `ci-sweeper` | `issue-fix-request` | CI Sweeper | Diagnose CI failure, propose verifier-backed minimal fix, escalate on infra or high risk. |
| `issue-triage-report` | `report-only` | Issue Triage | Record issue/discussion triage observations in `zj-loop/issue-triage-state.md`; no formal lifecycle transition, public comment, label mutation, assignment, milestone, close/reopen, or batch mutation. |
| `pr-steward-report` / `pr-steward-fix-request` | `report-only` / `issue-fix-request` | PR Steward | Watch PR events as report evidence, create/dedupe independent failed-check Issue Fix Requests, and allow claim-only lifecycle evidence; source PR comments, labels, rebase, merge, repair, branches, and Fix PRs require later explicit routes. |
| `dependency-sweeper` | `issue-fix-request` | Dependency Sweeper | Create verifier-backed dependency requests and allow claim-only lifecycle evidence for patch/minor dependency signals; a replayed runner can produce repair PR or escalation evidence after claim, but the dogfood route is not live until workflow-dispatch evidence exists. |
| `changelog-drafter-report` / `changelog-drafter-draft-request` | `report-only` | Changelog Drafter | Record release-window evidence, then record draft request candidate evidence from an existing report; never draft, edit changelogs, create PRs, tag, release, publish, or dispatch workflows inside Route Decision. |
| `roadmap-sliced-development` | `activation-comment` | Roadmap-Sliced Development | Create or consume authorized activation requests only; implementation stays with roadmap lifecycle. |
| `post-merge-roadmap-closeout` | `report-only` | Post-Merge Cleanup | Validate merged Roadmap-Sliced PR closeout contracts and plan guarded cleanup; live branch deletion and carrier issue closure require explicit operator invocation. |
| `human` | `report-only` | Maintainer | Security, auth, billing, infra, ambiguous, high-risk, or policy decisions. |
| `ignore` | `report-only` | Producing loop | Record noise with reason and avoid rediscovery. |

`issue-fix-request` means "create or append a structured request/status record
that may lead to a Fix PR." It does not mean the Route Table owns or mutates
triage state, and it must not turn `zj-loop/STATE.md` or
`zj-loop/issue-triage-state.md` into a request queue.

`issue-triage-report` is intentionally report-only. Its fixed
`signal_kind` values are:

- `missing-info-observation`
- `possible-duplicate-observation`
- `label-suggestion-observation`
- `human-attention-candidate`
- `issue-backlog-summary`

Its fixed Route Decision statuses are `recorded`, `already-recorded`,
`rejected`, and `routed-to-human-review`. `already-recorded` means the same
report evidence already exists; it is not an issue duplicate action.
`possible-duplicate-observation` is only an observation type. Unsupported
signal kinds and protocol fields that imply issue lifecycle, label mutation,
public comments, assignment, milestones, close/reopen, or duplicate actions
must fail closed.

## Dispatcher Boundary

The Dispatcher may:

- validate that a route is allowlisted
- apply guards and permission checks
- create an activation or dispatch request
- create or append an Issue Fix Request
- append an audit record to an allowed evidence target, such as an issue/PR
  comment, workflow dispatch record, or consumer-owned state/evidence entry
- mark a request duplicate, denied, failed, or consumed

The Dispatcher must not:

- implement fixes
- create roadmap process artifacts
- close issues
- apply formal issue lifecycle transitions
- merge PRs
- retry a failed consumer workflow automatically

Consumers own their own execution, verification, state files, and recovery
rules. For example, Roadmap-Sliced Development consumes an explicit activation
request and then resumes within its own roadmap lifecycle. CI Sweeper records
attempts and failures in CI Sweeper-owned evidence/state, not in Daily Triage
state.

### Explicit Non-Goals

The Route Decision layer must not grow into a general automation executor by
accident. These actions require explicit future routes or consumer-owned
execution contracts:

- tag-triggered or release-triggered Changelog Drafter automation
- automatic changelog PRs
- package publishing
- auto-merge for any consumer
- broad workflow-dispatch routes without durable request evidence
- formal issue lifecycle transitions from Daily Triage
- replacing route-specific replay files with one opaque mega-dispatcher

## Request Lifecycle

```text
candidate
  -> requested
  -> consumed
  -> pr_opened
  -> completed

candidate
  -> denied

candidate
  -> duplicate

requested
  -> failed
```

Rules:

- Duplicate requests append a new audit record that references the existing
  request id.
- A failed request is terminal for that request.
- Retrying a failed request requires a new request.
- `failed` is terminal for that request; retry requires a new request.
- Once a request is consumed, execution failures are recorded inside the owning
  consumer lifecycle and surfaced as request lifecycle evidence.
- Request lifecycle records are append-only unless the route declares a
  consumer-owned mutable state file as its evidence target.

For `activation-comment` routes, consumed requests are not duplicates and not
new work. If another slash command references an already consumed
Roadmap-Sliced Development activation, the dispatcher records audit-only
`resume-existing` evidence and points back to the consumed request's resume
anchors. It must not create a second activation request. Failed activation
requests are terminal and may be followed by a new activation request. Consumed
requests with missing resume anchors fail closed as `resume-blocked` until the
activation evidence is repaired.

## Loop Prevention

Every automated route must define:

- `dedupe_key`
- `source_run_id`
- deterministic generated branch naming when the route can create repair PRs
- `parent_request_id` when a consumer emits follow-up signals
- `attempt_count`
- `dedupe_window`
- daily or per-route budget cap
- terminal request `failed` status
- human gate for repeated failures

Daily Triage and other producers should report existing request lifecycle
evidence/status instead of creating another request when a matching pending,
consumed, failed, duplicate, denied, or ambiguous request already exists.
Generated repair branches should be denied as producer inputs when they match
the consumer's own branch namespace, such as `automated/ci-sweeper-*`, so a
consumer-created repair PR cannot recursively dispatch the same consumer.

For CI Sweeper specifically, existing lifecycle evidence is classified before
dispatch in this priority order:

1. `existing_repair_pr`
2. `existing_issue_fix_request`
3. `existing_escalation_issue`
4. `none`

The first matching lifecycle wins. Any existing lifecycle suppresses new Issue
Fix Request creation and CI Sweeper dispatch for that source run. An open
escalation issue for the same `source_run_id` is treated as terminal evidence
for that run; Daily Triage reports `existing_escalation_issue` and does not
update or spam the escalation issue. Retry requires a new source run or a new
request, not automatic re-dispatch of the same failed run.

Stale CI source runs are hard-denied before request creation. A stale run means
the candidate `source_run_id` is no longer the latest failing run for the
workflow being routed. The denial records `stale-source-run` evidence and does
not create an Issue Fix Request, dispatch CI Sweeper, or trigger a Human Gate.

Generated CI Sweeper repair branches remain regenerated outputs, not long-lived
collaboration branches. When the same generated branch name is reused, the
consumer should regenerate from current `main` and push with `--force-with-lease`
instead of rebasing stale generated commits.

## Example Route Decisions

CI failure:

```yaml
schema: zj-loop.route_decision.v1
decision_id: rd_28765215864
signal_id: ci:validate-patterns:28765215864
source: ci
subject: validate-patterns.yml run 28765215864
priority: P1
state: none
route: ci-sweeper
route_id: ci-sweeper
request_kind: issue-fix-request
risk: medium
confidence: high
evidence:
  - https://github.com/jununfly/ZAgenticLoop/actions/runs/28765215864
producer: daily-triage
dedupe_key: ci:validate-patterns:main
requested_action: create-issue-fix-request
target_consumer: ci-sweeper
status: requested
created_at: 2026-07-06T00:00:00Z
```

Plan intake:

```yaml
schema: zj-loop.route_decision.v1
decision_id: rd_issue_12_plan_intake
signal_id: issue:12:plan-intake
source: issue
subject: "#12"
priority: P2
state: ready-for-agent
route: roadmap-sliced-development
route_id: roadmap-sliced-development
request_kind: activation-comment
risk: medium
confidence: high
evidence:
  - https://github.com/org/repo/issues/12
producer: issue-triage
dedupe_key: issue:12:roadmap-sliced-development
requested_action: activate
target_consumer: roadmap-sliced-development
status: candidate
created_at: 2026-07-06T00:00:00Z
```

High-risk signal:

```yaml
signal_id: issue:21:auth-regression
source: issue
subject: "#21"
priority: P0
state: ready-for-human
route: human
risk: high
confidence: medium
evidence:
  - "Touches auth/session behavior"
producer: issue-triage
dedupe_key: issue:21:human
requested_action: report
target_consumer: maintainer
status: candidate
created_at: 2026-07-06T00:00:00Z
```

Issue triage report:

```yaml
schema: zj-loop.route_decision.v1
decision_id: rd_issue_triage_17fb8b9ea4db
signal_id: issue:123:missing-info
source: issue
subject: issue-123
priority: P2
route: issue-triage-report
route_id: issue-triage-report
request_kind: report-only
risk: medium
confidence: high
evidence:
  - https://github.com/jununfly/ZAgenticLoop/issues/123
producer: issue-triage
dedupe_key: issue-triage:jununfly/ZAgenticLoop:open-issues:last-24h:missing-info-observation:issue-123
requested_action: record-issue-triage-report
target_consumer: issue-triage
status: recorded
public_action_allowed: false
label_mutation_allowed: false
human_route_required: false
created_at: 2026-07-07T00:00:00Z
```

## Replay And Review

For design work, questions and recommended answers should be recorded in the
process roadmap decisions. The durable architecture keeps the settled rules.

For runtime work, each Route Decision and request lifecycle transition should
be reconstructable from:

- the source signal
- the Route Decision fields
- the Route Table row that matched
- the appended activation/dispatch/status record
- the consumer-owned state/evidence or PR/issue/workflow evidence

This makes routing reviewable without turning triage state into a hidden queue.

## Evolution Path

1. Keep the Route Table as documentation while the route set is still changing.
2. Add golden examples for candidate, dispatch, activation, duplicate, denied,
   failed, and human routes.
3. Extract deterministic match, guard, and dedupe checks into a small script
   only after the examples stabilize.
4. Add workflow dispatch only for routes with clear consumers, budgets, and
   failure owners.
5. Keep high-risk and ambiguous cases report-only until a maintainer explicitly
   changes the route policy.
