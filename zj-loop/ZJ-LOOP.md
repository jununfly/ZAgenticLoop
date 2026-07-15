# zj-loop/ZJ-LOOP.md — ZAgenticLoop Reference

This file documents how the **zagenticloop** reference repository is operated with agentic loop working patterns.

The goal of this repo is to be the canonical, copyable, high-signal collection of patterns, starters, and tooling. It eats its own dogfood aggressively.

## Active Loops

### Daily Triage (L1 — automated producer + report)
- Cadence: 1d weekdays (`/.github/workflows/daily-triage.yml`)
- Skill: `zj-loop-triage` (from `skills/` and `starters/minimal-loop`)
- State: `zj-loop/STATE.md` (updated by workflow; human reviews weekly issue)
- Route table: `zj-loop/zj-loop-route-table.yaml`
- Phase: Report + Signal producer. Route Dispatcher owns Route Decision and
  request creation. Human reviews and decides actions.
- Handoff: Design decisions, large refactors, new pattern acceptance.

### PR Steward (L2 — assisted, manual trigger)
- Cadence: 10–15m during active hours (maintainer `/loop` or future Action)
- Starter: `starters/pr-steward` (Grok, Claude Code, Codex)
- Worktrees for suggested fixes; verifier required; no auto-merge by default.

### Dependency Sweeper (L2 — patch-only)
- Cadence: 6h–1d
- Starter: `starters/dependency-sweeper`
- Patch + low-risk CVE only for first 30 days
- Verifier = full `npm ci && npm test` in worktree
- Human gate on majors and denylisted packages

### CI Sweeper (L2 — route-dispatched deterministic repair)
- Trigger: `daily-triage.yml` dispatches `.github/workflows/ci-sweeper.yml`
  when latest `validate-patterns` or `audit` run failed, the Route Dispatcher
  creates an `issue-fix-request`, and the route table enables `ci-sweeper`.
- State: `zj-loop/ci-sweeper-state.md`.
- Action: run deterministic build/bundle repair plan, rerun gates, open a PR
  only when non-state repair diffs exist and repair/validate/audit gates all
  pass.
- Handoff: if no deterministic repair exists or gates still fail, open/update an
  escalation issue.
- Boundary: not a general-purpose coding agent yet; no auto-merge.

## Route / Request Dogfood

Canonical fix chain:

```text
Signal -> Route Decision -> Issue Fix Request -> Fix Consumer -> Fix PR
```

This repo keeps Route Table policy in `zj-loop/zj-loop-route-table.yaml`.
`ci-sweeper` is the first live allowlisted Fix Consumer. `pr-steward` and
`dependency-sweeper` now have replayed live runners but remain `claim-only`
until workflow-dispatch dogfood evidence supports live promotion.

Roadmap-Sliced Development is intentionally separate: it consumes
`activation-comment` requests, not Issue Fix Requests. The dogfood route is:

```text
Daily Triage Signal -> Route Decision -> Activation Request -> Roadmap-Sliced Development -> Roadmap Branch/PR
```

Daily Triage does not create roadmap artifacts. The Route Dispatcher appends the
activation request, and Roadmap-Sliced Development consumes an explicit issue or
request id.

Local gates:

```bash
node --test scripts/report-only-route-dispatcher.test.mjs scripts/issue-backlog-triage-e2e-replay.test.mjs scripts/issue-triage-action-runner.test.mjs scripts/pr-steward-report-e2e-replay.test.mjs scripts/pr-steward-fix-request-e2e-replay.test.mjs scripts/pr-steward-claim-e2e-replay.test.mjs scripts/pr-steward-live-runner.test.mjs scripts/changelog-drafter-report-e2e-replay.test.mjs scripts/changelog-drafter-draft-request-e2e-replay.test.mjs scripts/changelog-drafter-live-runner.test.mjs scripts/dependency-sweeper-route-e2e-replay.test.mjs scripts/dependency-sweeper-claim-e2e-replay.test.mjs scripts/dependency-sweeper-live-runner.test.mjs scripts/issue-fix-request-contract.test.mjs scripts/issue-fix-request-dispatcher.test.mjs scripts/issue-fix-request-e2e-replay.test.mjs scripts/roadmap-activation-e2e-replay.test.mjs scripts/roadmap-activation-dispatcher.test.mjs scripts/live-runner-contract.test.mjs
node --test scripts/post-merge-roadmap-closeout-contract.test.mjs scripts/post-merge-roadmap-closeout-e2e-replay.test.mjs scripts/post-merge-roadmap-closeout.test.mjs scripts/validate-post-merge-closeout-workflow.test.mjs
```

Current dogfood status:

- Local replay and validate/audit gates are the hard verification gate.
- `human`, `ignore`, and `daily-triage-report` are implemented as
  `report-only` Route Decisions that create report evidence only. Allowed
  report-only decisions close immediately with `status: closed`.
- `pr-steward-report` is implemented as a PR event report-only route:
  `Pull Request Event -> Route Decision -> PR Steward Report Evidence`.
  Local replay writes JSON only and records `zj-loop/pr-steward-state.md` as
  the evidence target; no PR comments, labels, rebases, merges, Issue Fix
  Requests, workflow dispatches, or consumer work are created.
- `issue-backlog-triage` is implemented as an issue/discussion backlog
  report-only route:
  `GitHub/GitLab Issues Backlog -> Route Decision -> Recommended Triage Transition Evidence`.
  Local replay writes JSON only and records `zj-loop/issue-triage-state.md` as
  the evidence target; accepted issue-specific signals include fixed
  `zj-loop.recommended_triage_transition.v1` contracts with request ids,
  confirmation commands, recommended `zj-triage` state roles, and brief drafts.
  Allowed observations are fixed to
  `missing-info-observation`, `possible-duplicate-observation`,
  `label-suggestion-observation`, `human-attention-candidate`, and
  `issue-backlog-summary`. It does not write public comments, mutate labels,
  assign issues, change milestones, close/reopen issues, perform formal
  lifecycle transitions, batch-mutate the issue tracker, create Issue Fix
  Requests, or start consumer work.
- `issue-triage-action` is implemented as a separate dry-run action consumer:
  `Issue Backlog Triage Evidence -> Triage Action Request -> Issue Triage Action Evidence`.
  It accepts only allowlisted labels and fixed comment templates, refuses live
  issue mutation, rejects unsupported/freeform actions, and escalates hard
  human-guard cases. It must not be folded back into `issue-backlog-triage`.
- `issue-triage-transition` is implemented as a separate request-only confirmed
  transition consumer:
  `Recommended Triage Transition -> Confirmed Triage Transition -> Source Issue Fix Request Comment`.
  It requires maintainer/collaborator permission, the exact
  `/zj-loop confirm-triage-transition <request-id>` command, and fixed
  `CONFIRM_TRIAGE_TRANSITION` workflow confirmation phrase. It creates or
  dedupes `ready-for-agent` Issue Fix Request comments on the source issue by
  default. Independent Issue Fix Request issues are narrow exceptions and must
  explain why the source issue cannot carry the lifecycle. It does not mutate
  source issue labels/state live.
- `changelog-drafter-report` is implemented as a release-prep report-only
  route:
  `Merged PR Batch / Manual Release Prep -> Route Decision -> Changelog Draft Evidence`.
  Local replay writes JSON only and records `zj-loop/changelog-drafter-state.md`
  as the evidence target; it does not generate release notes, edit changelogs,
  create PRs, tag, release, publish packages, dispatch workflows, or start
  consumer work. Breaking/security/oversized windows require human review before
  drafting.
- `changelog-drafter-draft-request` is implemented as a report-only follow-up
  route:
  `Release Window Evidence -> Route Decision -> Changelog Draft Request Evidence -> Changelog Drafter`.
  It requires existing `changelog-drafter-report` evidence, dedupes with
  `draft-request:<report.dedupe_key>`, and records candidate evidence only. It
  does not introduce a general `draft-request` request kind, generate
  `RELEASE_NOTES_DRAFT.md`, edit changelogs, create changelog PRs, dispatch
  workflows, tag, release, publish packages, or start consumer work.
  `scripts/changelog-drafter-live-runner.mjs` can replay draft evidence, draft
  PR, or escalation outcomes, but the route remains report-only until
  workflow-dispatch dogfood evidence exists.
- `pr-steward-fix-request` is enabled as a bounded Issue Fix Request route for
  failed GitHub status/check rollups on non-draft PRs targeting `main`.
  Local replay creates or dedupes an independent request issue only; it does
  not repair, write PR comments, label, rebase, merge, or dispatch workflows.
  Claim replay covers `requested -> consumed` for matching PR Steward requests
  with verifier gates and a current PR head SHA match. Claim evidence belongs
  on the independent Issue Fix Request lifecycle comments; `consumed` does not
  start repair, create a branch, open a Fix PR, or enable auto-merge.
  `scripts/pr-steward-live-runner.mjs` can replay repair PR or escalation
  evidence after claim, but the route is not live until workflow-dispatch
  dogfood evidence exists.
- Daily Triage is wired to create a real Issue Fix Request carrier issue before
  dispatching CI Sweeper.
- `dependency-sweeper` is enabled as a bounded Issue Fix Request route:
  `Dependency Alert -> Route Decision -> Issue Fix Request -> Dependency Sweeper`.
  Request replay covers requested, duplicate, or denied. Claim replay covers
  `requested -> consumed` for matching Dependency Sweeper requests with verifier
  gates. It does not run Dependency Sweeper repair, edit package manifests,
  update lockfiles, create branches, open Fix PRs, dispatch workflows, or
  auto-merge.
  `scripts/dependency-sweeper-live-runner.mjs` can replay repair PR or
  escalation evidence after claim, but the route is not live until
  workflow-dispatch dogfood evidence exists.
- `roadmap-sliced-development` is enabled in the route table as an
  `activation-comment` route and covered by local activation replay.
- Roadmap activation dogfood evidence has been captured:
  - Synthetic activation carrier:
    https://github.com/jununfly/ZAgenticLoop/issues/19
  - Activation request:
    https://github.com/jununfly/ZAgenticLoop/issues/19#issuecomment-4892983991
  - Route Decision:
    https://github.com/jununfly/ZAgenticLoop/issues/19#issuecomment-4893003970
  - Activation consumed:
    https://github.com/jununfly/ZAgenticLoop/issues/19#issuecomment-4893007904
- Report-only Route Decision dogfood evidence has been captured:
  - Issue Slash Command carrier:
    https://github.com/jununfly/ZAgenticLoop/issues/21
  - Activation request:
    https://github.com/jununfly/ZAgenticLoop/issues/21#issuecomment-4893268445
  - Activation Route Decision:
    https://github.com/jununfly/ZAgenticLoop/issues/21#issuecomment-4893272307
  - Activation consumed:
    https://github.com/jununfly/ZAgenticLoop/issues/21#issuecomment-4893302147
  - Local report-only decisions:
    `rd_report_37f23ba8d291`, `rd_report_608d990bd18f`,
    `rd_report_8a9f213d1057`
- CI Sweeper records the request issue URL in state, Fix PR body, and
  escalation issue body.
- `post-merge-roadmap-closeout` is enabled as a report-only route. Local replay
  proves:
  `Merged PR Signal -> Route Decision -> Post-Merge Roadmap Closeout Report Evidence`.
  The replay emits JSON only; live dogfood evidence belongs in the merged PR
  comment thread after a real Roadmap-Sliced PR with a `Post-Merge Contract`
  merges.
- Live external evidence has been captured:
  - Daily Triage no-signal run:
    https://github.com/jununfly/ZAgenticLoop/actions/runs/28790602470
  - Synthetic Issue Fix Request carrier:
    https://github.com/jununfly/ZAgenticLoop/issues/17
  - CI Sweeper no-diff escalation run:
    https://github.com/jununfly/ZAgenticLoop/actions/runs/28790735629
  - Escalation issue:
    https://github.com/jununfly/ZAgenticLoop/issues/18

### Post-Merge (guarded roadmap closeout)
- Trigger: merged Roadmap-Sliced PR signal with a PR body
  `zj-loop.post-merge-contract`.
- PR handoff authoring: generate the complete PR body with
  `npm run roadmap-handoff:body`; do not hand-author a partial contract block.
  The deterministic generator emits the required
  `kind/version/consumer/mode/roadmap/carrier/cleanup/safety` object, which is
  the only contract shape the closeout parser accepts.
- Route: `post-merge-roadmap-closeout` in `zj-loop/zj-loop-route-table.yaml`.
- Current mode: Route Decision remains report-only; the executor may perform
  live cleanup after a valid merged-PR contract and all guards pass.
- Automatic dry-run: `.github/workflows/post-merge-roadmap-closeout.yml`
  comments script-generated evidence on merged PRs and uploads the full JSON
  plan as an artifact.
- Main live path:
  `npm run post-merge-closeout -- --pr <number> --repo jununfly/ZAgenticLoop --carrier-issue <issue> --live`.
- Optional live workflow dispatch requires the fixed confirmation phrase
  `DELETE_MERGED_ROADMAP_BRANCH_AND_CLOSE_CARRIER`.
- Current GitHub live evidence: [PR #133](https://github.com/jununfly/ZAgenticLoop/pull/133)
  passed all guards, deleted only its named merged `zjal-` branch, and closed
  only carrier [#131](https://github.com/jununfly/ZAgenticLoop/issues/131).
  [PR #132](https://github.com/jununfly/ZAgenticLoop/pull/132) records the
  paired fail-closed refusal for a partial contract.
- Boundary: the executor may delete only the merged `zjal-` roadmap branch named
  in the valid contract and close only the contract carrier issue after writing
  closeout evidence. Historical `zjal/` branches remain accepted for closeout
  compatibility. It is not a generic PR cleanup agent.

### Changelog Drafter (L1 — draft only, high value)
- Cadence: 1d or on release prep (manual or tag-triggered)
- Starter: `starters/changelog-drafter`
- Produces `RELEASE_NOTES_DRAFT.md` (or section for GitHub release). Human approves before publish or CHANGELOG update.
- Excellent low-risk companion to Post-Merge Cleanup. This reference repo should run it for future releases.

## Multi-loop coordination

See [docs/multi-loop.md](docs/multi-loop.md). Priority: CI Sweeper → PR Steward → Dependency Sweeper → Post-Merge / Changelog Drafter (off-peak) → Daily Triage (report/producer).

## Worktrees

- Any unattended code-change experiment runs in an **isolated git worktree** per attempt.
- One worktree per fix; discard after verifier REJECT or human escalation.

## Connectors (MCP)

- Optional for L1 daily triage — see [examples/mcp/](examples/mcp/)
- GitHub MCP read-only for issue/PR discovery
- Scope connectors to read + comment until the loop is trusted

## Budget & Observability

- Token caps: `zj-loop/zj-loop-budget.md`
- Run history: `zj-loop/zj-loop-run-log.md` (appended each weekday run by `daily-triage.yml`)
- Estimate: `npx @jununfly/zj-loop-cost --pattern daily-triage`
- Kill switch: `loop-pause-all` label or flag in `zj-loop/STATE.md`

## Safety & Gates (this repo)

- No auto-merge on main except trivial dependency patches (allowlist + verifier)
- Denylist: showcase HTML/CSS, core primitives docs, audit scoring logic without human review
- Live loop state: `zj-loop/STATE.md` at repo root

## How to run locally

```bash
node tools/zj-loop-audit/dist/cli.js . --suggest
npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok  # after npm publish
bash scripts/before-after-demo.sh
```

## Evolution

Journey recorded in `stories/`. Target: solid L2 with excellent observability.

---

*This file is both documentation and the seed for the loops that maintain the reference.*
