# Post-Merge Roadmap Closeout E2E Test Cases

These test cases verify the report-only post-merge route:

```text
Merged PR Signal -> Route Decision -> Post-Merge Roadmap Closeout Report Evidence
```

This is a Post-Merge Cleanup `roadmap-closeout` mode for Roadmap-Sliced
Development PRs. It is not a generic PR cleanup loop and not an auto-merge path.

## Scope

The local replay proves that a merged PR signal can be routed through the
dogfood route table, parse the PR body `zj-loop.post-merge-contract`, and
produce reviewable report evidence plus a closeout plan.

The current implementation is intentionally report-only:

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
node --test scripts/post-merge-roadmap-closeout-contract.test.mjs scripts/post-merge-roadmap-closeout-e2e-replay.test.mjs
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

## Real GitHub Dogfood

Do not manufacture a synthetic merged PR only to create evidence. The first live
dogfood run should use a real Roadmap-Sliced Development PR whose body contains
the `Post-Merge Contract` block before merge.

After that PR merges, append evidence to the merged PR comment thread:

- Route Decision
- contract validation result
- closeout plan
- `side_effects_executed: false`
- next step for enabling side effects under a later explicit roadmap

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
| Side effects | Always false in this replay; enabling them requires a later explicit roadmap. |

## Closeout Decision Audit

| Decision | Classification | Durable home |
| --- | --- | --- |
| Canonical chain wording is `Merged PR Signal -> Route Decision -> Post-Merge Roadmap Closeout Report Evidence`. | durable doc | This test case and `zj-loop/ZJ-LOOP.md`. |
| The local replay input is a merged PR signal, not a Daily Triage signal or issue comment. | durable doc | This test case. |
| Report evidence belongs in the merged PR comment thread for live dogfood; local replay emits JSON only. | durable doc | This test case. |
| Route/report evidence uses `report-only`; closeout plan uses `dry-run` when the contract is valid. | durable doc | This test case and replay tests. |
| This slice does not enable branch deletion or carrier issue closure. | durable doc | This test case and `zj-loop/zj-loop-route-table.yaml`. |
