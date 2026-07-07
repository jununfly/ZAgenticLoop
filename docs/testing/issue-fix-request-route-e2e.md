# Issue Fix Request Route E2E Test Cases

These test cases verify the general fix route:

```text
Signal -> Route Decision -> Issue Fix Request -> Fix Consumer -> Fix PR
```

This chain is for fix-producing consumers only. Roadmap-Sliced Development
activation uses the separate activation request contract.

## Local Replay Gate

**Goal:** Prove the protocol is deterministic without GitHub side effects.

Run:

```bash
node scripts/issue-fix-request-e2e-replay.mjs
node --test scripts/issue-fix-request-contract.test.mjs scripts/issue-fix-request-dispatcher.test.mjs scripts/issue-fix-request-e2e-replay.test.mjs
```

Expected results:

- Replay suite returns `passed: true`.
- `ci-sweeper` reaches `fix-pr`.
- Duplicate requests stop before consumer claim.
- Non `issue-fix-request` route kinds are denied.
- `dependency-sweeper` failure becomes a terminal failed request.
- Fixtures include `ci-sweeper`, `pr-steward`, and `dependency-sweeper` so the
  protocol does not drift into a CI-only contract.
- The real dogfood route table enables `dependency-sweeper` as a bounded
  Issue Fix Request route with claim-only lifecycle evidence. Detailed route
  and claim scenarios live in
  [Dependency Sweeper Route E2E](./dependency-sweeper-route-e2e.md).
- The real dogfood route table enables `pr-steward-fix-request` as a bounded
  Issue Fix Request route with claim-only lifecycle evidence. Detailed route
  and claim scenarios live in
  [PR Steward Report E2E](./pr-steward-report-e2e.md).

## Real GitHub Dogfood Evidence

**Goal:** Prove the GitHub carrier works, not only the local replay.

For the first dogfood run, use `ci-sweeper` as the enabled consumer because it
already has workflow, state, route, deterministic repair, and existing CI
Sweeper replay coverage.

Required evidence:

- source signal URL
- persisted Route Decision
- Issue Fix Request issue or structured issue comment
- consumer claim evidence
- Fix PR URL or terminal failed/escalation evidence
- verification commands and outcomes
- cleanup notes for temporary PRs/issues/branches

Do not require every known Fix Consumer to run live in the first dogfood pass.
`pr-steward-fix-request` and `dependency-sweeper` now have real dogfood routes.
Both routes also have local claim-only lifecycle evidence. Fix PR creation
remains out of scope for these consumers until a later explicit route enables
repair execution.

Current ZAgenticLoop repo status:

- Workflow support exists for the first live consumer, `ci-sweeper`.
- Daily Triage creates the Issue Fix Request carrier issue before dispatch.
- CI Sweeper records the carrier URL in consumer-owned evidence.
- Live external evidence has been captured:
  - Daily Triage no-signal run:
    https://github.com/jununfly/ZAgenticLoop/actions/runs/28790602470
  - Synthetic Issue Fix Request carrier:
    https://github.com/jununfly/ZAgenticLoop/issues/17
  - CI Sweeper no-diff escalation run:
    https://github.com/jununfly/ZAgenticLoop/actions/runs/28790735629
  - Escalation issue:
    https://github.com/jununfly/ZAgenticLoop/issues/18

## Failure Diagnosis Matrix

| Failing layer | Expected evidence |
| --- | --- |
| Signal | Missing or malformed source signal in replay output. |
| Route Decision | `allowed: false` with guard reason. |
| Issue Fix Request | Contract validation errors or duplicate result. |
| Fix Consumer claim | Consumer mismatch or invalid lifecycle transition. |
| Fix PR | Missing `linked_pr` or verifier gate failure. |
| Retry | New request with new `request_id`; failed request is not retried in place. |

The validate gate runs these local checks through `scripts/ci-validate-gates.sh`.
