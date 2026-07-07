# Roadmap Activation Recovery Hardening Roadmap

Process roadmap for issue #46 and branch
`zjal/activation-recovery-hardening`.

Activation request: `rsd-46-activation-recovery`

## Goal

Harden Roadmap-Sliced Development activation resume and failure recovery so
agents know when to resume an already consumed activation versus create a new
request.

## Decisions

- Pending request plus another slash command returns `duplicate`.
- Consumed request with complete resume anchors returns `resume-existing`.
- `resume-existing` is audit-only evidence and does not change activation
  lifecycle state.
- Consumed request with missing resume anchors returns `blocked` and writes
  `zj-loop.activation-resume-blocked`.
- Failed request remains terminal and allows a new activation request.
- Ambiguous lifecycle remains blocked.
- Activation dispatcher does not check whether resume branch/file still exists.
  Roadmap-Sliced Consumer owns stale-anchor handling.
- Suitable deterministic behavior must live in scripts/functions, not runtime
  agent judgment.

## Leaf 1: Deterministic Activation Recovery Contract

Status: completed

Commit intent: `feat(activation): distinguish resume from duplicate activation`

Gate:

- `node --test scripts/zj-loop-activation-contract.test.mjs scripts/roadmap-activation-dispatcher.test.mjs`

Work:

- Add deterministic `resume-existing` and `resume-blocked` evaluation paths.
- Add fixed structured audit comments for resume and blocked resume.
- Keep pending duplicate, failed retry, and ambiguous block behavior intact.

Evidence:

- Added deterministic `resume-existing` and `resume-blocked` evaluation paths.
- Added `zj-loop.activation-resume-existing` and
  `zj-loop.activation-resume-blocked` structured audit comments.
- Dispatcher now emits fixed audit comments for consumed resume and malformed
  consumed resume anchors.
- Verification passed:
  `node --test scripts/zj-loop-activation-contract.test.mjs scripts/roadmap-activation-dispatcher.test.mjs`.

## Leaf 2: Replay And Durable Docs

Status: pending

Commit intent: `docs(testing): cover roadmap activation recovery replay`

Gate:

- `node --test scripts/roadmap-activation-e2e-replay.test.mjs scripts/zj-loop-activation-contract.test.mjs scripts/roadmap-activation-dispatcher.test.mjs`
- `npm run test:protocol-terminology`
- `git diff --check`

Work:

- Add replay coverage for consumed resume, malformed consumed blocked resume,
  failed retry, pending duplicate, and ambiguous block.
- Update durable docs and checklist with the implemented recovery rules.

Evidence:

- Pending.

## Closeout

Status: pending

Gate:

- durable docs/PR body absorb key decisions
- temporary roadmap is deleted
- draft PR includes post-merge cleanup contract

Evidence:

- Pending.
