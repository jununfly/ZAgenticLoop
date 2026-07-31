# OPN Graph Engineering Milestone 1-4 Closeout

Status: closed on 2026-07-31.

## Outcome

Milestone 1-4 proves the smallest useful Graph Engineering composition on top
of the Single-Agent OPN Atom baseline:

```text
Human / Human+Agent center
  -> DirectedTaskGraph + Preflight
  -> Agent1 Execution
  -> Agent2 Execution
  -> Relay Evidence references
  -> Aggregation
  -> independent Verification
  -> Semantic Review
  -> accepted Review Handoff
  -> Graph Evidence Set
```

The implementation is provider-neutral and uses abstract `Agent1` and
`Agent2` roles. Codex and Workbuddy remain examples of concrete agents, not
protocol-defined role names.

## Implemented Boundary

- Human or Human+Agent is the center responsibility unit.
- `OrchestrationPlan` and `DirectedTaskGraph` are versioned, digest-bound
  contracts.
- Enrollment, capability grants, task claims, dispatch intent, and runtime
  revalidation are separate facts.
- Resource isolation is declared and checked during orchestration preflight;
  ZAgenticLoop does not implement a universal filesystem or Git lock manager.
- SQLite StateStore and content-addressed ArtifactStore provide the reference
  network-level storage split.
- Dispatch Gate is pure and fail-closed for unknown capability, stale intent,
  scope drift, grant drift, missing approval, missing review, and self-review.
- Native OPN Tracer records two independent execution stages and their
  evidence digests.
- Relay transports references and digests only; it does not transport full
  evidence, secrets, private keys, or become canonical truth.
- Aggregation is persisted before independent Verification.
- Semantic Review consumes persisted Aggregation, Verification, and accepted
  Review Handoff without creating a competing fact source.
- Evidence Set is a deterministic, replayable report over the complete Graph
  scope and records Relay convergence diagnostics.

## Verification Evidence

The reference implementation is covered by the core package regression:

```text
384 tests passed
0 failed
0 skipped
git diff --check passed
roadmap validate passed
```

The focused contracts include dispatch gate, semantic review, Native OPN
Tracer execution/relay/aggregation/verification, conformance, and Evidence
Set tests. All report objects declare `side_effects_executed=false`.

## Explicit Non-goals

- No real Codex or Workbuddy process is started by the Native OPN Tracer
  fixture.
- No P2P discovery, cross-device production transport, or device fleet
  management is claimed.
- No universal locking or conflict resolution is implemented for target Git
  repositories, filesystems, or external resources.
- No external workflow framework is a core dependency.
- No provider write is implied by a passed protocol fixture.
- Human remains responsible for ethical, legal, business, and final outcome
  decisions.

## Residual Risks and Technical Debt

- The reference Relay is loopback-only and needs an explicit transport and
  discovery adapter before cross-device use.
- Evidence retention, authorization, export, and operational inspection need
  production policies.
- The Web UI does not yet expose the complete Graph, Evidence Set, or recovery
  path as a single user workflow.
- Concrete Agent adapters need capability negotiation, session lifecycle,
  failure reporting, and provider uncertainty handling.
- Existing repository legacy product designs, implementations, and project
  files still need a separate cleanup pass; this closeout does not silently
  delete historical material.

## Next-Milestone Candidate Map

Priority order for a future roadmap, subject to a fresh Human decision:

1. **Graph Atom Web UI**: make the closed loop inspectable and operable by a
   Human without reading protocol JSON.
2. **Cross-device OPN transport**: add pairing, discovery, transport security,
   reconnect, and bounded delivery behind the provider-neutral contracts.
3. **Concrete Agent adapters**: connect Agent1/Agent2 to real execution
   providers while preserving center responsibility and evidence boundaries.
4. **Operational Evidence**: retention, export, replay, audit views, and
   failure/recovery inspection.

These candidates are deliberately not added to the frozen 1-4 roadmap.
