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
`dependency-sweeper` are covered by protocol fixtures and can be enabled as
separate dogfood slices.

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
node --test scripts/report-only-route-dispatcher.test.mjs scripts/pr-steward-report-e2e-replay.test.mjs scripts/changelog-drafter-report-e2e-replay.test.mjs scripts/dependency-sweeper-route-e2e-replay.test.mjs scripts/issue-fix-request-contract.test.mjs scripts/issue-fix-request-dispatcher.test.mjs scripts/issue-fix-request-e2e-replay.test.mjs scripts/roadmap-activation-e2e-replay.test.mjs scripts/roadmap-activation-dispatcher.test.mjs
node --test scripts/post-merge-roadmap-closeout-contract.test.mjs scripts/post-merge-roadmap-closeout-e2e-replay.test.mjs
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
- `changelog-drafter-report` is implemented as a release-prep report-only
  route:
  `Merged PR Batch / Manual Release Prep -> Route Decision -> Changelog Draft Evidence`.
  Local replay writes JSON only and records `zj-loop/changelog-drafter-state.md`
  as the evidence target; it does not generate release notes, edit changelogs,
  create PRs, tag, release, publish packages, dispatch workflows, or start
  consumer work. Breaking/security/oversized windows require human review before
  drafting.
- `pr-steward-fix-request` is enabled as a bounded Issue Fix Request route for
  failed GitHub status/check rollups on non-draft PRs targeting `main`.
  Local replay creates or dedupes an independent request issue only; it does
  not claim, repair, write PR comments, label, rebase, merge, or dispatch
  workflows.
- Daily Triage is wired to create a real Issue Fix Request carrier issue before
  dispatching CI Sweeper.
- `dependency-sweeper` is enabled as a bounded Issue Fix Request route:
  `Dependency Alert -> Route Decision -> Issue Fix Request -> Dependency Sweeper`.
  Local replay stops at requested, duplicate, or denied. It does not run
  Dependency Sweeper, edit package manifests, update lockfiles, open Fix PRs, or
  auto-merge.
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

### Post-Merge (report-only roadmap closeout)
- Trigger: merged Roadmap-Sliced PR signal with a PR body
  `zj-loop.post-merge-contract`.
- Route: `post-merge-roadmap-closeout` in `zj-loop/zj-loop-route-table.yaml`.
- Current mode: local deterministic replay and report evidence only.
- Boundary: no branch deletion, carrier issue closure, GitHub comment write, or
  workflow dispatch until a later explicit roadmap enables side effects.

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
