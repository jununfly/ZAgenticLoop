# Dependency Sweeper State

Last run: 2026-07-08

## Current Capability

- Route: `dependency-sweeper`
- Consumer kind: `fix-runner`
- Execution mode: `claim-only`
- Side effect level: `claim`
- Protocol maturity: `replayed`
- Runner maturity: `replayed`

## Evidence

- Route replay covers dependency alert to Issue Fix Request:
  `scripts/dependency-sweeper-route-e2e-replay.test.mjs`.
- Claim replay covers `requested -> consumed` for matching Dependency Sweeper
  requests:
  `scripts/dependency-sweeper-claim-e2e-replay.test.mjs`.
- Live runner replay covers `consumed -> repair-pr` and
  `consumed -> escalation-issue` outcomes:
  `scripts/dependency-sweeper-live-runner.test.mjs`.

## Boundary

Dependency Sweeper is not live in this repository yet. The Route Table remains
`claim-only`, so automatic routing must not edit package manifests, update
lockfiles, create branches, open Fix PRs, dispatch workflows, or auto-merge.

`scripts/dependency-sweeper-live-runner.mjs` is now a replayed, guarded runner
for npm patch/minor dependency requests that have already been claimed by
Dependency Sweeper. Live execution requires the fixed confirmation phrase
`CREATE_DEPENDENCY_SWEEPER_FIX_PR`, a clean working tree, low/medium route risk,
an npm dependency subject with an explicit dependency section, verifier
commands, and a non-empty manifest/lockfile diff before PR creation. The route
may move to `execution.mode: live` only after real workflow-dispatch dogfood
evidence shows the runner can create a verifier-backed repair PR or escalation
issue safely.
