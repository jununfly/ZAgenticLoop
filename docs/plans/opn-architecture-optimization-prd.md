# OPN Architecture Optimization PRD

Status: future candidate; temporarily staged for later roadmap planning.

This document captures architecture improvements inspired by a generic
multi-agent collaboration architecture. It is not a commitment to expand the
current roadmap and does not change the locked OPN responsibility model.

## Problem Statement

ZAgenticLoop already has the core OPN model: Human or Human+Agent is the center
responsibility unit, Agent1/Agent2/Agent3 are provider-neutral execution nodes,
Graph Engineering composes work, Loop Engineering closes bounded execution,
and Human retains final responsibility.

The current architecture can become easier to understand and extend by making
several layers more explicit:

- responsibility and coordination;
- graph planning and routing;
- provider execution;
- protocol and StateStore facts;
- Evidence and independent verification;
- Human acceptance and revision;
- Runtime, tools, and governance support.

Without this clarification, future implementations may accidentally make an
Agent-only Manager the authority, treat StateStore as private shared memory,
confuse provider completion with verified success, or add feedback loops that
are visible in the UI but are not represented by durable lifecycle facts.

## Solution

Introduce a future architecture-optimization version that presents OPN as a
layered, evidence-driven collaboration network:

```text
Human Goal and Constraints
  -> Center Responsibility Unit
  -> Directed Graph Planning and Preflight
  -> OPN Routing / Transport / StateStore
  -> Agent Execution Nodes
  -> Evidence and Independent Verification
  -> Review Handoff
  -> Human Acceptance / Revision / Rejection
  -> Loop Feedback and bounded re-execution
```

The design should improve composability and explainability without changing
the following invariants:

1. Human or Human+Agent remains the center responsibility unit.
2. Agent1, Agent2, Agent3, and concrete provider adapters are execution nodes.
3. StateStore and ArtifactStore are network-level logical resources.
4. Execution, verification, and Human acceptance remain separate facts.
5. Unknown authority, isolation, risk, cost, validation, or provider outcome
   stops the path and returns an explainable result to Human.
6. The product checks the center's resource-isolation decision but does not
   implement a universal lock manager for Git, filesystems, or external
   resources.

## User Stories

1. As a Human center, I want to see my goal, constraints, and responsibility
   boundary separated from Agent execution, so that I know who is accountable
   for the result.
2. As a Human center, I want to use a Human+Agent coordination unit without
   turning the assisting Agent into the final authority, so that automation
   improves my leverage without changing responsibility.
3. As a Human center, I want to describe a DirectedTaskGraph with explicit
   dependencies, so that parallel and sequential work are understandable.
4. As a Human center, I want the system to preflight capabilities, grants,
   resource scopes, isolation, cost, and risk before dispatch, so that unsafe
   assumptions stop before side effects.
5. As a Human center, I want Agent capabilities to be discoverable and
   provider-neutral, so that Agent1 and Agent2 can be replaced without
   redesigning the OPN protocol.
6. As a Human center, I want routing to consider capability, approval, scope,
   availability, and expiry, so that a task is sent only to an eligible node.
7. As an enrolled Agent node, I want to receive a bounded task contract with
   its inputs, outputs, authority, expiry, and evidence requirements, so that I
   can execute without inferring ungranted authority.
8. As a Human center, I want StateStore facts, projections, and large Evidence
   artifacts to be visibly distinct, so that operational state is not confused
   with the complete result report.
9. As a Human center, I want cross-device messages to carry identity, event,
   task, delivery, and Evidence references, so that collaboration is
   traceable across devices and providers.
10. As a Human center, I want retries and replay to be idempotent and bounded,
    so that reconnects do not duplicate work or fabricate completion.
11. As an Agent node, I want to report provider completion separately from
    task success, so that the system does not treat a process exit as proof of
    correctness.
12. As a Human center, I want independent verification to inspect the result
    against the task contract and scope, so that an executing Agent cannot
    self-certify an invalid result.
13. As a Human center, I want a Review Handoff containing the complete evidence
    package and risk summary, so that final acceptance is based on inspectable
    facts rather than a status label.
14. As a Human, I want to accept, reject, request revision, or choose recovery
    explicitly, so that the final decision remains mine.
15. As a Human center, I want every blocked or uncertain state to explain what
    happened, why it stopped, which layer owns the decision, and what can
    resume it, so that failures are actionable.
16. As a Human center, I want feedback from execution, verification, and review
    to become a bounded new plan revision, so that Loop Engineering can iterate
    without mutating historical facts.
17. As a Human center, I want to see which Agent, device, runtime, and tool
    produced each Evidence item, so that cross-device collaboration remains
    auditable.
18. As a Human center, I want the architecture to distinguish network
    membership, event participation, task claim, and authority grant, so that
    joining an OPN network does not imply unrestricted trust.
19. As a provider adapter author, I want Runtime, tool access, protocol, graph
    coordination, and governance seams to be separate, so that a provider can
    evolve without changing lifecycle or authority contracts.
20. As a Human center, I want to compare a future Multi-node Graph Atom with
    the Single-Agent OPN Atom baseline, so that architecture improvements are
    measured by Human capability leverage rather than Agent activity.
21. As an operator, I want the system to expose the current graph, node status,
    Evidence, and recovery path in one inspectable view, so that I can operate
    the network without reconstructing it from logs.
22. As a Human center, I want external workflow frameworks to remain optional
    extensions behind adapters, so that adopting a framework does not redefine
    the OPN protocol.

## Implementation Decisions

- Introduce a clear logical separation between the Center Responsibility Unit,
  Graph Coordinator, OPN Routing/Transport, Agent Execution Nodes, Evidence and
  Verification, and Human Acceptance.
- Treat the Graph Coordinator as an execution-graph and lifecycle component;
  it may coordinate but cannot create Human acceptance or expand authority.
- Keep `Agent1`, `Agent2`, and `Agent3` as provider-neutral protocol roles.
  Codex, WorkBuddy, and other concrete products remain adapter instances.
- Model Agent registration, enrollment, event participation, capability grant,
  and task claim as separate contracts and transitions.
- Extend routing inputs to include capability, identity, device, approval,
  scope, expiry, availability, cost, and provider health.
- Keep StateStore as a network-level resource for append-only lifecycle facts,
  CAS updates, delivery state, leases, and projections. It is not an
  unbounded memory owned by the center or by an Agent.
- Keep ArtifactStore as the content-addressed home for complete Evidence and
  large outputs. StateStore stores references and lightweight facts.
- Standardize an OPN envelope that can carry event identity, task identity,
  graph revision, sender/receiver identity, authority references, delivery
  metadata, Evidence references, and replay/dedupe information.
- Preserve at-least-once delivery with receiver-side dedupe, bounded retry,
  out-of-order tolerance, reconnect, and deterministic replay. Do not promise
  exactly-once execution or global ordering.
- Represent provider completion, task outcome, verification, review handoff,
  Human acceptance, revision, rejection, blocked, and outcome-uncertain as
  distinct lifecycle facts.
- Make Independent Verification a separate adapter boundary. Verification can
  block or recommend revision but cannot issue final Human acceptance.
- Make Review Handoff a canonical package binding task, execution, attempt,
  plan revision, scope, Evidence references, verifier result, and risk summary.
- Make feedback produce a new plan revision or recovery attempt. Historical
  facts and accepted decisions are append-only and are not overwritten.
- Keep resource isolation as a required orchestration decision and preflight
  proof. The product validates the plan but does not become a generic lock
  manager for target repositories, filesystems, or external systems.
- Organize implementation seams around existing contracts: orchestration
  preflight, graph coordination, provider adapters, transport delivery,
  StateStore, ArtifactStore, Evidence aggregation, verification, and Human
  acceptance.
- Add an operational inspection surface that reads projections and Evidence;
  it must not directly start Agents, mutate StateStore, or bypass Core gates.
- Treat LangGraph, AutoGen, CrewAI, LlamaIndex Workflows, and similar systems
  as future extensions behind provider-neutral adapters, not core dependencies.

## Testing Decisions

- Test observable contracts and lifecycle outcomes rather than private helper
  implementation details.
- Add conformance tests that prove an Agent-only center is rejected and a Human
  or Human+Agent center is accepted with explicit responsibility binding.
- Add graph tests for sequential dependencies, parallel fan-out, aggregation,
  verification, revision, rejection, blocked, and outcome-uncertain paths.
- Add routing tests for capability mismatch, unapproved node, expired grant,
  unavailable node, provider drift, cost/risk rejection, and deterministic
  selection.
- Add transport tests for identity binding, envelope integrity, at-least-once
  retry, dedupe, out-of-order delivery, reconnect, replay, and CAS conflicts.
- Add StateStore/ArtifactStore tests proving fact/reference separation,
  append-only history, content-addressed Evidence, and no side effects on
  rejected transitions.
- Add verification tests proving provider completion cannot create successful
  Evidence without scope observation and independent verification.
- Add Human acceptance tests proving the decision is signature- and
  Review-Handoff-bound, idempotent on replay, and unable to be generated by an
  Agent adapter.
- Add resource-isolation tests using the existing orchestration preflight seam;
  do not implement or test a universal filesystem or Git lock in Core.
- Add operational projection tests proving the inspection surface is read-only
  and cannot bypass lifecycle gates.
- Use existing OPN Graph Atom enrollment, real-adapter wiring, Evidence Set,
  transport replay, Human acceptance, and StateStore conformance tests as prior
  art. Extend them at the highest existing seam before introducing new seams.
- Add one real dogfood scenario after contract conformance: a Human+Agent
  center coordinates Agent nodes on two devices, receives Evidence, and makes
  the final decision. Keep this separate from loopback fixtures.

## Out of Scope

- Replacing Human responsibility with an autonomous Manager Agent.
- Giving a center node automatic ownership of StateStore, ArtifactStore, or
  other network resources.
- Implementing a universal lock or concurrency manager for Git, filesystems,
  databases, or arbitrary external resources.
- Building a new general-purpose Agent reasoning engine.
- Making LangGraph, AutoGen, CrewAI, LlamaIndex Workflows, Codex, or WorkBuddy
  mandatory dependencies.
- Fine-grained endpoint network policy and enterprise governance hardening.
- Exactly-once distributed execution or global message ordering.
- Write-enabled multi-device development jobs; those require a separately
  approved milestone with explicit workspace isolation and Human merge review.
- Treating this PRD as completion of the current cross-device validation
  milestone or as permission to expand the active roadmap.

## Further Notes

This is an architecture-optimization candidate for after the current real-use
validation work has produced enough dogfood evidence. The generic diagram that
inspired it is useful because it makes coordination, workers, communication,
shared state, and feedback visible. The OPN adaptation is deliberately stricter
about responsibility, authority, evidence, and Human acceptance.

The intended progression remains:

```text
Single-Agent OPN Atom
  -> Multi-node Graph Atom
  -> Cross-device Graph Atom
  -> Architecture optimization and operational clarity
  -> Larger ScaleUp / ScaleOut compositions
```

Scale is allowed only after the smaller composition remains complete and
correct under recursion, iteration, recovery, and independent verification.
