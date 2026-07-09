# Issue Triage Transition E2E Test Cases

These test cases verify the confirmed issue triage transition route:

```text
GitHub/GitLab Issues Backlog -> Route Decision -> Recommended Triage Transition -> Confirmed Triage Transition -> Issue Fix Request Plan
```

This is the bridge from recommendation mode to a reviewable request plan. It
does not mutate tracker state, write public comments, change labels, close
issues, or start consumer work.

## Scope

The local replay uses the real `zj-loop/zj-loop-route-table.yaml`.

It first runs `issue-backlog-triage` to create
`zj-loop.recommended_triage_transition.v1` evidence. It then runs
`issue-triage-transition` with:

- maintainer/collaborator permission
- the exact command
  `/zj-loop confirm-triage-transition <request-id>`
- the fixed confirmation phrase `CONFIRM_TRIAGE_TRANSITION`

When the recommended state is `ready-for-agent`, the confirmed transition plans
an Issue Fix Request for `roadmap-sliced-development`. Other triage states
remain triage-only evidence unless a later promoted route explicitly supports
live side effects.

## Local Replay Gate

Run:

```bash
node scripts/issue-triage-transition-e2e-replay.mjs
node --test scripts/issue-triage-transition-e2e-replay.test.mjs
npm run test:issue-triage-transition-e2e
```

Expected results:

- Replay suite returns `passed: true` with the real Route Table.
- `ready-for-agent` reaches completion form `issue-fix-request-created`.
- `needs-info` reaches completion form `triage-transition-confirmed` without an
  Issue Fix Request.
- `wontfix` candidates escalate and do not produce tracker operations.
- Every result keeps `side_effects.executed: false`.

## Failure Diagnosis Matrix

| Failing layer | Expected evidence |
| --- | --- |
| Backlog route | No recommended transition; transition replay is not run. |
| Confirmation command | `rejected` with `confirm-command-mismatch`. |
| Confirmation phrase | `rejected` with `fixed-confirmation-phrase-required`. |
| Actor permission | `rejected` with `actor-not-maintainer-or-collaborator`. |
| `wontfix` candidate | `escalated` with no tracker operations. |
| Live mutation attempt | `rejected` with `live-side-effects-not-enabled`. |

## Closeout Decision Audit

| Decision | Classification | Durable home |
| --- | --- | --- |
| Confirmed transition is separate from recommendation evidence. | durable doc | This test case, `docs/designs/triage-architecture.md`, and `zj-loop/issue-triage-state.md`. |
| `ready-for-agent` can only plan an Issue Fix Request after fixed confirmation. | durable doc | This test case and `patterns/issue-triage.md`. |
| Live tracker mutation remains refused until explicitly promoted. | durable doc | This test case, Route Table, and Dogfood Reference Case. |
