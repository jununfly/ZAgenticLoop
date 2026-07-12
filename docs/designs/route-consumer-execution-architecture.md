# Route Consumer Execution Architecture

This document is the durable architecture reference for Route consumer
execution in ZAgenticLoop. It defines how a Route consumer moves from report
evidence to bounded execution without letting protocol evidence masquerade as
live capability.

`docs/designs/route-table-architecture.md` defines the routing control plane.
This document defines execution readiness and completion boundaries for the
consumers behind those routes.

## Goal

Every action-capable Route consumer should eventually execute to its own
bounded completion form, while report-only consumers remain visibly report-only.
The system must make partial readiness obvious:

- a route can be enabled without being live
- a protocol can be replayed without having a runner
- a request can be claimable without starting repair
- a live runner must carry recent successful evidence

## Control Surfaces

`zj-loop/zj-loop-route-table.yaml` is the project-specific source of truth for
execution state. It owns:

- route enablement
- consumer kind
- execution mode
- side effect level
- protocol and runner maturity
- light consumer capabilities
- recent evidence pointers

`patterns/registry.yaml` does not carry execution state. It remains a product
catalog for pattern discovery and capability declaration.

## Consumer Kinds

Consumer kind is mandatory because it constrains what a route is allowed to do.

| Kind | Role | Allowed completion boundary |
| --- | --- | --- |
| `producer-router` | Produces route evidence or dispatch candidates. | Report evidence only. |
| `report-consumer` | Records observations without starting work. | Report evidence only. |
| `human-gate` | Hands high or unknown risk to a human. | Human decision evidence. |
| `fix-runner` | Consumes Issue Fix Requests. | Repair PR or escalation issue. |
| `draft-consumer` | Produces reviewable drafts. | Draft PR, draft evidence, or escalation issue. |
| `cleanup-consumer` | Performs narrow post-merge cleanup. | Cleanup done, cleanup skipped, or escalation issue. |
| `activation-consumer` | Consumes activation requests and bootstraps a bounded roadmap lifecycle. | Roadmap branch/PR, activation failed, or activation resumable. |
| `triage-action-consumer` | Performs bounded issue triage side effects. | Triage label applied, triage comment posted, action skipped, or escalation issue. |

Daily Triage is a producer/router. It may update operational memory and create
or dispatch bounded requests through allowlisted routes, but it must not repair
code, bump dependencies, draft releases, mutate issues directly, or implement
roadmap slices.

Issue Backlog Triage routes remain report-only. Bounded side effects belong to
the separate `issue-triage-action` consumer and require their own Route Table
row, allowlist, runner evidence, and live promotion.

## Execution Modes

`execution.mode` is a fixed enum:

| Mode | Meaning |
| --- | --- |
| `report-only` | Records evidence or recommendations. No request consumption or work execution. |
| `request-only` | May create a durable request carrier, but does not claim or execute it. |
| `claim-only` | May consume a matching request and record claim evidence, but does not perform the work. |
| `dry-run` | Computes and records an execution plan without destructive or final side effects. |
| `live` | Performs bounded side effects permitted by consumer kind, capabilities, and route guards. |

`zj-loop-route enable` only makes a route visible and eligible for dispatch
consideration. It does not authorize live side effects.

Consumer plans should expose dispatch and execution readiness separately:

- `dispatch_allowed` answers whether Route Decision matched and may hand the
  signal to the route's consumer boundary.
- `execution_allowed` answers whether the consumer is currently allowed to run
  bounded side effects.
- Legacy `allowed` may remain as a compatibility field, but new evidence should
  avoid using one boolean to mean both dispatch and execution.

Report-only routes may be dispatch-allowed while execution remains false.
Blocked action routes should still point to their primary dry-run JSON artifact
so users can inspect why execution did not continue.

`zj-loop-route status --json` exposes the same split under
`automation_model`:

- `automation_model.readiness` contains the route readiness level and the
  derived `install_ready`, `execution_ready`, and `user_project_ready` booleans.
- `automation_model.authorization` contains `route_enabled`,
  `dispatch_allowed`, `execution_allowed`, any required fixed confirmation
  phrase, and blocked reasons.

This is intentionally redundant with the legacy top-level readiness booleans so
agents and scripts can consume one object without treating `enabled` as
execution permission.

Runner maturity promotion is deterministic and separate from route enablement:

```bash
zj-loop-route promote <route-or-consumer> --runner install-ready
zj-loop-route promote <route-or-consumer> --runner execution-ready --confirm "promote <consumer> runner to execution-ready"
```

Promotion updates `maturity.runner`; it does not enable the route and does not
run the consumer. Route enablement still uses `zj-loop-route enable`, and
side-effecting routes still require their own fixed confirmation phrase.

## Side Effect Levels

`execution.side_effect_level` is a fixed enum:

```text
none
evidence
request
claim
issue-comment
label
branch
pr
draft-pr
cleanup
```

The level is the maximum side effect expected from the route's current
execution mode. It is not a permission to ignore route guards or consumer kind
boundaries.

## Maturity

Maturity is split because protocol readiness and runner readiness are different
things.

```yaml
maturity:
  protocol: missing | designed | replayed | dogfooded | install-ready | execution-ready
  runner: missing | designed | replayed | dogfooded | install-ready | execution-ready
```

Examples:

- A route may have `protocol: replayed` and `runner: missing` when request,
  claim, or report evidence exists but no runner performs the work.
- A dogfooded runner may still be scoped narrowly, such as CI Sweeper repairing
  validate/audit generated artifacts only.
- An `install-ready` runner can be generated into user projects with Route
  Table rows, workflows, package commands, and plan/report evidence.
- An `execution-ready` runner must process real signals into durable request
  carriers and bounded consumer outcomes through generated bundle paths and
  published package APIs, not repository-local scripts.

Live execution requires:

- `maturity.runner` is `execution-ready`
- recent successful evidence is linked in the Route Table or durable docs
- route kind, capabilities, request verifier requirements, and side effect
  level are compatible

## Capabilities

Consumer capabilities live in the Route Table as light contract fields:

```yaml
capabilities:
  scopes: ["ci", "validate-patterns"]
  verifiers: ["ci-validate-gates", "ci-audit-gates", "diff-check"]
  max_side_effect_level: "pr"
```

If a consumer grows too complex, it may link to an optional external manifest,
but the Route Table remains the first place to check execution truth.

Automatic claim eligibility must be deterministic. A consumer may claim a
request only when all of these match:

- route-level allowlist
- request schema and active status
- request-level verifier requirements
- consumer capabilities
- consumer kind and max side effect level
- source scope and evidence completeness

Matching failure must produce report or escalation evidence, not a claim.

## Completion Forms

Do not collapse all consumer outcomes into "fix". Each action-capable consumer
has its own completion form.

| Kind | Completion forms |
| --- | --- |
| `fix-runner` | `repair-pr`, `escalation-issue` |
| `draft-consumer` | `draft-pr`, `draft-evidence`, `escalation-issue` |
| `cleanup-consumer` | `cleanup-done`, `cleanup-skipped`, `escalation-issue` |
| `activation-consumer` | `roadmap-branch-pr`, `activation-failed`, `activation-resumable` |

No consumer may auto-merge to `main`. Human review remains the merge boundary.

## Live Runner Evidence

Live runners keep their route-specific lifecycle contracts. Issue Fix Requests,
activation comments, and post-merge contracts are not interchangeable and must
not be hidden behind a generic queue.

The shared layer is only a small evidence envelope for completed runner work.
`scripts/live-runner-contract.mjs` validates:

- `schema: zj-loop.live_runner_evidence.v1`
- runner and route identity
- consumer kind and execution mode
- kind-specific completion form
- source request/signal identity
- verifier evidence
- side effect level and actions
- dedupe key

This envelope is for live-runner evidence, not for deciding whether a route
should run. Route-specific dispatchers still own matching, dedupe, lifecycle
state, retry policy, and escalation behavior.

## Hard Gates

The terminal architecture is complete only when these gates are enforceable:

1. Route Table rows declare `enabled`, `consumer_kind`, `execution`,
   `maturity`, and `capabilities`.
2. Live execution requires `execution-ready` runner evidence. Dogfood evidence
   may support promotion, but is not itself a user-project execution claim.
3. Request and claim paths pass schema, allowlist, capability, verifier, active
   status, and evidence checks.
4. Consumers generate replayable evidence for success, skip, failure, or
   escalation.
5. Consumer kind constrains side effects. Producer/report routes must not
   perform worker side effects.
6. Failures write back to a carrier, workflow summary, state file, or
   escalation issue; silent failure is invalid.
7. Repair and draft consumers stop at PR or draft PR boundaries. Cleanup
   consumers may only perform narrow contract-backed cleanup.
8. Generated user-project bundles use published deterministic scripts or APIs,
   not repository-local dogfood scripts.

For a route to claim `user-project-ready`, replay evidence is necessary but no
longer sufficient. The route must also have route-owned live evidence:

- local replay passes against the real Route Table
- a live `workflow_dispatch` run succeeds on the generated or dogfood workflow
- the successful run leaves replayable GitHub issue, PR, comment, or artifact
  evidence
- dedupe evidence proves the route did not create duplicate side effects
- at least one live failure path is recorded and either fixed by a PR or
  explicitly waived with a durable reason

This gate was added after the 2026-07-09 `issue-backlog-triage` dogfood run:
local replay passed, but live workflow execution exposed a comment-dedupe bug
and a missing `GH_TOKEN` configuration before the source issue request carrier
successfully landed on #7.

## Current Dogfood Map

The dogfood Route Table is the operational truth. Current dogfood capability:

| Consumer | Kind | Execution mode | Runner maturity | Notes |
| --- | --- | --- | --- | --- |
| Daily Triage | `producer-router` | `report-only` | `missing` | Producer and report surface, not a worker. |
| Issue Triage | `report-consumer` | `report-only` | `missing` | Side effects belong to the separate dry-run `issue-triage-action` route. |
| Issue Triage Transition | `triage-action-consumer` | `request-only` | `replayed` plus live workflow-dispatch evidence | Separate confirmed-transition route for fixed request ids, fixed confirmation phrase, and `ready-for-agent` source issue Issue Fix Request comments; E2E replay proves `issue-backlog-triage -> issue-triage-transition -> source issue request carrier`; live dogfood on #7 proved workflow-dispatch execution, marker-based dedupe, and source issue request comment creation; refuses source issue tracker label/state mutation until promotion. |
| Issue Triage Action | `triage-action-consumer` | `dry-run` | `replayed` | Separate action-capable route for narrowly allowlisted labels and fixed comment templates; refuses live mutation until dogfood evidence exists. |
| PR Steward report | `report-consumer` | `report-only` | `missing` | Records PR event evidence only. |
| PR Steward fix request | `fix-runner` | `claim-only` | `replayed` | Can consume matching request evidence and replay independent repair PR or escalation evidence; GitLab MR requests use MR provider vocabulary in dry-run evidence, while live GitLab review side effects are explicitly refused until workflow-dispatch dogfood evidence exists. |
| CI Sweeper | `fix-runner` | `live` | `dogfooded` | Narrow deterministic validate/audit repair or escalation. |
| Dependency Sweeper | `fix-runner` | `claim-only` | `replayed` | Request/claim evidence plus replayed repair PR or escalation runner; not live until workflow-dispatch dogfood evidence exists. |
| Changelog Drafter | `draft-consumer` | `report-only` | `replayed` | Report/draft-request evidence plus replayed draft evidence or draft PR runner; not live until workflow-dispatch dogfood evidence exists. |
| Roadmap-Sliced Development | `activation-consumer` | `request-only` generated bundle, live dogfood bootstrap | `install-ready` generated bundle, dogfooded reference path | Activation bootstrap has deterministic request/contract evidence; slice execution remains bounded by roadmap gates. |
| Post-Merge Cleanup | `cleanup-consumer` | `dry-run` | `replayed` | Automatic dry-run; live cleanup remains guarded by contract and confirmation. |

`docs/designs/dogfood-reference-case.md` keeps the current dogfood overview and
may include operational links. This document owns the architecture vocabulary.

## Release Boundary

Do not publish a release that claims complete Route consumer execution until
both layers are complete:

1. Execution contract foundation: Route Table fields, status/audit visibility,
   deterministic capability checks, generated template defaults, and durable
   docs.
2. Consumer runner completion: every action-capable consumer either executes to
   its bounded completion form with evidence, or is explicitly marked as not yet
   runner-ready and not live.

The generated-bundle release gate is `npm run
test:generated-bundle-release-gate`. It checks workflow/template drift, generated
workflow `@jununfly/zj-loop-core` package pins, Route Table route existence, and
the rule that action-capable generated routes must be `install-ready` or
`execution-ready` while remaining disabled by default until the user explicitly
enables them. It also runs the deterministic Roadmap Activation user-project
fixture, which validates issue-comment activation, Activation Request carrier
creation, Route Decision, branch/PR contract evidence, duplicate handling,
permission denial, disabled route denial, and loop marker detection without live
GitHub writes.

Provider parity is checked by `npm run test:provider-parity-gate`. The GitLab
dogfood replay in that gate proves GitLab CI Sweeper fix scope, Roadmap
Activation MR contract handoff into Post-Merge Closeout, and PR Steward MR
dry-run/refusal boundaries against the current packaged core contract.

GitLab Roadmap Activation has a narrow live execution path. It can consume a
GitLab `contract-plan.json` into `execution-result.json`, refuse missing-token
or non-`zjal-*` branch cases with structured evidence, and create/update a draft
MR when live mode, token, project path, and Route Table guards are present.
Other GitLab MR-producing consumers remain refused until their own runner
evidence is promoted.

The first user-project execution-ready bundle is documented in
[User Project Execution-Ready Bundle](./user-project-execution-ready-bundle.md).
It currently centers on `roadmap-sliced-development`, `ci-sweeper`, and
`post-merge-roadmap-closeout`, with side-effect routes disabled by default and
fixed confirmation phrases for live boundaries.

Milestone commits and PRs are allowed before both layers complete, but product
copy must not imply that all consumers are live.
