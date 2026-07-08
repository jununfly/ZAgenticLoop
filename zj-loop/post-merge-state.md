# Post-Merge Cleanup State

Last run: 2026-07-08

## Current Capability

- Route: `post-merge-roadmap-closeout`
  - Consumer kind: `cleanup-consumer`
  - Execution mode: `dry-run`
  - Completion forms: `cleanup-done`, `cleanup-skipped`, `escalation-issue`
  - Protocol maturity: `replayed`
  - Runner maturity: `replayed`

## Evidence

- Contract replay verifies valid and invalid `zj-loop.post-merge-contract`
  parsing and closeout planning:
  `scripts/post-merge-roadmap-closeout-contract.test.mjs`.
- E2E replay verifies merged Roadmap-Sliced PR closeout route decisions,
  contract-backed dry-run evidence, missing-contract refusal, and disabled-route
  denial:
  `scripts/post-merge-roadmap-closeout-e2e-replay.test.mjs`.
- Executor replay verifies guarded live cleanup plans, branch allowlist,
  fixed confirmation phrase, remote/local branch deletion guards, and carrier
  issue closeout scope:
  `scripts/post-merge-roadmap-closeout.test.mjs`.
- Workflow validation verifies automatic dry-run on merged PRs and fixed
  confirmation gating for live cleanup:
  `scripts/validate-post-merge-closeout-workflow.test.mjs`.
- Live executor results now include a shared
  `zj-loop.live_runner_evidence.v1` envelope for executed cleanup and refused
  escalation-shaped outcomes:
  `scripts/post-merge-roadmap-closeout.test.mjs`.

## Boundary

Post-Merge Cleanup is not generic merged-PR automation. Route Decision stays
`report-only` and automatic workflow behavior stays dry-run.

Live cleanup may delete only the merged `zjal/*` roadmap branch named in a valid
`zj-loop.post-merge-contract` and may close only the activation carrier issue
named in that same contract. Live execution requires explicit operator
invocation plus the fixed confirmation phrase
`DELETE_MERGED_ROADMAP_BRANCH_AND_CLOSE_CARRIER`.

The Route Table remains `execution.mode: dry-run` until a real
`workflow_dispatch` live cleanup run records recent successful evidence. The
executor is live-capable; the automatic route is not promoted to live yet.
