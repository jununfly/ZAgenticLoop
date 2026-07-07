# PR Steward Fix Request Route Roadmap

Roadmap id: `pr-steward-fix-request-route`
Branch: `zjal/pr-steward-fix-request-route`
Activation carrier: [jununfly/ZAgenticLoop#26](https://github.com/jununfly/ZAgenticLoop/issues/26)
Activation request: [issuecomment-4896368513](https://github.com/jununfly/ZAgenticLoop/issues/26#issuecomment-4896368513)
Activation consumed: [issuecomment-4896382029](https://github.com/jununfly/ZAgenticLoop/issues/26#issuecomment-4896382029)

## Goal

Implement the next Route Decision slice:

```text
Pull Request Event -> Route Decision -> Issue Fix Request -> PR Steward
```

## Decisions

- Route id: `pr-steward-fix-request`.
- Consumer: `pr-steward`.
- Request kind: `issue-fix-request`.
- Carrier: independent GitHub Issue, not the source PR comment.
- Match scope:
  - `source: pull_request`
  - `action: synchronize | ready_for_review`
  - `checks: failure`
  - `check_source: github_status_check_rollup`
  - `draft: false`
  - `base_branch: main`
- Dedupe key: `pr:<repo>:<pr_number>:head:<head_sha>:checks:failure`.
- Duplicate behavior: no PR comment; return existing request issue URL.
- First slice stops at request creation/dedupe. It does not claim, repair, edit
  PRs, label, rebase, merge, or trigger workflows.

## Slices

### 1. Request Route Contract

Status: completed
Commit intent: `Add PR Steward fix request route`
Gate:

- `npm run test:pr-steward-report`
- `npm run test:issue-fix-request`
- `npm run test:route-decision`
- `npm run validate:registry`
- `npm run check:zj-loop-init`
- `git diff --check`

Work:

- Add `pr-steward-fix-request` to the dogfood route table.
- Add deterministic replay for allowed, denied, and duplicate PR fix requests.
- Build independent Issue Fix Request body/title for PR failures.
- Update durable testing/design docs.

Verification evidence:

- `npm run test:pr-steward-fix-request` passed.
- `npm run test:issue-fix-request` passed.
- `npm run test:pr-steward-report` passed.
- `npm run test:route-decision` passed.
- `npm run validate:registry` passed.
- `npm run check:zj-loop-init` passed.
- `git diff --check` passed.

Notes:

- Implementation started only after the issue-triggered Activation Request was
  created and consumed on GitHub issue #26.
- The route creates or dedupes an independent GitHub Issue Fix Request carrier
  only. It does not claim the request, repair code, write source PR comments,
  edit labels, rebase, merge, or dispatch workflows.

### 2. Closeout

Status: pending
Commit intent: `Close out PR Steward fix request route roadmap`
Gate:

- durable docs absorb decisions
- process roadmap is deleted
- Roadmap Handoff Gate passes after PR creation

Work:

- Audit decisions into durable docs and PR body.
- Delete this process roadmap before PR handoff.
