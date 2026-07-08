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
  - Runner maturity: `replayed`

## Evidence

- Report replay covers PR event to PR Steward report evidence:
  `scripts/pr-steward-report-e2e-replay.test.mjs`.
- Fix request replay covers failed PR checks to independent Issue Fix Request:
  `scripts/pr-steward-fix-request-e2e-replay.test.mjs`.
- Claim replay covers matching Issue Fix Request `requested -> consumed`:
  `scripts/pr-steward-claim-e2e-replay.test.mjs`.
- Live runner replay covers `consumed -> repair-pr` and
  `consumed -> escalation-issue` outcomes without mutating the source PR:
  `scripts/pr-steward-live-runner.test.mjs`.

## Boundary

PR Steward is not live repair automation in this repository yet. The fix
request route remains `claim-only`, so automatic routing must not write source
PR comments, mutate labels, rebase, merge, dispatch workflows, create repair
branches, or open Fix PRs.

`scripts/pr-steward-live-runner.mjs` is now a replayed, guarded runner for
already consumed PR Steward Issue Fix Requests. It requires the fixed
confirmation phrase `CREATE_PR_STEWARD_FIX_PR_OR_ESCALATION`, a clean working
tree, a current source PR head SHA match, `main` as the source PR base, verifier
commands, and either an explicit repair command plus repair file allowlist or
an escalation issue path. Repair PRs are independent branches against `main`;
the runner records source PR side effects as false. The route may move to
`execution.mode: live` only after real workflow-dispatch dogfood evidence shows
the runner can create a verifier-backed repair PR or escalation issue safely.
