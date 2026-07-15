# Dependency Sweeper State

Last run: 2026-07-15

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
- Real workflow-dispatch dogfood evidence:
  `https://github.com/jununfly/ZAgenticLoop/actions/runs/29234374181`.
  The run used `core_package=./tools/zj-loop-core` to validate unreleased local
  dist, installed local package dependencies, executed guarded live-repair with
  `CREATE_DEPENDENCY_SWEEPER_FIX_PR`, uploaded `live-repair-result.json`, and
  produced verifier-backed `escalation-issue` evidence without pushing a repair
  branch or creating a repair PR.
- Recovery evidence: runs `29382134888`, `29382945566`, `29383478154`, and
  `29384985759` exposed, respectively, a released CLI mismatch, missing commit
  identity, missing branch-write permission, and missing `GH_TOKEN`. The
  resulting `@jununfly/zj-loop-core@0.1.8` plus generated workflow hardening
  added explicit bot identity, narrowly scoped `contents: write`, step-scoped
  `GH_TOKEN`, and guarded residual-branch recovery.
- Final live recovery: run
  [`29385283810`](https://github.com/jununfly/ZAgenticLoop/actions/runs/29385283810)
  consumed the bounded `yaml` `2.8.0 -> 2.8.1` request, refreshed the residual
  branch lease after confirming no open repair PR, passed both verifier gates,
  and created repair [PR #128](https://github.com/jununfly/ZAgenticLoop/pull/128).
  The PR was human-merged on 2026-07-15; the runner did not auto-merge it.

## Boundary

Dependency Sweeper is not live in this repository yet. The Route Table remains
`claim-only`, so automatic routing must not edit package manifests, update
lockfiles, create branches, open Fix PRs, dispatch workflows, or auto-merge
from the route by default.

`zj-loop-dependency-sweeper live-repair` is a guarded runner entrypoint for npm
patch/minor dependency requests that have already been claimed by Dependency
Sweeper. The generated GitHub Actions workflow now exposes a
`confirm_live_repair` workflow-dispatch input; when the fixed phrase
`CREATE_DEPENDENCY_SWEEPER_FIX_PR` is provided, the workflow can execute
live-repair and upload `live-repair-result.json` evidence.

Live execution still requires a clean working tree, low/medium route risk, an
npm dependency subject with an explicit dependency section, verifier commands,
and a non-empty manifest/lockfile diff before PR creation. The route may move
to `execution.mode: live` only after real workflow-dispatch dogfood evidence
shows the runner can create a verifier-backed repair PR or escalation issue
safely. That evidence now exists, but changing Route Table execution mode is a
separate explicit promotion decision.
