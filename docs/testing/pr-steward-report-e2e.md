# PR Steward Report E2E Test Cases

These test cases verify the report-only PR Steward route:

```text
Pull Request Event -> Route Decision -> PR Steward Report Evidence
```

This route is a PR event observation lane. It is not a PR comment bot, not a
rebase worker, not an auto-merge path, and not an Issue Fix Request creator.

## Scope

The local replay proves that selected pull request events can be routed through
the dogfood route table and produce PR Steward report evidence.

The current implementation is intentionally report-only:

- no PR comment
- no label change
- no rebase
- no merge
- no Issue Fix Request
- no workflow dispatch
- no consumer work start

The route exists to classify PR attention signals before any side-effecting PR
Steward behavior is enabled.

## Local Replay Gate

Run:

```bash
node scripts/pr-steward-report-e2e-replay.mjs
node --test scripts/pr-steward-report-e2e-replay.test.mjs
```

Expected results:

- Replay suite returns `passed: true` with the real
  `zj-loop/zj-loop-route-table.yaml`.
- `pull_request` events reach `pr-steward-report`.
- The Route Decision has `request_kind: report-only`, `status: closed`, and
  `target_consumer: pr-steward`.
- Report evidence stores its durable audit target as
  `zj-loop/pr-steward-state.md`.
- `review_requested` becomes `watch`.
- failed checks become `candidate-fix-request`, but no Issue Fix Request is
  created in this route.
- stale or blocked PRs become `needs-human-review`.
- green approved PRs become `ready-to-merge-notice`, but no merge is started.
- A disabled route denies before report evidence.
- Non pull request signals cannot enter this route.

## Plan Activation Boundary

The implementation work may be started through the usual issue/comment
activation path:

```text
Issue Slash Command -> Route Decision -> Activation Request -> Roadmap-Sliced Consumer -> Roadmap Branch/PR
```

That is separate from the route implemented here. The runtime route input is a
Pull Request Event, not the activation issue signal that starts this development
slice.

## Failure Diagnosis Matrix

| Failing layer | Expected evidence |
| --- | --- |
| Signal | Source is not `pull_request`, or action is not one of the allowlisted PR actions. |
| Route Decision | `allowed: false` with a route guard reason. |
| Report classification | PR Steward status is one of `watch`, `candidate-fix-request`, `needs-human-review`, or `ready-to-merge-notice`. |
| Side effects | Always false in this replay; enabling comments, labels, rebase, merge, or Issue Fix Request creation requires a later explicit route. |

## Closeout Decision Audit

| Decision | Classification | Durable home |
| --- | --- | --- |
| Canonical chain wording is `Pull Request Event -> Route Decision -> PR Steward Report Evidence`. | durable doc | This test case and `zj-loop/ZJ-LOOP.md`. |
| Issue Slash Command is only the activation path for implementing this slice, not the runtime route input. | durable doc | This test case. |
| `pr-steward-report` is report-only and writes no PR comments, labels, rebases, merges, requests, or workflow dispatches. | durable doc | This test case and replay tests. |
| PR Steward report evidence belongs in `zj-loop/pr-steward-state.md` until a later explicit route enables public PR comments. | durable doc | This test case and route table. |

## Fix Request Follow-Up Route

`pr-steward-fix-request` is the first side-effecting follow-up route for PR
Steward, but its side effect is limited to creating or deduping an independent
GitHub Issue Fix Request. It does not write source PR comments, change labels,
rebase, merge, dispatch workflows, claim the request, or repair code.

Canonical chain:

```text
Pull Request Event -> Route Decision -> Issue Fix Request -> PR Steward
```

The route is intentionally narrower than the report lane:

- `source: pull_request`
- `action: synchronize | ready_for_review`
- `checks: failure`
- `check_source: github_status_check_rollup`
- `draft: false`
- `base_branch: main`

The dedupe key is:

```text
pr:<repo>:<pr_number>:head:<head_sha>:checks:failure
```

Duplicate requests return the existing request issue URL without writing back to
the source PR.

## Claim-Only Follow-Up

`pr-steward-fix-request` also has a claim-only replay for the next lifecycle
boundary:

```text
Pull Request Event -> Route Decision -> Issue Fix Request -> PR Steward Claim Evidence
```

Run:

```bash
node scripts/pr-steward-claim-e2e-replay.mjs
node --test scripts/pr-steward-claim-e2e-replay.test.mjs
```

The claim replay consumes only an existing `requested` Issue Fix Request and
emits append-only lifecycle evidence for the independent request issue. It does
not write source PR comments, mutate labels, rebase, merge, dispatch workflows,
start repair, create branches, open Fix PRs, or enable auto-merge.

Claim gates are intentionally fail-closed:

- consumer and capability must be `pr-steward` /
  `pr-review-and-readiness-fix`
- request route must be `pr-steward-fix-request`
- request subject must be a pull request targeting `main`
- `verification_gate.commands` must be non-empty
- claim input must include `current_pr_head_sha`
- `current_pr_head_sha` must match `request.subject.head_sha`
- request status must be `requested`

Duplicate existing requests are not claimed. A stale head SHA is denied instead
of silently consuming the old request; a new PR head must go through Route
Decision and request creation/dedupe again.

Closeout decision audit for the claim upgrade:

| Decision | Classification | Durable home |
| --- | --- | --- |
| PR Steward claim evidence belongs on the independent Issue Fix Request as an append-only lifecycle comment, not in `zj-loop/pr-steward-state.md`. | durable doc | This test case and replay tests. |
| Claim requires an explicit current PR head SHA and denies stale requests. | deterministic gate | `scripts/pr-steward-claim-e2e-replay.mjs`. |
| Claim is not repair: all PR, workflow, branch, Fix PR, and auto-merge side effects are false. | deterministic gate | `scripts/pr-steward-claim-e2e-replay.test.mjs`. |
