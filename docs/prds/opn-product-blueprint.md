# OPN Product Blueprint

Status: baseline locked on 2026-07-31.

## Product Thesis

ZAgenticLoop uses Graph Engineering to organize a Human-responsible OPN and
Loop Engineering to let each orchestrated node complete a verifiable,
recoverable goal loop.

Graph composes. Loop closes the work. Human retains final responsibility.

OPN means One Person Network: a personal production network made of a Human,
Agent1, Agent2, devices, and external services. Agent names in this document
are placeholders. Codex and Workbuddy are examples of concrete agents on one
current Mac, not protocol-defined roles.

## Responsibility Model

The center responsibility unit is `Human` or `Human + Agent`. It owns the
goal, constraints, authorization, task decomposition, resource-isolation
decision, recovery path, and final decision.

`Agent1`, `Agent2`, and other enrolled agents are orchestrated execution
nodes. One agent may assist the center and execute a task, but the two logical
roles must be explicit. An agent cannot expand authority, self-approve a risky
result, or become the final accountable center.

Every `MessageEvent` has one final responsibility center. Other Humans,
agents, devices, and services may be authorized collaborators, executors,
verifiers, or resource providers.

## Canonical Object Chain

```text
Human Goal
  -> MessageEvent
  -> DirectedTaskGraph
  -> Task
  -> Agent Execution
  -> Evidence
  -> Review Handoff
  -> Human Decision
```

`DirectedTaskGraph` is the versioned plan. Events are immutable facts.
`StateStore` holds lightweight facts and projections. `ArtifactStore` holds
complete evidence and large objects. The current graph is derived from the
plan, facts, and projection; history is never overwritten.

## Loop and Graph

Loop Engineering answers: how does one bounded goal pass through discovery,
execution, verification, correction, delivery, or an explainable stop?

Graph Engineering answers: which nodes participate, what each node may do,
how tasks depend on one another, how resources are isolated, how evidence is
aggregated, and who is responsible for recovery?

Graph does not replace Loop. Every executable Task enters a bounded Loop
Execution. Graph is the composition layer; Loop is the execution closure.

## Product Atoms

### Loop Atom

The protocol minimum: a goal, bounded work, verification, evidence, and a
stop or decision path.

### Single-Agent OPN Atom

The product baseline: Human delegates one valuable, bounded MessageEvent to
one independently enrolled Agent. The Agent works independently inside its
grant and returns Evidence plus a Review Handoff. Human accepts, revises,
recovers, rejects, or stops.

### Multi-node Graph Atom

The first Graph proof must add real composability, not only another agent. It
requires a Human-held center responsibility unit, Agent1 and Agent2, two
dependent tasks, a DirectedTaskGraph, explicit resource isolation,
intermediate evidence, canonical aggregation or verification, and one Review
Handoff.

## Network Modes

| Mode | Meaning | Responsibility boundary |
| --- | --- | --- |
| A | Single-Agent OPN Atom | Human or Human+Agent centers one bounded execution. |
| B | Human-owned temporary subnet | Human or Human+Agent coordinates Agent1, Agent2, and other enrolled nodes. |
| C | Node joins another temporary subnet | The external center coordinates the event; the original Human retains responsibility for its node and grants. |

Network membership never implies event participation, resource ownership, or
unbounded trust. A node may participate in multiple networks. Each event has
one responsibility context and scoped, expiring, revocable grants.

## Runtime Invariants

- Authorization is monotonic: delegation cannot expand scope, validity, or risk authority.
- Unknown isolation, permission, risk, cost, validation, identity, or provider outcomes stop the path and return to Human.
- External side effects require the `dispatched` gate.
- An execution result is not a verified result, and a verified result is not Human acceptance.
- Review-required work needs independent Verification and an accepted Review Handoff.
- Provider uncertainty becomes `provider-outcome-uncertain`; blind retry is forbidden.
- Unrequested side effects must be zero.

## Value Model

The product measures Human capability leverage, not agent activity. The
baseline comparison is `Single-Agent OPN Atom`, not a scientific Human-only
benchmark.

Useful measures include Human elapsed coordination time, intervention count
and reason, independently completed work, verification pass rate, rework,
handoff quality, recovery explainability, and unauthorized side effects.

## Automation Experience

The default experience is automatic progression when the work is safe,
bounded, authorized, affordable, and verifiable. The expected path is:

```text
signal
  -> route
  -> request carrier
  -> bounded execution
  -> verification
  -> review artifact or structured hard stop
```

Manual confirmation is reserved for genuinely risky, ambiguous, destructive,
costly, or policy-sensitive boundaries. A route being enabled does not by
itself authorize live side effects; capability, credentials, workspace safety,
budget, verification, and stop observability must all be proven.

Every stop must tell Human what happened, why it stopped, which layer owns the
decision, where the evidence is, what can resume it, and whether a new request
is required. A natural-language hint is not a side-effect authorization.

Completion alignment is a product invariant: architecture readiness and user
experience readiness must advance together. A deterministic protocol without a
clear review path is incomplete, and a friendly UI that claims capability the
Route Table or evidence cannot prove is also incomplete.

## Product Boundary

ZAgenticLoop owns the OPN protocol, identity, capability and authority
contracts, MessageEvent and DirectedTaskGraph, orchestration gates, evidence,
review handoff, network-level storage contracts, idempotency, recovery, stop
semantics, and auditability.

It does not implement agent reasoning, replace Git or a filesystem's own
concurrency mechanisms, or assume Human's legal, ethical, business, or final
result responsibility. Resource isolation is a center-of-responsibility
decision checked during orchestration; the product does not become a generic
lock manager.

The core stays provider-neutral. LangGraph, AutoGen, CrewAI, LlamaIndex
Workflows, and other runtimes are future Extensions behind adapters, not core
protocol dependencies.

## Composition Rule

Recursion removes branches while preserving a complete, correct atom.
Iteration adds state, evidence, constraints, delegation, and recovery.
ScaleUp/ScaleOut is allowed only after task contracts, grants, isolation,
idempotency, aggregation, verification, fan-out, budget, and Human recovery
have been proven composable. Otherwise the system returns to a smaller proven
composition or grills Human.
