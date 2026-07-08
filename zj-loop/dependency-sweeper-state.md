# Dependency Sweeper State

Last run: 2026-07-08

## Current Capability

- Route: `dependency-sweeper`
- Consumer kind: `fix-runner`
- Execution mode: `claim-only`
- Side effect level: `claim`
- Protocol maturity: `replayed`
- Runner maturity: `missing`

## Evidence

- Route replay covers dependency alert to Issue Fix Request:
  `scripts/dependency-sweeper-route-e2e-replay.test.mjs`.
- Claim replay covers `requested -> consumed` for matching Dependency Sweeper
  requests:
  `scripts/dependency-sweeper-claim-e2e-replay.test.mjs`.

## Boundary

Dependency Sweeper is not live in this repository yet. It must not edit package
manifests, update lockfiles, create branches, open Fix PRs, dispatch workflows,
or auto-merge. A future runner upgrade must add verifier-backed repair PR or
escalation evidence before changing `execution.mode` to `live`.
