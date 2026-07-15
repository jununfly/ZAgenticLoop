# Post-Merge Cleanup State

Last run: 2026-07-15

## Current Capability

- Route: `post-merge-roadmap-closeout`
  - Consumer kind: `cleanup-consumer`
  - Route Decision execution mode: `dry-run`
  - Live cleanup mode: `contract-authorized` after dry-run evidence
  - Completion forms: `cleanup-done`, `cleanup-skipped`, `escalation-issue`
  - Protocol evidence: `dogfooded` (published Route Table maturity remains
    `replayed` pending a separate promotion decision)
  - Runner evidence: `dogfooded` (published Route Table maturity remains
    `replayed` pending a separate promotion decision)

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
- GitHub live dogfood records both fail-closed and executed outcomes:
  - [PR #132](https://github.com/jununfly/ZAgenticLoop/pull/132) refused a
    hand-authored partial contract with no side effects.
  - [PR #133](https://github.com/jununfly/ZAgenticLoop/pull/133) passed all
    five guards, deleted only `zjal-closeout-contract-template-fix`, and closed
    only carrier [#131](https://github.com/jununfly/ZAgenticLoop/issues/131).

## Boundary

Post-Merge Cleanup is not generic merged-PR automation. Route Decision stays
`report-only`; the automatic workflow first records dry-run evidence and may
then execute contract-authorized live cleanup.

Live cleanup may delete only the merged `zjal-*` roadmap branch named in a valid
`zj-loop.post-merge-contract` and may close only the activation carrier issue
named in that same contract. A valid merged-PR contract plus all executor guards
authorizes this narrow automatic path. The fixed confirmation phrase
`DELETE_MERGED_ROADMAP_BRANCH_AND_CLOSE_CARRIER` remains the fallback when
contract authorization is unavailable or a maintainer invokes the live executor
directly.

Historical `zjal/*` roadmap branches remain accepted for compatibility, but new
automation must generate `zjal-*` branch names to avoid Git ref prefix
conflicts.

The Route Table remains `execution.mode: dry-run` for the Route Decision layer;
this does not prevent the separately guarded contract-authorized executor from
performing the narrow live cleanup demonstrated by PR #133.
