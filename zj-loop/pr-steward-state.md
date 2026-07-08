# PR Steward State

Last run: 2026-07-08

## Current Capability

- Report route: `pr-steward-report`
  - Consumer kind: `report-consumer`
  - Execution mode: `report-only`
  - Runner maturity: `missing`
- Fix request route: `pr-steward-fix-request`
  - Consumer kind: `fix-runner`
  - Execution mode: `claim-only`
  - Protocol maturity: `replayed`
  - Runner maturity: `missing`

## Evidence

- Report replay covers PR event to PR Steward report evidence:
  `scripts/pr-steward-report-e2e-replay.test.mjs`.
- Fix request replay covers failed PR checks to independent Issue Fix Request:
  `scripts/pr-steward-fix-request-e2e-replay.test.mjs`.
- Claim replay covers matching Issue Fix Request `requested -> consumed`:
  `scripts/pr-steward-claim-e2e-replay.test.mjs`.

## Boundary

PR Steward is not live repair automation in this repository yet. It must not
write source PR comments, mutate labels, rebase, merge, dispatch workflows,
create repair branches, or open Fix PRs. A future runner upgrade must add
current-head-SHA verifier-backed repair PR or escalation evidence before
changing the fix request route to `execution.mode: live`.
