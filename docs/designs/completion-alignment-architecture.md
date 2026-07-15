# Completion Alignment Architecture

## Status

Target architecture. This document defines the completion criteria for the
automation-first product goal; it does not claim that every required matrix
cell is currently complete. Current execution capability remains the Route
Table and its derived release capability ledger.

## Purpose

ZAgenticLoop treats architecture readiness and user experience readiness as
paired completion criteria. Neither can compensate for a failure in the other.
This document makes that rule executable across GitHub, GitLab, and the
Codex-centered Workspace Adapter path.

The related product direction is [Value-Oriented Product Design
Principles](../prds/value-oriented-product-design-principles.md). The broad
principle belongs in [ZAgenticLoop Architecture](./architecture.md), while
[Route Consumer Execution Architecture](./route-consumer-execution-architecture.md)
defines current execution capability boundaries.

## Completion Model

Completion is evaluated at three distinct layers:

| Layer | Meaning |
| --- | --- |
| Route completion | One route on one adapter reaches its declared reviewable completion artifact or a structured hard stop with replayable evidence. |
| Installation completion | A user project has installed, configured, and verified an applicable route in its own environment. |
| Product/release completion | Every required cell in the declared completion target has passed its gates on a controlled reference installation. |

A release cannot infer installation completion for arbitrary user projects.
Reference installations prove that the package can be installed and run;
`zj-loop-doctor --completion` proves the truth of an individual user project.

## Architecture Integrity

Architecture Integrity is a cross-cutting hard gate for every applicable cell:

- one protocol vocabulary and one explicit truth boundary across routes,
  adapters, and Harness surfaces
- a sufficiently small model with no duplicate carriers, state machines, or
  sources of current truth introduced for local convenience
- deterministic rules implemented as core APIs, CLIs, or gates rather than
  runtime Agent guesses
- reusable shared abstractions, with provider-specific adapters retained where
  sharing would obscure platform semantics
- low-cost, replayable runtime evidence for input, decision, execution
  boundary, verification result, and stop reason

The default check is automatic. A change triggers
`architecture_review_required` only when it adds a cross-route concept, a
second store for equivalent state, a shared protocol field, or an adapter.
Normal route and runner work proceeds after deterministic checks pass.

## Completion Alignment Ledger

The ledger is a derived, non-compensatory view. It is not a hand-maintained
scorecard. A cell is complete only when all applicable fields pass:

| Field | Required truth |
| --- | --- |
| `applicability` | `applicable` or `not-applicable-with-reason`; the latter carries an explicit semantic reason. |
| `requirement` | `required` for an applicable cell in this target. |
| `architecture_integrity` | The Architecture Integrity hard gate passes. |
| `live_capability` | Compatible live success evidence reaches the route's declared reviewable completion artifact. |
| `stop_recovery` | A real blocked path records a structured hard stop and resume/recovery evidence. |
| `experience_continuity` | The protocol and dogfood experience gates pass. |
| `automatic_progression` | Eligible transitions advance automatically from the declared signal initiation point. |
| `verification` | Deterministic gates and evidence indexes identify the current truth. |

The fixed cell statuses are:

- `complete`: every applicable hard gate passes.
- `incomplete`: the cell is required but implementation or evidence is missing.
- `blocked`: an external prerequisite is missing; owner, evidence, and resume
  action are required.
- `stale`: a compatible-success claim was invalidated by a relevant change.
- `unsupported`: an applicable required adapter cell does not yet have the
  implementation or capability evidence it needs.
- `not-applicable-with-reason`: the route's semantic object does not exist on
  the adapter.

`not-applicable-with-reason` does not block product completion, but it must be
validated by the Architecture Integrity gate. No other non-complete status can
be averaged away.

## Experience And Automation Gates

Experience continuity has two independent gates:

1. The deterministic protocol gate requires machine-readable next action,
   location, required phrase when applicable, side effects, evidence, and a
   resume anchor. Ordinary natural language must not trigger side effects.
2. The dogfood gate requires zero ambiguous next steps and zero unstructured
   human handoffs. Each human handoff must name a real risk, authority, cost,
   verification, or review boundary.

`automatic_progression` records actor and reason for each state transition.
After an explicit signal is accepted, eligible transitions continue without a
human. A human can supply the initial goal and can act at an explicit boundary;
they must not be required to stitch together routine next commands.

Every cell declares one `signal_initiation_mode`:

| Mode | Meaning |
| --- | --- |
| `event-driven` | A provider event or deterministic local event starts the route. |
| `scheduled` | A scheduled scan starts the route. |
| `explicit-on-demand` | A human or Codex submits one valid protocol input, then the route continues automatically. |

Manual workflow dispatch proves only `explicit-on-demand`; it does not prove an
event-driven or scheduled claim.

Every persisted orchestration carries a derived
`zj-loop.automatic_progression_trace.v1`. Its ordered transitions record the
fixed dispatcher or consumer-adapter actor, deterministic reason, and review
artifact evidence when one exists. The trace terminates at `review_artifact`,
`hard_stop`, `planned`, `resume`, or `duplicate`; it does not create a second
runtime state machine. This gives `automatic_progression` a replayable proof
that an accepted signal advanced through Route Decision and preflight instead
of relying on narrative logs.

### Machine-Readable Human Handoff

Every dispatcher hard stop emits `zj-loop.human_handoff.v1` beside its stop
signal. The fixed fields are `confirmation_location`, `required_phrase`,
`side_effects`, `why_required`, `resume_command`, and `retry_policy`. This is
the sole handoff contract that Codex Harness and deterministic automation
should consume; prose `next_steps` remains display guidance only.

The contract distinguishes a remediation stop from a confirmation boundary.
For example, a missing provider credential sets
`confirmation_location: not-required` and `required_phrase: null`: it needs a
configuration repair, not a human approval. A disabled side-effect route sets
the explicit terminal-command confirmation location, fixed enable phrase, and
declared side-effect scope. Both forms include the canonical orchestration-id
resume command so routine recovery does not require reconstructing the signal.

Malformed Harness inputs follow the same rule. The normalizer fills only
declared low-risk defaults, never authority or a side-effect boundary. When
repair is needed it emits a `protocol_repair_request` with the fixed
`protocol-input` location, `confirmation_required: false`, and a structured
`resume_loop` action keyed by its repair envelope; a prose command hint is not
the automation contract.

## Evidence Rules

Evidence has four distinct roles:

| Type | Proves | Enough for live capability alone? |
| --- | --- | --- |
| `contract-test` | Schema and deterministic invariants | No |
| `replay` | Reproducibility of a prior input | No |
| `adapter-dogfood` | A real end-to-end run on the adapter | Yes |
| `recovery-dogfood` | Correct stop and resume behavior on a real blocked path | Only with adapter-dogfood |

Evidence freshness is compatibility-based, not a calendar TTL. A change to a
route, runner, adapter, workflow/template, protocol, or verification gate
invalidates affected success evidence. An unrelated change does not. Time may
prompt a health warning, but it cannot alone discard a compatible capability
claim.

Workspace Adapter dogfood must run in a real Git workspace and produce a
branch, patch, or changed-file review artifact with real verification logs and
local closeout/resume records. JSON fixtures and simulated CLI output are only
contract/replay evidence.

## Adapter Matrix

The Workspace Adapter is the sole primary implementation for the
Codex-centered no-provider path. It is not a fake GitHub/GitLab provider:
`provider: none` remains correct. It uses explicit Harness input, local
activation records, `zj-loop/` runtime state, Git branches or patches, local
evidence, and local closeout records.

Local Markdown Tracker conventions may be used by skills as optional backlog
integration, but they do not own runtime truth and are not a provider
replacement.

| Route family | GitHub | GitLab | Workspace Adapter |
| --- | --- | --- | --- |
| Control, manual smoke, and Daily Triage | required | required | required |
| Issue Backlog Triage, Triage Action, and Triage Transition | required | required | not-applicable-with-reason: no issue tracker semantic object |
| PR Steward report and fix request | required | required | not-applicable-with-reason: no PR/MR semantic object |
| CI Sweeper | required | required | required: local gate or command-failure signal |
| Dependency Sweeper | required | required | required: local dependency signal and branch/patch review |
| Changelog Drafter | required | required | required: local Git history and draft evidence |
| Roadmap-Sliced Development | required | required | required: local activation and branch/patch |
| Post-merge or local closeout | required | required | required: local closeout record |

The adapter-specific carrier surface differs, but the shared sequence remains:

```text
Signal -> Route Decision -> Carrier -> Consumer -> Verification
-> Reviewable Completion Artifact or Structured Hard Stop -> Closeout / Resume
```

`reviewable completion artifact` is intentionally broader than a PR or patch.
Report, control, and cleanup routes complete with their declared evidence form;
action and draft routes require their corresponding branch, patch, PR/MR, draft
evidence, or escalation form.

## Truth Ownership And Gates

The Route Table owns current route capability. Its `metadata.completion_target`
declares the stable target identity, while each route row's
`completion_target.adapters` declares the target scope for that route. Target
scope and current route rows are different kinds of truth, not competing
ledgers. `provider_support` remains limited to external providers; Workspace is
an adapter id in `completion_target.adapters`, while Harness envelopes continue
to use `provider: none`.

The Route Table metadata carries a stable id and schema version. Each route row
carries adapter-specific target fields beside, not inside, `provider_support`:

```yaml
metadata:
  completion_target:
    id: automation-first-product
    schema_version: 1
routes:
  - route_id: issue-backlog-triage
    completion_target:
      adapters:
        github:
          applicability: applicable
          requirement: required
          signal_initiation_mode: scheduled
        workspace:
          applicability: not-applicable-with-reason
          not_applicable_reason: no-issue-tracker-semantic-object
```

The derived ledger includes the target id, a content digest of the target, and
the Route Table digest. Release evidence records those same values so a later
target change cannot silently reinterpret an earlier completion claim.

The core derives the ledger through `buildCompletionAlignmentLedger(...)`.
`zj-loop-doctor --completion --format json|text` exposes the read-only result
for users and automation. Release and CI gates consume the same core result;
the final ledger is never manually edited.

The fixed machine output schema is
`zj-loop.completion-alignment-ledger.v1`. It contains `target` ids and digests,
a status summary, and one cell per route and adapter. Every non-complete cell
contains per-gate status, evidence references, and structured `next_actions`.
The text renderer groups cells into completed, automatically actionable,
externally blocked, and architecture-review-required work; it is not consumed
by automation.

`zj-loop-doctor --completion` exits successfully after producing a valid
ledger, even when a project is incomplete. `--require-complete` returns
non-zero whenever a required cell is not complete, for CI and release gates.
Invalid input, an unreadable Route Table, or an invalid ledger are command
errors in either mode.

## Initial Dogfood Baseline

The first repository baseline was derived on 2026-07-14 from the dogfood Route
Table with:

```bash
zj-loop-doctor --root . --completion --format json
```

It declared 15 routes and 45 adapter cells. The derived summary was:

| Status | Cells | Meaning |
| --- | ---: | --- |
| `complete` | 0 | No route can yet claim end-to-end completion. |
| `incomplete` | 2 | GitHub CI Sweeper and GitHub Roadmap-Sliced Development have live capability evidence, but lack the remaining completion gates. |
| `unsupported` | 38 | The required adapter route lacks compatible live capability evidence. |
| `not-applicable-with-reason` | 5 | Workspace excludes the three issue-tracker routes and two PR/MR routes because those semantic objects do not exist locally. |
| `blocked` / `stale` | 0 | These are evidence lifecycle states, not initial capability claims. |

The baseline is a historical observation, not an additional source of truth.
`zj-loop-doctor --completion` must be rerun after relevant route, adapter,
workflow, protocol, or gate changes. The next step classifies whether recorded
evidence is compatible, stale, or absent; until then this baseline only
identifies the capability and evidence gaps that must be closed.

### Initial Evidence Classification

At the initial baseline, no existing evidence record carries the target digest,
Route Table digest, adapter identity, gate versions, and outcome needed to
prove compatibility. Therefore the conservative classification is:

| Classification | Initial count | Treatment |
| --- | ---: | --- |
| Compatible completion evidence | 0 | No release or completion claim may rely on it. |
| Stale completion evidence | 0 | Staleness cannot be derived until the invalidation map exists. |
| Missing compatible completion evidence | 40 applicable cells | Includes the two GitHub cells with historical live links: the links establish a useful lead, but not a compatibility-proof record. |

Existing `provider_support.evidence` and `recent_success_evidence` remain
route facts and investigation leads. They are not silently promoted into
completion evidence. The deterministic compatibility record, invalidation map,
and stale derivation belong to the later evidence lifecycle gate; until then a
missing compatibility record fails closed.

The lifecycle is fixed:

- relevant PRs emit a completion ledger delta; Architecture Integrity violations
  and regression of a completed cell fail immediately
- relevant route, runner, adapter, workflow/template, protocol, or gate changes
  mark affected evidence `stale` and require a rerun or an explicit rerun plan
- a release candidate fails when any required cell is `incomplete`, `blocked`,
  `stale`, or `unsupported`

Docs and release notes must never claim a higher execution mode, maturity, or
adapter support level than the current derived ledger and Route Table evidence
prove.
