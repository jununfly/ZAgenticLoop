# Route Table Architecture

This document defines the global Route Table design for ZAgenticLoop. It is a
durable architecture reference for maintainers and advanced users who need to
understand how signals move from discovery into the correct loop without making
Daily Triage the central executor.

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

Minimum fields:

| Field | Purpose |
| --- | --- |
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
| `requested_action` | `report`, `dispatch`, `activate`, `comment`, or `ignore`. |
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

## Route Table Shape

A Route Table row describes a rule, not a job implementation.

Recommended fields:

| Field | Meaning |
| --- | --- |
| `route_id` | Stable route id. |
| `producer_scope` | Which producers may emit candidates for this route. |
| `match` | Deterministic or human-readable match condition. |
| `guards` | Risk, permission, branch, budget, and evidence gates. |
| `request_kind` | `activation-comment`, `workflow-dispatch`, `evidence-request`, or `report-only`. |
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

## First Route Set

| Route | Request kind | Consumer | First behavior |
| --- | --- | --- | --- |
| `ci-sweeper` | `workflow-dispatch` or `evidence-request` | CI Sweeper | Diagnose CI failure, propose verifier-backed minimal fix, escalate on infra or high risk. |
| `issue-triage` | `evidence-request` | Issue Triage | Summarize issue backlog changes and propose labels; no formal lifecycle transition in L1. |
| `pr-steward` | `evidence-request` | PR Steward | Watch PRs, review comments, CI state, rebase needs, and readiness. |
| `dependency-sweeper` | `evidence-request` or `workflow-dispatch` | Dependency Sweeper | Handle patch/minor dependency signals with verifier-backed boundaries. |
| `changelog-drafter` | `workflow-dispatch` or `evidence-request` | Changelog Drafter | Draft release-note candidates; never publish. |
| `roadmap-sliced-development` | `activation-comment` | Roadmap-Sliced Development | Create or consume authorized activation requests only; implementation stays with roadmap lifecycle. |
| `human` | `report-only` | Maintainer | Security, auth, billing, infra, ambiguous, high-risk, or policy decisions. |
| `ignore` | `report-only` | Producing loop | Record noise with reason and avoid rediscovery. |

`evidence-request` means "append a request/status record to the
consumer-owned evidence location declared by the route." It does not mean the
Route Table owns or mutates triage state, and it must not turn
`zj-loop/STATE.md` or `zj-loop/issue-triage-state.md` into an activation queue.

## Dispatcher Boundary

The Dispatcher may:

- validate that a route is allowlisted
- apply guards and permission checks
- create an activation or dispatch request
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

## Request Lifecycle

```text
candidate
  -> pending
  -> consumed
  -> closed

candidate
  -> denied

candidate
  -> duplicate

pending
  -> failed
```

Rules:

- Duplicate requests append a new audit record that references the existing
  request id.
- A failed request is terminal for that request.
- Retrying a failed request requires a new request.
- Once a request is consumed, execution failures are resumed inside the owning
  consumer lifecycle.
- Request lifecycle records are append-only unless the route declares a
  consumer-owned mutable state file as its evidence target.

## Loop Prevention

Every automated route must define:

- `dedupe_key`
- `source_run_id`
- `parent_request_id` when a consumer emits follow-up signals
- `attempt_count`
- `dedupe_window`
- daily or per-route budget cap
- terminal request `failed` status
- human gate for repeated failures

Daily Triage and other producers should report existing request lifecycle
evidence/status instead of creating another request when a matching pending,
consumed, failed, duplicate, denied, or ambiguous request already exists.

## Example Route Decisions

CI failure:

```yaml
signal_id: ci:validate-patterns:28765215864
source: ci
subject: validate-patterns.yml run 28765215864
priority: P1
state: none
route: ci-sweeper
risk: medium
confidence: high
evidence:
  - https://github.com/jununfly/ZAgenticLoop/actions/runs/28765215864
producer: daily-triage
dedupe_key: ci:validate-patterns:main
requested_action: dispatch
target_consumer: ci-sweeper
status: candidate
created_at: 2026-07-06T00:00:00Z
```

Plan intake:

```yaml
signal_id: issue:12:plan-intake
source: issue
subject: "#12"
priority: P2
state: ready-for-agent
route: roadmap-sliced-development
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
