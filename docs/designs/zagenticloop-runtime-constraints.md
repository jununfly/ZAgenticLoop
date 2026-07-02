# ZAgenticLoop Runtime Constraints and Roadmap Safety

This design converges the product contract behind GitHub issue #1:
ZAgenticLoop worked in a real ZCodeGraph practice run, but the runtime behavior
still relied too much on conversation habit instead of explicit product rules.

Issue: https://github.com/jununfly/ZAgenticLoop/issues/1

## Goal

Make "run under ZAgenticLoop constraints" mean something operational:

- the agent continues through roadmap leaf slices until a defined stop condition
- every slice remains bounded, verifiable, and reviewable
- roadmap state stays trustworthy as the shared source of truth
- Human Gates are recognized before crossing shared-state or irreversible
  boundaries

This is product design only. It defines the contract that future CLI, skill, MCP,
or documentation changes should implement.

## Non-Goals

- Do not implement roadmap CLI locking in this slice.
- Do not register `roadmap-sliced-development-pattern` as a public pattern yet.
- Do not change repository-wide PR templates.
- Do not enable unattended merge, release, or destructive cleanup behavior.

## Feedback Summary

The ZCodeGraph practice run surfaced four gaps:

| Gap | Product problem |
| --- | --- |
| Continuous execution is implicit | The agent naturally stops after a slice unless repeatedly prompted. |
| Roadmap writes can be unsafe | Concurrent or interleaved writes can make JSON/Markdown untrustworthy. |
| Active focus can over-nest | Deep focus nodes make the current slice size unclear to human and agent. |
| Human Gate types are not explicit enough | Merge, publish, branch deletion, destructive cleanup, scope expansion, and failed verification need product-level stops. |

## Runtime Contract

When a user says "run under ZAgenticLoop constraints" or equivalent, the agent
should enter a continuous roadmap execution loop:

1. Select the current executable leaf node.
2. Confirm the leaf has a verification or decision-only gate.
3. Confirm the leaf has lightweight commit intent.
4. Execute the slice.
5. Run the declared verification gate.
6. Update roadmap status, notes, and verification evidence before commit.
7. Commit the leaf slice on the dedicated roadmap branch by default.
8. Continue to the next executable leaf.

Automatic commit is part of the default runtime contract once the roadmap is on
a dedicated git branch. The branch makes each leaf commit traceable and keeps
shared history safe. If the user explicitly says not to auto-commit each slice,
the agent should stop at the commit boundary and wait for authorization.

The loop stops only when one of these conditions occurs:

- roadmap completed
- Human Gate reached
- final or unexpected verification gate failed
- scope expansion is needed
- roadmap write safety cannot be trusted
- external blocker prevents meaningful progress
- budget, time, or context limit is reached
- user explicitly disabled automatic slice commits and the next action is a
  commit boundary

Stopping is not failure. A stop is correct when the next action requires human
judgment, shared-state mutation, or a changed roadmap boundary.

Expected-red contract tests are not stop conditions when the leaf notes or
commit intent identify them as expected. They become stop conditions only if the
leaf's final verification gate remains red.

## Roadmap Write Safety

Roadmap JSON is the source of truth. Markdown is a generated view. Product
surfaces that write roadmap state should treat writes as serialized critical
sections.

Required behavior:

- every write command obtains a per-roadmap lock
- read commands can proceed without mutating the lock
- stale locks are not cleared automatically by default
- timeout messages include lock owner, lock path, and exact unlock command
- explicit unlock requires human or operator intent
- render runs after successful substantive writes

If a write times out waiting for a lock, the agent must stop rather than
auto-unlock. A stale lock may mean another agent or process is still writing the
truth source. Unlock is allowed only when the user explicitly approves it or the
operator runs an explicit `unlock` / `--unlock-stale` action.

The safety goal is not just avoiding corrupted files. It is preserving trust in
the shared map so human and agent do not need to reconstruct state from chat.

## Active Construction Focus

Roadmaps may be deeply nested, but the active construction focus needs a depth
budget.

Default product rule:

- parent nodes organize plan structure
- leaf nodes carry executable slices
- active construction should prefer shallow leaf nodes under a visible parent
- when the focused node is too deep to understand without expanding hidden
  ancestors, the agent should ask to lift or fold the focus

Suggested default: warn when active construction is deeper than depth 3 from the
roadmap root. This is a warning, not a hard blocker. When the warning appears,
the agent should lift or fold the focus into a shallower executable node, or
record a roadmap decision explaining why the deeper focus remains executable.

## Human Gate Taxonomy

Human Gates are named stops, not vague "be careful" advice.

Always stop before:

- merge to shared branch
- publish or release
- delete an unmerged, shared, protected, or non-current-roadmap remote branch
- destructive cleanup
- roadmap scope expansion
- continuing after failed verification
- modifying denylisted or sensitive paths
- changing package identity, public URLs, or public API

Deleting the already-merged current roadmap branch is post-merge checklist work,
not a Human Gate. Any branch deletion outside that narrow case remains a Human
Gate.

At a Human Gate, the agent may prepare context, commands, verification status,
and recommendation. It should not cross the gate until the approval is explicit
and recorded with scope and validity.

## Relationship to Roadmap-Sliced Development

This design does not replace `roadmap-sliced-development-pattern`. It productizes
the runtime behavior that pattern expects:

- the seven-item Minimal Viable Checklist remains the minimum gate
- automatic continuation is allowed only between executable leaves
- Human Gates and failed verification override continuation
- process roadmaps still close out into durable docs

## Acceptance Criteria

- A user can say "run under ZAgenticLoop constraints" and expect continuous
  leaf-by-leaf execution until a named stop condition.
- Roadmap writing behavior has a clear serialization and stale-lock contract.
- Active construction focus has a depth-budget rule or warning.
- Human Gate categories are explicit and reviewable.
- Future implementation slices can map directly from this design without
  re-litigating product semantics.

## Candidate Implementation Slices

1. Document runtime prompt contract in user-facing docs.
2. Add roadmap CLI lock behavior and stale-lock UX tests.
3. Add active focus depth warning to roadmap rendering or focus selection.
4. Add Human Gate taxonomy to safety docs and applicable starters.
5. Add audit/readiness checks for runtime constraints.

Each implementation slice should declare its own verification gate before work
starts.

## Closeout Decision Audit

Closeout date: 2026-07-02

The process roadmap for this design recorded 6 decisions. Durable decisions were
absorbed into this design doc before deleting the process roadmap files.

| Decision area | Classification | Durable location |
| --- | --- | --- |
| Issue #1 execution boundary and non-goals | durable doc | Goal, Non-Goals |
| Issue #1 feedback gaps | durable doc | Feedback Summary |
| Automatic continuous execution and default leaf commits | durable doc | Runtime Contract |
| Roadmap write lock timeout and no default auto-unlock | durable doc | Roadmap Write Safety |
| Active construction depth warning | durable doc | Active Construction Focus |
| Human Gate branch deletion taxonomy | durable doc | Human Gate Taxonomy |

No roadmap decision was retained only as `PR only`. No decision was discarded as
an unneeded process note.
