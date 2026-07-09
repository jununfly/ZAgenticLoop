# User Project Execution-Ready Bundle

This document explains the first ZAgenticLoop workflow-dispatch bundle that is
intended to be useful in ordinary user projects, not only in this repository's
dogfood environment.

The bundle is installed with:

```bash
npx @jununfly/zj-loop-init . --add github-actions
```

It creates generated `zj-loop-*.yml` workflows and relies on the project Route
Table at `zj-loop/zj-loop-route-table.yaml`. The Route Table is the control
plane: it decides which routes are enabled, what side effects are allowed, and
which fixed confirmation phrase is required before a route can act.

## First Execution-Ready Route Set

The first route set is deliberately small:

| Route | User story | Default behavior | Live boundary |
| --- | --- | --- | --- |
| `roadmap-sliced-development` | A maintainer comments `/zj-loop start roadmap-sliced-development` on a plan issue and gets a bounded roadmap branch/PR bootstrap. | Disabled until explicitly enabled. Generated workflow can produce activation, contract, and bounded-slice evidence. | Activation can create the roadmap lifecycle. Slice execution is bounded by `max_slices`, default `30`, and Roadmap-Sliced gates. |
| `ci-sweeper` | A failing workflow can become a durable GitHub Issue Fix Request instead of disappearing in Actions history. | Disabled until explicitly enabled. Generated workflow records Route Decision and consumer plan evidence. | When allowed, it creates an independent Issue Fix Request carrier for bounded fix-runner consumption or escalation. |
| `issue-backlog-triage` -> `issue-triage-transition` | Open issue backlog signals become recommended `zj-triage` transitions, then maintainer/collaborator confirmation produces dry-run transition evidence and `ready-for-agent` Issue Fix Request plans. | Recommendation evidence is report-only. Confirmed transition requires an exact request id and fixed confirmation phrase. | No live tracker mutation yet. The useful boundary is dry-run transition evidence plus a replayable Issue Fix Request plan. |
| `post-merge-roadmap-closeout` | After a Roadmap-Sliced PR is merged, cleanup can be planned and, with explicit confirmation, close only the activation carrier and delete only the merged roadmap branch. | Dry-run by default. | Live cleanup requires the fixed phrase `DELETE_MERGED_ROADMAP_BRANCH_AND_CLOSE_CARRIER` and valid post-merge contract guards. |

All other action-capable routes remain selectable future paths, but should not
be described as user-project execution-ready unless their generated workflow and
published package runner have equivalent evidence.

## Human-Readable First Run

After installing the bundle:

1. Run `ZJ Loop Smoke` manually.
2. Inspect the workflow summary.
3. Run:

```bash
npx --yes --package @jununfly/zj-loop-core@0.1.3 zj-loop-route status
```

The status output is the route menu. Use it to choose the first route instead of
assuming every generated workflow should run live.

## Enablement Commands

Enable side-effecting routes only when their row has the expected maturity and
you accept the side-effect boundary:

```bash
npx --yes --package @jununfly/zj-loop-core@0.1.3 zj-loop-route enable roadmap-sliced-development --confirm "enable roadmap-sliced-development side effects"
npx --yes --package @jununfly/zj-loop-core@0.1.3 zj-loop-route enable ci-sweeper --confirm "enable ci-sweeper side effects"
npx --yes --package @jununfly/zj-loop-core@0.1.3 zj-loop-route enable post-merge-roadmap-closeout --confirm "enable post-merge-roadmap-closeout side effects"
```

Disable stays low-friction:

```bash
npx --yes --package @jununfly/zj-loop-core@0.1.3 zj-loop-route disable ci-sweeper
```

## Roadmap Activation Path

Use this path when an issue is a PRD, plan, or multi-slice initiative.

1. A maintainer or collaborator comments:

```text
/zj-loop start roadmap-sliced-development
```

2. The activation workflow validates authorization, duplicate comments, route
   enablement, and loop-prevention markers.
3. It creates append-only Activation Request evidence.
4. It creates a Roadmap-Sliced branch/PR contract and bounded-slice pack.
5. Roadmap-Sliced Development consumes the explicit issue/request id and owns
   branch, process roadmap, implementation slices, verification, and PR handoff.

Bounded execution uses `max_slices`, default `30`. This is an execution guard,
not a roadmap storage window. Do not introduce window/cursor semantics until
that feature exists in the roadmap tooling.

## CI Sweeper Path

Use this path when a workflow failure should become reviewable repair work.

1. A configured workflow fails.
2. `zj-loop-ci-sweeper` checks Route Decision and consumer gates.
3. If the route is allowed, it creates a GitHub Issue Fix Request with a
   parseable request comment.
4. A fix consumer may later claim the request only when route allowlist,
   request verifier requirements, consumer capabilities, and evidence match.
5. The bounded completion form is a repair PR or escalation issue.

The generated workflow should not hide failures in workflow logs only. The
durable GitHub issue carrier is what makes the problem auditable and replayable.

## Issue Backlog Triage Path

Use this path when open issues should become actionable triage evidence without
batch-editing the tracker.

1. `issue-backlog-triage` records allowed issue backlog observations and emits
   `zj-loop.recommended_triage_transition.v1` evidence.
2. A maintainer or collaborator confirms a specific request:

```text
/zj-loop confirm-triage-transition <request-id>
```

3. The confirmation path also requires the fixed workflow phrase
   `CONFIRM_TRIAGE_TRANSITION`.
4. `issue-triage-transition` plans `zj-triage` role/comment side effects and,
   for `ready-for-agent`, plans an Issue Fix Request for downstream consumer
   routing.

This route is execution-ready as a dry-run bridge. It must not mutate labels,
write public comments, close issues, assign owners, set milestones, or start
consumer work until a future promotion explicitly adds live side effects and
new dogfood evidence.

## Post-Merge Closeout Path

Use this path after Roadmap-Sliced PRs carry a valid
`zj-loop.post-merge-contract`.

1. The workflow can always produce closeout-plan evidence.
2. Live cleanup is optional and requires:
   - a merged PR
   - a valid post-merge contract
   - a matching carrier issue
   - a merged `zjal/` roadmap branch
   - the fixed confirmation phrase
3. The executor may delete only the contract-named merged roadmap branch and
   may close only the contract-named activation carrier issue.

This is a narrow exception, not a general issue close or branch cleanup tool.

## Release Gate

Before publishing a bundle release, run:

```bash
npm run test:generated-bundle-release-gate
bash scripts/ci-validate-gates.sh
```

The generated-bundle gate checks template/workflow drift, package pins, Route
Table route existence, action-capable route readiness, and the Roadmap
Activation fixture. `ci-validate-gates.sh` remains the broader repository
validation gate.
