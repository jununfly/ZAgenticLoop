# Roadmap Activation State

Last run: 2026-07-08

## Current Capability

- Route: `roadmap-sliced-development`
  - Consumer kind: `activation-consumer`
  - Request kind: `activation-comment`
  - Execution mode: `live`
  - Side effect level: `branch`
  - Completion forms: `roadmap-branch-pr`, `activation-failed`,
    `activation-resumable`
  - Protocol maturity: `dogfooded`
  - Runner maturity: `dogfooded`

## Evidence

- Route Table live evidence:
  - https://github.com/jununfly/ZAgenticLoop/issues/19#issuecomment-4893007904
  - https://github.com/jununfly/ZAgenticLoop/issues/21#issuecomment-4893302147
- Activation replay covers request creation, duplicate detection,
  resume-existing, failed retry, missing resume anchors, ambiguous state, and
  disabled-route denial:
  `scripts/roadmap-activation-e2e-replay.test.mjs`.
- Dispatcher replay covers authorized issue slash commands, duplicate lifecycle
  comments, resume audit comments, unauthorized denials, and disabled-route
  refusal:
  `scripts/roadmap-activation-dispatcher.test.mjs`.

## Boundary

Roadmap activation may create append-only activation lifecycle comments and
bootstrap a Roadmap-Sliced Development branch/process path. It must not create
Issue Fix Requests and must not perform implementation work directly.

After activation is consumed, slice implementation is bounded by
Roadmap-Sliced Development gates: explicit leaf state, verification evidence
before commit, reviewable branch/PR, and no unbounded auto loop.
