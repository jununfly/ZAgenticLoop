# Post-Merge Roadmap Closeout E2E Test Cases

These test cases verify the post-merge route and its guarded executor:

```text
Merged PR Signal -> Route Decision -> Post-Merge Contract -> Cleanup Actions
```

This is a Post-Merge Cleanup `roadmap-closeout` mode for Roadmap-Sliced
Development PRs. It is not a generic PR cleanup loop and not an auto-merge path.

## Scope

The local replay proves that a merged PR signal can be routed through the
dogfood route table, parse the PR body `zj-loop.post-merge-contract`, and
produce reviewable report evidence plus a closeout plan.

The route replay remains report-only. Live side effects are performed only by
the explicit contract executor:

```bash
node scripts/post-merge-roadmap-closeout.mjs --pr <number> --repo jununfly/ZAgenticLoop
node scripts/post-merge-roadmap-closeout.mjs --pr <number> --repo jununfly/ZAgenticLoop --carrier-issue <issue> --live
```

Default mode is dry-run. `--live` is required before any branch deletion, carrier
issue comment, or carrier issue closure. The executor refuses before side
effects unless every contract and local guard passes.

The route replay itself remains report-only:

- no branch deletion
- no carrier issue closure
- no GitHub comment write
- no workflow dispatch
- no consumer work start

Route Decision and closeout plan use separate status layers:

| Layer | Status | Meaning |
| --- | --- | --- |
| Route Decision / Report Evidence | `report-only`, `closed` | Evidence was produced; no request lifecycle remains pending. |
| Closeout Plan | `dry-run` | The contract is valid and lists planned actions for a future side-effect-enabled consumer. |

## Local Replay Gate

Run:

```bash
node scripts/post-merge-roadmap-closeout-e2e-replay.mjs
node --test scripts/post-merge-roadmap-closeout-contract.test.mjs scripts/post-merge-roadmap-closeout-e2e-replay.test.mjs scripts/post-merge-roadmap-closeout.test.mjs
```

Expected results:

- Replay suite returns `passed: true` with the real
  `zj-loop/zj-loop-route-table.yaml`.
- A valid merged Roadmap-Sliced PR signal reaches `report-evidence`.
- The Route Decision has `request_kind: report-only`, `status: closed`, and
  `side_effects_blocked: true`.
- Report evidence stores its durable audit target as `GitHub pull request
  comment`.
- The closeout plan is `dry-run` and lists planned branch cleanup and carrier
  issue closure actions.
- Missing post-merge contract still reaches report evidence, but its closeout
  plan is `report-only` with no planned actions.
- Branch mismatch, fork head repository, and unknown head repository all stay
  report-only with no planned actions.
- A disabled route denies before report evidence or closeout planning.
- The executor dry-run lists the exact cleanup actions without side effects.
- The executor live test uses an injected runner and proves no real `git` or
  `gh` command is called during tests.
- Ordinary linked issues such as `Fixes #99` are ignored; only the carrier issue
  named in the valid contract can be closed.
- Dirty worktree, repository mismatch, carrier mismatch, unmerged PR, and
  unmerged local roadmap branch all refuse before side effects.

## Real GitHub Dogfood

Do not manufacture a synthetic merged PR only to create evidence. The first live
dogfood run should use a real Roadmap-Sliced Development PR whose body contains
the `Post-Merge Contract` block before merge.

After that PR merges, run the executor in dry-run mode first. If the dry-run
plan is valid and the operator has approval for post-merge closeout, run with
`--live`.

The live executor appends evidence to the carrier issue before closing it:

- Route Decision
- contract validation result
- closeout plan
- `side_effects_executed: true`
- branch cleanup status

The durable audit home is the PR comment. `zj-loop/STATE.md` remains Daily
Triage memory and must not become the post-merge lifecycle store.

## Failure Diagnosis Matrix

| Failing layer | Expected evidence |
| --- | --- |
| Signal | Source is not `pull_request`, action is not `closed`, or `merged` is not `true`. |
| Route Decision | `allowed: false` with a route guard reason. |
| Contract parse | Missing or invalid `zj-loop.post-merge-contract`; report evidence still records no planned actions. |
| Contract validation | Branch mismatch, fork/unknown repo, protected branch, missing carrier issue, or pending follow-up guard. |
| Closeout plan | `status: report-only` and `actions: []`. |
| Executor dry-run | `status: dry-run`, exact actions, and `side_effects_executed: false`. |
| Executor live | Requires `--live`; records step-by-step command evidence and closes only the contract carrier issue. |
| Side effects | Refuse before any command when contract or executor guards fail. |

## Closeout Decision Audit

| Decision | Classification | Durable home |
| --- | --- | --- |
| Canonical chain wording is `Merged PR Signal -> Route Decision -> Post-Merge Roadmap Closeout Report Evidence`. | durable doc | This test case and `zj-loop/ZJ-LOOP.md`. |
| The local replay input is a merged PR signal, not a Daily Triage signal or issue comment. | durable doc | This test case. |
| Report evidence belongs in the merged PR comment thread for live dogfood; local replay emits JSON only. | durable doc | This test case. |
| Route/report evidence uses `report-only`; closeout plan uses `dry-run` when the contract is valid. | durable doc | This test case and replay tests. |
| Live cleanup is not part of Route Decision. It is an explicit executor invoked after a valid dry-run and operator approval. | durable doc | This test case and `scripts/post-merge-roadmap-closeout.mjs`. |
| The executor may close only the activation carrier issue named in the valid contract. Ordinary linked issues are out of scope. | durable doc | This test case and executor tests. |
