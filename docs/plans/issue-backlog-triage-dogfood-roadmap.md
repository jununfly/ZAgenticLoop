# Issue Backlog Triage Dogfood Roadmap

Activation request: `act-70-ic-kwdotjxusc8aaaabjygahg-8c94c5b9`

Carrier issue: https://github.com/jununfly/ZAgenticLoop/issues/70

Original issue: https://github.com/jununfly/ZAgenticLoop/issues/7

Branch: `zjal/act-70-ic-kwdotjxusc8aaaabjygahg-8c94c5b9-issue-backlog-triage-dogfood`

## Scope

Consume the `issue-backlog-triage` dogfood Issue Fix Request through
Roadmap-Sliced Development, then implement the bounded #7 product gap through
reviewable leaf slices.

## Parent Node

### p1-prd-next-command-handoff

Completion condition: all child leaf nodes are completed, deferred, or linked as
follow-up, and the durable decision is captured before closeout.

Leaf nodes:

| Leaf | Status | Commit intent |
| --- | --- | --- |
| `1-1-design-current-handoff-gap` | completed | Record the observed product gap and target behavior before implementation. |
| `1-2-implement-next-command-surfacing` | completed | Expose the next command in the appropriate PRD issue flow without broadening report-only defaults. |
| `1-3-verify-and-document-dogfood` | completed | Prove the route chain remains replayable and side-effect boundaries are clear. |

## Leaf 1-1 Findings

Issue #7 reports a real dogfood gap from
`jununfly/ZCodeGraph#678`: the next implementation command was visible in local
triage state, but not on the PRD issue that serves as the handoff object.

Current behavior:

- `.github/workflows/daily-triage.yml` writes `zj-loop/STATE.md`, run-log
  evidence, CI route evidence, and CI Sweeper Issue Fix Requests.
- `patterns/daily-triage.md` keeps Daily Triage report-only by default and
  treats `zj-loop/STATE.md` as triage memory, not an activation queue.
- `issue-backlog-triage` and `issue-triage-transition` can recommend and confirm
  `ready-for-agent` transitions, then create independent Issue Fix Request
  carriers, but they do not define a PRD next-command handoff comment.

Implementation target for leaf `1-2`:

- Preserve report-only defaults.
- Produce an exact manual `gh issue comment ...` command when PRD issue comments
  are disabled.
- Allow live PRD issue commenting only behind explicit opt-in.
- Use a deterministic marker and stable body shape so repeated runs can skip or
  update instead of spamming.
- Make output explicit about where the handoff lives: local state, PRD issue
  comment, or both.

Verification evidence:

- `gh issue view 7 --comments --json number,title,body,comments,url,labels,state`
- `rg "next command|next-command|handoff|PRD|prd|zj-to-prd|to-prd|Issue Fix Request|roadmap-sliced-development|confirm-triage-transition" -n README.md README.zh-CN.md docs patterns scripts tools .github zj-loop`
- `sed -n '1,240p' .github/workflows/daily-triage.yml`
- `sed -n '1,220p' patterns/daily-triage.md`

## Leaf 1-2 Implementation Notes

Implemented a deterministic PRD handoff planner in `@jununfly/zj-loop-core`:

- CLI: `zj-loop-prd-handoff handoff-plan`
- API: `runPrdHandoffRunner`
- Marker: `<!-- zj-loop:prd-next-command-handoff -->`
- Default mode: `report-only`

The planner emits:

- stable comment body
- exact manual `gh issue comment ...` command
- handoff locations (`local-report`, `manual-gh-command`, or
  `prd-issue-comment`)
- idempotency policy
- side-effect audit showing no GitHub write was executed by the planner

Documentation updates:

- `patterns/daily-triage.md`
- `docs/QUICKSTART.md`
- `README.md`
- `README.zh-CN.md`

Verification evidence:

- `cd tools/zj-loop-core && npm test`
- `npm run test:generated-bundle-release-gate`
- `node --test scripts/validate-release-workflows.test.mjs`
- `npm run validate:registry`
- `node tools/zj-loop-core/dist/prd-handoff-cli.js handoff-plan --prd-issue-url https://github.com/jununfly/ZCodeGraph/issues/678 --next-command "Ask Codex: Run the roadmap-sliced-development loop for ZCodeGraph issue #678." --json`
- `git diff --check`

## Leaf 1-3 Dogfood Evidence

Durable dogfood documentation now includes the PRD Handoff Planner in
`docs/designs/dogfood-reference-case.md` and records Daily Triage's report-only
handoff behavior.

Live chain evidence:

- Issue Fix Request carrier: https://github.com/jununfly/ZAgenticLoop/issues/70
- Activation request comment: https://github.com/jununfly/ZAgenticLoop/issues/70#issuecomment-4924234140
- Activation consumed comment: https://github.com/jununfly/ZAgenticLoop/issues/70#issuecomment-4924293521
- Roadmap Activation draft PR: https://github.com/jununfly/ZAgenticLoop/pull/71

## Gates

- Branch: use the roadmap branch named above.
- Leaf gate: each leaf records status, notes, and verification evidence before commit.
- Commit intent: default one commit per leaf unless a recorded exception applies.
- Evidence before commit: verification evidence is committed with the slice state.
- Gate-backed status: `completed` requires recorded passing evidence.
- Decision audit: durable decisions are moved into durable docs or PR notes before closeout.
- Separate closeout commit: process roadmap cleanup is separate from implementation commits.

## Closeout

Before merge, delete or migrate these process files after durable docs and the
PR body absorb the necessary decisions. The post-merge closeout contract may
delete the merged branch and close only carrier issue #70 if all guards pass.
