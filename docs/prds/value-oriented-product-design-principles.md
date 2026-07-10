# Value-Oriented Product Design Principles

## Status

Draft product direction.

## Purpose

This document records product design principles for ZAgenticLoop from the
perspective of creating user value.

The product should help users complete meaningful work with less coordination
friction, lower cognitive load, better evidence, and clearer stop conditions.
Principles here should guide roadmap design, route behavior, consumer runner
semantics, documentation, and default user experience.

## Principle 1: Default Toward Automated Loops

ZAgenticLoop should make fully automated loop execution the default product
experience whenever the work is safe, bounded, authorized, and verifiable.

The core promise is not "install many guardrails until the loop cannot run."
The core promise is:

> A loop runs automatically when its prerequisites, cost envelope, authority,
> and verification gates are satisfied. Anything that makes automatic execution
> unsafe, too expensive, ambiguous, or unverifiable becomes a stop signal.

This shifts the product from permission-first friction to automation-first
operation with explicit stop conditions.

### User Experience Goal

Users should experience ZAgenticLoop as a system that naturally continues work
end to end:

1. Detect a signal.
2. Route it.
3. Create or reuse the correct request carrier.
4. Run the matching consumer.
5. Execute bounded work.
6. Verify evidence.
7. Open or update the review artifact.
8. Close out merged or completed work.

The loop should stop only when it encounters a real reason to stop, such as:

- missing authority
- missing credentials
- cost budget exhaustion
- unclear intent
- high-risk scope
- failing verification
- unsafe workspace state
- unsupported provider capability
- duplicate or conflicting lifecycle evidence
- human decision genuinely required

### Product Requirements

#### Automation Default

- Route consumers should be designed toward automatic execution by default.
- Manual confirmation should be reserved for high-risk, ambiguous, destructive,
  costly, or policy-sensitive boundaries.
- The default path should be "run if allowed," not "wait unless manually
  pushed."

#### Strict Preconditions

Before a loop runs automatically, it must be able to prove:

- the route is enabled
- the consumer capability matches the request
- the request carrier is valid and deduped
- the provider adapter supports the required side effects
- credentials and actor permissions are available
- cost budget is available
- workspace state is safe
- verification gates are known
- stop conditions are observable

#### Stop Signals

Every non-automatic condition should become a structured stop signal with:

- stop reason
- responsible layer
- evidence link or artifact
- suggested next step
- whether retry requires a new request
- whether human review is required

#### Cost Control

Cost control should be part of the automation contract:

- declare max slices or work units
- declare token/time budget
- stop before expensive exploration when budget is insufficient
- record spend and budget evidence
- avoid silent continuation beyond the declared envelope

#### Verification First

Automation must be tied to verification:

- all automatic work needs deterministic or reviewable verification evidence
- status transitions must be backed by gate evidence
- failed verification stops the loop and records replayable failure context
- automatic merge/release remains separately governed by higher-risk policy

### Non-Goals

- This does not mean every route should immediately perform live side effects.
- This does not remove human review for destructive, ambiguous, legal, security,
  billing, release, or production-sensitive work.
- This does not require unbounded autonomous implementation loops.
- This does not make cost control optional.

### Implications

- Route Table should increasingly express automation readiness, not just
  enablement.
- Consumer runners should expose why they stopped as first-class evidence.
- Provider adapters should distinguish "unsupported" from "supported but
  disabled."
- Roadmap-Sliced Development should optimize for running multiple eligible
  slices until a real stop signal appears.
- Documentation should teach users how to make loops safely automatic, not only
  how to keep them manual.

### Open Questions

- What is the minimum evidence required before a route can be considered
  automation-default?
- Which stop signals should be hard blockers versus warning-level pauses?
- How should users configure cost budgets without making first-run setup feel
  heavy?
- Which existing routes are closest to automation-default readiness?
- What dashboard or report would make stop signals easy to understand?
