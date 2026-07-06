# Retire Planning-Signal Term Roadmap

Roadmap id: `retire-plan-signal-term`
Branch: `zjal/retire-plan-signal-term`

## Context

This is a lightweight Roadmap-Sliced Development follow-up from the recent
activation dogfood runs. It does not create a new activation request because the
work hardens terminology exposed by those activation runs rather than starting a
new independent feature.

## Decisions

- The former uppercase planning-signal protocol phrase is retired as a canonical
  protocol term.
- The former uppercase planning-signal protocol phrase is forbidden across the
  repository.
- Abstract `Signal` remains valid in generic protocol templates.
- Use concrete activation signal names in canonical chains:
  - `Issue Slash Command`
  - `Daily Triage Candidate`
- Explanatory prose may use natural-language phrases such as `plan-like
  signals` or `planning-related input`, but not the retired uppercase phrase.

## Slices

### 1. Terminology Alignment

Status: completed
Commit intent: `Retire planning-signal terminology`
Gate: no retired uppercase phrase remains; route/activation tests still pass.

Work:

- Replace existing canonical planning-signal chains with concrete signal names.
- Preserve abstract `Signal` protocol templates.
- Add a deterministic protocol terminology gate.

Verification evidence:

- `rg -n "Plan Signal" docs patterns scripts zj-loop README.md package.json`
  returned no matches.
- `npm run test:protocol-terminology` passed.
- `npm run test:activation-contract` passed.
- `npm run test:route-decision` passed.
- `npm run validate:registry` passed.
- `npm run check:zj-loop-init` passed.
- `git diff --check` passed.

### 2. Closeout

Status: pending
Commit intent: `Close out planning-signal retirement roadmap`
Gate: durable docs/tests absorb decisions; this process roadmap is deleted.

Work:

- Audit decisions above into durable docs and tests.
- Delete this process roadmap before PR handoff.
