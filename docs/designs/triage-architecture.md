# Triage Architecture

This document is the durable architecture reference for triage-related
ZAgenticLoop skills and patterns. It is for maintainers of the pattern/skill
system and advanced users who need to understand why responsibilities are split
this way. User-facing operating guidance stays in the pattern documents.

## Audience And Scope

Use this document when changing or adding triage skills, triage patterns, state
files, or side-effect rules.

This document does not replace:

- [Daily Triage](../../patterns/daily-triage.md), the user-facing pattern for
  daily attention management.
- [Issue Triage](../../patterns/issue-triage.md), the user-facing pattern for
  issue backlog maintenance.
- Individual `SKILL.md` files, which define agent behavior at a specific node.

## Layered Model

Triage artifacts are a layered pipeline, not interchangeable versions of the
same thing.

| Layer | Artifact | Owns | Does not own |
| --- | --- | --- | --- |
| Backlog health | `patterns/issue-triage.md` | Discovering, deduplicating, prioritizing, and proposing labels for issues/discussions. | Daily operational attention or formal issue lifecycle transitions. |
| Daily attention | `patterns/daily-triage.md` | Combining CI, commits, chat, state, and issue-triage summaries into today's attention picture. | Full issue-body rescans or direct issue lifecycle decisions. |
| Signal summarization | `zj-loop-triage` | Summarizing daily signals into High Priority, Watch, Noise, and State Updates. | Applying labels, closing issues, fixing code, or inventing architecture work. |
| Plan activation | `zj-loop-activate` | Converting an authorized slash command into an auditable activation request for an allowlisted pattern. | Discovering plans, analyzing PRD content, creating branches, roadmaps, commits, or implementation work. |
| Issue decision | `zj-triage` | Moving a specific issue through a role-based state machine and producing durable handoffs. | Continuous backlog scanning or daily operational dashboards. |

The intended flow is:

```text
Issue Triage Pattern
  -> maintains zj-loop/issue-triage-state.md
  -> produces Top 5, needs-human, duplicate, and proposed-label summaries

Daily Triage Pattern
  -> consumes issue-triage summary plus CI, commits, chat, and zj-loop/STATE.md
  -> maintains zj-loop/STATE.md
  -> emits Signals for Route Dispatcher when cross-loop action may be needed

zj-loop-triage
  -> performs the Daily Triage signal summarization step

zj-loop-activate
  -> consumes explicit /zj-loop start commands
  -> writes append-only activation lifecycle comments
  -> hands off to Roadmap-Sliced Development without executing it

zj-triage
  -> handles a specific issue when a formal state decision or durable handoff is needed
```

Pattern documents own operating protocol: cadence, state files, safety levels,
cost, verification, and human handoff points. Skills own node-level behavior:
what an agent reads, how it reasons, what it outputs, and when it must stop.

Route decisions that cross pattern boundaries are governed by the
[Route Table Architecture](./route-table-architecture.md). The Route Table is a
global routing control plane: Daily Triage, Issue Triage, CI events, PR events,
dependency alerts, release events, and human commands may all produce route
candidates, but downstream execution belongs to the allowlisted consumer.
Project-level routing policy is scaffolded by default at
`zj-loop/zj-loop-route-table.yaml`; runtime lifecycle evidence stays in
append-only issue/PR comments, consumer-owned state files, workflow runs, or
PRs.

Daily Triage must not create Issue Fix Requests or activation requests directly.
It may discover a signal, summarize it, and recommend or emit a candidate route.
The Route Dispatcher reads `Signal + Route Table`, creates the replayable Route
Decision, and only then creates or appends an Issue Fix Request or activation
request. This keeps Daily Triage as a producer instead of a hidden dispatcher.

## Triage Dimensions

Triage records should keep `priority`, `state`, and `route` separate.

| Dimension | Question | Examples |
| --- | --- | --- |
| `priority` | How important is this? | `P0`, `P1`, `P2`, `P3`, `unknown` |
| `state` | What lifecycle state is this in? | `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`, `duplicate`, `none` |
| `route` | Which loop path should handle it next? | `watch`, `escalate-human`, `candidate-fix`, `link-follow-up`, `ignore` |

These axes are intentionally independent. A `P0` issue can still be
`needs-info`. A `P3` issue can be `ready-for-agent`. A CI signal may have
`state: none` but `route: candidate-fix`.

## Minimal Triage Record

`zj-loop/STATE.md` and `zj-loop/issue-triage-state.md` should remain readable
markdown, not heavyweight databases. They should still preserve enough
structure for humans and loops to audit what happened.

Recommended minimal fields:

| Field | Purpose |
| --- | --- |
| `source` | Where the signal came from, such as CI, issue, PR, commit, chat, or prior state. |
| `subject` | The issue number, PR, workflow run, commit, or concise title. |
| `priority` | Importance, using the priority axis above. |
| `state` | Lifecycle state, using the state axis above. |
| `route` | Next loop route, using the route axis above. |
| `evidence` | At least one reviewable link or concise evidence summary. |
| `last_seen` | Last time the signal was confirmed as still valid. |
| `next_action` | Proposed next step. |
| `owner` | `human`, `loop`, `agent`, or `unknown`. |

State files may add pattern-specific fields, but new fields should not collapse
priority, state, and route back into one label.

## State File Contracts

`zj-loop/issue-triage-state.md` is the backlog-health view. It should hold
issue/discussion summaries, Top 5 items, proposed labels, possible duplicates,
needs-human items, and reporter-activity signals.

`zj-loop/STATE.md` is the daily-attention view. It should hold current High
Priority items, Watch items, Noise/Ignored items, recent state updates, human
overrides, and the next action for today's loop.

Daily Triage may consume `zj-loop/issue-triage-state.md`, but it should not
duplicate full issue bodies or redo full issue scoring. It should reference
issue numbers and summarize only the signal needed for daily attention.

Plan intake activation is not stored in either triage state file. If Daily
Triage finds a GitHub issue that looks like a PRD/plan, it may report it as a
plan intake candidate and recommend `/zj-loop start roadmap-sliced-development`
when newly discovered or when activation status changes. The activation
lifecycle itself is derived from append-only structured GitHub issue comments.
Labels remain routing metadata, not activation state.

Candidate fixes follow a different lane. If Daily Triage observes CI, PR, or
dependency signals that may lead to a Fix PR, it emits a Signal for the Route
Dispatcher. The dispatcher may create an `issue-fix-request` only when the route
is allowlisted and guards pass. Fix Consumers such as CI Sweeper, PR Steward, or
Dependency Sweeper consume that request; they must not re-route the signal or
expand scope without a new request.

## Side-Effect Boundaries

Triage loops should be conservative by default.

| Level | Allowed | Not allowed |
| --- | --- | --- |
| L1 | Read external systems; update local state, reports, and proposals. | Change issue labels, post public comments, close issues, or edit source code. |
| L2 | Perform verifier-backed low-risk side effects such as allowlisted labels, suggested comments, or candidate-fix PRs. | Perform formal issue lifecycle transitions without `zj-triage` rules or human confirmation. |
| L3 | Automate more of the same bounded workflow after operational proof. | Treat high automation as permission to bypass evidence, verification, or human gates. |

Formal issue lifecycle transitions require stricter handling. Closing an issue,
marking `wontfix`, writing a `ready-for-agent` brief, or writing a
`ready-for-human` brief should follow `zj-triage` rules or require explicit
human confirmation.

Plan activation is a separate side-effect lane: `zj-loop-activate` may append
request, duplicate, denied, unsupported-pattern, or failed activation comments
when invoked by automation or a maintainer. It must not create roadmap process
artifacts or start implementation; Roadmap-Sliced Development owns consumption
and execution after an explicit issue id or request id is provided.

General cross-loop dispatch follows the same shape. A dispatcher may create an
allowlisted activation request or Issue Fix Request, but it must not perform the
consumer's work. Consumer loops own execution, verification, state, and failure
recovery. See [Route Table Architecture](./route-table-architecture.md) for the
full Route Decision contract, lifecycle, and loop-prevention rules.

## Handoff Rules

Use `zj-loop-triage` when the question is:

- What deserves attention today?
- Which signals are High Priority, Watch, or Noise?
- What should be remembered for the next daily run?

Use Issue Triage when the question is:

- What is new or changed in the issue backlog?
- Which issues are duplicates, under-specified, high priority, or needs-human?
- What labels or comments should be proposed for review?

Use `zj-triage` when the question is:

- What state should this specific issue move to?
- Is this bug reproducible enough for an agent brief?
- Should this become `needs-info`, `ready-for-agent`, `ready-for-human`, or
  `wontfix`?
- What durable handoff should be posted to the issue tracker?

Use Daily Triage when the question is:

- What should the project or team pay attention to in this operating window?
- Did the issue backlog, CI, commits, chat, or prior state create a new daily
  priority?
- Should a small candidate fix enter verifier-backed L2 handling?

Use `zj-loop-activate` when the question is:

- Did this issue comment contain a supported `/zj-loop start ...` command?
- Is the commenter authorized to create an activation request?
- Is there already a pending activation request for this issue and pattern?
- Which structured activation lifecycle comment should be appended?

Use Roadmap-Sliced Development when the question is:

- Should an explicitly provided activation request be consumed?
- What branch, roadmap file, roadmap view, and next action resume anchors should
  be recorded?
- How should the requested PRD/plan be sliced into executable roadmap nodes?

## Operational Refinement Rules

High Priority should be hard to enter. A triage item normally needs at least one
strong trigger:

- main or release validation is red
- a release is blocked
- there is a user-facing regression
- there is security, data-loss, auth, billing, infra, or public API risk
- a human explicitly asked for action
- a Watch item gained new evidence

Repeated signals should not be rediscovered forever. Triage state should record
recurrence and stale-signal facts such as `first_seen`, `last_seen`,
`recurrence_count`, and why the item changed since the last run. A stale item
should be routed to `watch`, `escalate-human`, `link-follow-up`, or `ignore`
rather than reappearing as fresh High Priority.

Reporter activity is a reusable signal. For `needs-info` issues, the important
question is whether the reporter has replied since the last triage note. If so,
the item should return to review. If not, it should not repeatedly consume
daily attention without new evidence.

Issue tracker labels are implementation-specific. Canonical ZAgenticLoop roles
such as `bug`, `enhancement`, `needs-info`, `ready-for-agent`, and
`ready-for-human` may map to different GitHub, GitLab, Linear, or Jira labels.
Any starter or project setup that enables issue triage should make that mapping
visible enough that agents do not invent labels.

`ready-for-agent` requires more than a label. Before a specific issue moves
there, the handoff should have enough evidence, scope, acceptance criteria, and
verification path for an agent to pick it up without guessing.

Examples are part of the contract. Triage pattern and skill changes should
prefer small golden examples that show a no-op run, a Watch item, a valid High
Priority item, a Noise decision, and a possible duplicate that is not closed
automatically.

## Evolution Rules

When adding a new triage skill or pattern:

1. Decide whether it is a pattern-level operating protocol or a skill-level node
   action.
2. Declare which state file it reads and writes.
3. Keep priority, state, and route separate.
4. Define its L1 behavior before any L2 side effects.
5. State which formal lifecycle transitions must defer to `zj-triage` or human
   confirmation.
6. Define how repeated, stale, and reporter-updated items are handled.
7. Add lightweight links from user-facing patterns to this document only when
   readers need the responsibility split.

This keeps triage useful as an attention-management system without letting it
silently become an unreviewed lifecycle manager.
