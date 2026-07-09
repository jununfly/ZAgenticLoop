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
| `1-1-design-current-handoff-gap` | pending | Record the observed product gap and target behavior before implementation. |
| `1-2-implement-next-command-surfacing` | pending | Expose the next command in the appropriate PRD issue flow without broadening report-only defaults. |
| `1-3-verify-and-document-dogfood` | pending | Prove the route chain remains replayable and side-effect boundaries are clear. |

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
