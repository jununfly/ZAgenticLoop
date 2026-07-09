# Dogfood Reference Case

This document records how the ZAgenticLoop repository uses its own loop
patterns, tools, route contracts, and workflow wiring as a reference case. It is
for maintainers who need a durable map of what is actively dogfooded and what is
only protocol evidence.

Operational run details, one-off evidence links, and current live status belong
in `zj-loop/ZJ-LOOP.md`, workflow runs, issues, PRs, and consumer-owned state
files. This document keeps the stable dogfood capability map.

Route consumer execution vocabulary, maturity levels, hard gates, capability
matching, and completion forms are defined in
[`route-consumer-execution-architecture.md`](route-consumer-execution-architecture.md).

## Purpose

The reference repo should not only describe Agentic Loop Working. It should run
enough of its own loop system to catch drift between:

- pattern documents and `patterns/registry.yaml`
- starter scaffolds and `zj-loop-init`
- readiness scoring and real repo artifacts
- route table policy and cross-loop dispatch boundaries
- workflow automation and canonical `zj-loop/*` state paths
- published package metadata and local monorepo source

The setup is deliberately layered. Some paths are scheduled workflows, some are
workflow-dispatched consumers, some are report-only replay evidence, and some
are guarded live operations that require explicit operator intent.

## Dogfood Capability Map

| Area | Configuration | Current capability level | Boundary |
| --- | --- | --- | --- |
| Loop Readiness Audit | `.github/workflows/audit.yml`, `scripts/ci-audit-gates.sh`, `tools/zj-loop-audit` | Push, PR, and scheduled gate | Proves this repo and starters meet readiness gates; does not change product code. |
| Validate Patterns & Registry | `.github/workflows/validate-patterns.yml`, `scripts/ci-validate-gates.sh` | Push and PR gate | Keeps pattern docs, registry, starters, release workflows, route replays, and tool package tests aligned. |
| Workflow-Dispatch User Bundle | `.github/workflows/zj-loop-*.yml`, `templates/github-actions/`, `zj-loop-init --add/--upgrade github-actions` | Generated bundle smoke plus Route Table-controlled consumers | Proves user-project generated workflows install cleanly, carry metadata/hash evidence, pin package versions, and run through Route Decision instead of embedding local dogfood scripts. Manual smoke is the default safe path; side-effecting consumers require explicit Route Table enablement. |
| Daily Triage | `.github/workflows/daily-triage.yml`, `zj-loop/STATE.md`, `zj-loop/zj-loop-run-log.md` | Scheduled producer plus generated state PR | Updates operational memory, emits route candidates, and may dispatch allowlisted consumers. Its generated state PR auto-merge is a narrow exception limited to loop state/run-log files. |
| CI Sweeper | `.github/workflows/ci-sweeper.yml`, `zj-loop/zj-loop-route-table.yaml`, `zj-loop/ci-sweeper-state.md` | Live dogfooded `fix-runner` | Handles validate/audit failures only. Completion forms are `repair-pr` when deterministic repair creates non-state diffs and repair/validate/audit gates pass, or `escalation-issue` otherwise. |
| Route Decision replay suite | `scripts/*route*replay*.mjs`, `scripts/*dispatcher*.mjs`, `scripts/*contract*.mjs` | Local deterministic protocol evidence | Proves route decisions, request creation, duplicate suppression, denials, claims, and recovery paths without requiring live GitHub side effects. |
| Roadmap activation | `roadmap-activation-dispatcher.mjs`, `zj-loop-activation-contract.mjs`, route table `roadmap-sliced-development` row, `zj-loop/roadmap-activation-state.md` | Live issue-triggered activation-comment route | Authorized slash commands create append-only activation requests only. Route Table truth is `consumer_kind: activation-consumer`, `execution.mode: live`, and `maturity.runner: dogfooded`; Roadmap-Sliced Development consumes explicit issue/request ids and owns branch, roadmap, implementation, verification, and PR handoff. |
| PR Steward routes | PR Steward report/fix-request/claim replay scripts, replayed live runner, `zj-loop/pr-steward-state.md` | Report-only plus claim-only route with replayed repair/escalation runner | Report routes do not comment, label, rebase, merge, dispatch workflows, repair, or open Fix PRs. Fix request Route Table truth is `consumer_kind: fix-runner`, `execution.mode: claim-only`, and `maturity.runner: replayed`; claim evidence consumes a request, and the replayed runner can produce independent `repair-pr` / `escalation-issue` evidence without mutating the source PR. |
| Issue Backlog Triage route | Issue backlog triage replay scripts and `zj-loop/issue-triage-state.md` | Report-only protocol evidence | Records allowed issue observations and recommended triage transitions only. It must not perform formal issue lifecycle transitions, public comments, labels, assignments, milestones, close/reopen, Issue Fix Request creation, or batch mutation in recommendation mode. |
| Issue Triage transition route | `tools/zj-loop-core/src/issue-triage-transition-runner.ts`, route table `issue-triage-transition` row, `zj-loop/issue-triage-state.md` | Dry-run confirmed-transition consumer with replayed runner | Consumes fixed recommended transition requests after maintainer/collaborator confirmation, plans `zj-triage` role/comment side effects, and for `ready-for-agent` plans an Issue Fix Request. Route Table truth is `execution.mode: dry-run`, `maturity.runner: replayed`; live tracker mutation is refused until explicit promotion. |
| Issue Triage action route | `scripts/issue-triage-action-runner.mjs`, route table `issue-triage-action` row, `zj-loop/issue-triage-state.md` | Dry-run action consumer with replayed runner | Separate `triage-action-consumer` route for allowlisted labels and fixed comment templates. Route Table truth is `execution.mode: dry-run`, `maturity.runner: replayed`; live issue mutation is refused until workflow-dispatch dogfood evidence supports explicit promotion. |
| Dependency Sweeper routes | Dependency route/claim replay scripts, replayed live runner, `zj-loop/dependency-sweeper-state.md` | Claim-only route with replayed repair/escalation runner | Supports bounded request and claim lifecycle evidence plus replayed `repair-pr` / `escalation-issue` live-runner evidence. Route Table truth remains `consumer_kind: fix-runner`, `execution.mode: claim-only`, and `maturity.runner: replayed`; automatic routing does not edit manifests, update lockfiles, create branches, open Fix PRs, dispatch workflows, or auto-merge until real workflow-dispatch dogfood evidence exists. |
| Changelog Drafter | `.github/workflows/changelog-drafter.yml`, report/draft-request replay scripts, replayed live runner, `zj-loop/changelog-drafter-state.md` | Report-only route with replayed draft evidence/PR runner | Records release-window evidence and draft request candidates. Route Table truth is `consumer_kind: draft-consumer`, `execution.mode: report-only`, and `maturity.runner: replayed`; the replayed runner can produce `draft-evidence` or an independent `draft-pr`, but automatic routing does not generate release notes, edit changelogs, create PRs, tag, release, publish, dispatch workflows, or start consumer work until workflow-dispatch dogfood evidence exists. |
| Post-Merge Roadmap Closeout | `.github/workflows/post-merge-roadmap-closeout.yml`, `scripts/post-merge-roadmap-closeout.mjs`, `zj-loop/post-merge-state.md` | Automatic dry-run plus guarded live cleanup | Merged Roadmap-Sliced PRs get dry-run evidence and artifacts. Route Table truth is `consumer_kind: cleanup-consumer`, `execution.mode: dry-run`, and `maturity.runner: replayed`; live branch deletion and carrier issue closure require explicit operator invocation and fixed confirmation phrase. |
| Release Workflow Validation | `scripts/validate-release-workflows.mjs` | Validate gate | Ensures every release-managed package has matching workflow, tag pattern, and pack output. |
| Drift Check | `tools/zj-loop-sync` | Tool package test and optional manual check | Detects mismatch between loop state, loop config, route table, and required files. |
| Runtime Constraints | `zj-loop/zj-loop-constraints.md`, `skills/zj-loop-constraints/SKILL.md` | Skill-level guardrail | Makes repo-specific operating rules loadable at run start. |
| Route Table | `zj-loop/zj-loop-route-table.yaml`, MCP `loop://route-table` | Control-plane policy | Defines routing policy, not a runtime queue or hidden worker. |

## Artifact Boundaries

The committed dogfood surface is:

- `zj-loop/` operational memory, budget, constraints, safety, route table, and
  consumer-owned state files
- `.github/workflows/` repository-specific automation
- `.github/workflows/zj-loop-*.yml` generated user-project workflow bundle
  dogfood evidence
- `scripts/` deterministic route, replay, workflow, and release gates
- `tools/` package source and tests
- `patterns/`, `starters/`, `templates/`, and `skills/` as the published
  pattern and scaffold surface
- durable docs under `docs/`

A root `.codex/` directory is not part of the durable repository architecture.
It is a local tool-host install surface for the current workstation or agent
runtime. Its contents must not be used as a completeness check for
`patterns/registry.yaml` or packaged skills. Starter-owned tool-host folders are
different because they are committed scaffold examples.

## Registry Skills

The `skills:` field in `patterns/registry.yaml` is a pattern capability
declaration. It is not a filesystem existence contract against the repository
`skills/` directory.

A registry skill name may be carried by:

- a reusable packaged skill under `skills/`
- a starter-local, tool-specific skill under a committed starter path
- an external skill installed by a user or host tool
- a future packaged skill that has not yet been promoted

Reusable ZAgenticLoop skills should graduate into `skills/`. Starter-specific
execution nodes may stay inside starter/tool-specific paths. Missing
`skills/<name>/SKILL.md` is therefore not automatically a registry error.

## Workflow-Dispatch Bundle Flow

The generated bundle proves the user-project install path separately from this
repository's hand-maintained dogfood workflows:

1. `zj-loop-init . --add github-actions` creates `zj-loop-*.yml` workflows.
2. Generated metadata and template hashes identify official generated files.
3. `ZJ Loop Smoke` runs by manual `workflow_dispatch` and dispatches
   `manual-smoke-report` through `zj-loop-route`.
4. `zj-loop-audit` verifies generated workflow metadata, Route Table presence,
   manual smoke route defaults, and pinned core package references.
5. Side-effecting generated consumer workflows stay governed by
   `zj-loop/zj-loop-route-table.yaml`; enabling them is an explicit maintainer
   action with a fixed confirmation phrase.
6. `zj-loop-init . --upgrade github-actions` updates canonical generated
   workflows and preserves locally modified generated files as `.bak`.

The generated bundle must remain portable. It should call published package
commands/APIs and avoid repository-local scripts that user projects would not
have.

Release readiness for the generated bundle is checked by
`npm run test:generated-bundle-release-gate`. The gate fails if generated
workflows drift from templates, if generated workflows pin a different
`@jununfly/zj-loop-core` version than the current package, if a workflow
dispatches an unknown Route Table route, or if an action-capable generated route
is not `install-ready` or `execution-ready` while still disabled by default. The
gate also runs the deterministic Roadmap Activation user-project fixture, which
generates a temporary bundle, enables the Roadmap Activation route in that
fixture, simulates an issue-comment slash command, verifies Activation Request
creation, branch/PR contract evidence, duplicate handling, permission denial,
disabled route denial, and loop marker detection.

## Daily Triage Flow

Daily Triage is the clearest self-running dogfood loop:

1. Audit the reference repo and extract readiness score/level.
2. Check recent validate/audit workflow health.
3. Build a Route Decision from `zj-loop/zj-loop-route-table.yaml`.
4. Check for duplicate CI Sweeper lifecycle evidence.
5. Rewrite `zj-loop/STATE.md` and append `zj-loop/zj-loop-run-log.md`.
6. Create an Issue Fix Request and dispatch CI Sweeper only when route guards
   pass and no matching lifecycle exists.
7. Run validate/audit gates for the generated state branch.
8. Open and squash-merge a generated state PR only when the narrow exception in
   `zj-loop/zj-loop-constraints.md` applies.
9. Open or refresh weekly loop report issues.

Daily Triage remains a producer. It may update operational memory, create
reviewable evidence, and hand off to an allowlisted dispatcher. It must not
perform product or code fixes directly.

## Report-Only Boundaries

These routes are intentionally outside the action-capable completion target:

- `human`
- `ignore`
- `daily-triage-report`
- `manual-smoke-report`
- `issue-backlog-triage`
- `pr-steward-report`
- `changelog-drafter-report`
- `changelog-drafter-draft-request`

They may create local evidence, workflow summaries, or human-readable status.
They must not create Issue Fix Requests, activation requests, workflow
dispatches, branches, PRs, labels, public issue comments, issue lifecycle
transitions, or consumer work. Side effects belong in separate action-capable
routes with their own consumer kind, guards, verification, and completion form;
for issue triage that route is `issue-triage-action`, currently dry-run only.

## CI Sweeper Flow

CI Sweeper is intentionally narrow:

1. Daily Triage observes the latest `validate-patterns` or `audit` workflow run
   in failure.
2. `scripts/route-ci-failure.mjs` checks the `ci-sweeper` route and emits a
   replayable Route Decision.
3. Daily Triage creates an independent Issue Fix Request and dispatches
   `.github/workflows/ci-sweeper.yml` only when lifecycle checks permit it.
4. CI Sweeper records the request in `zj-loop/ci-sweeper-state.md`.
5. CI Sweeper runs deterministic build/bundle repair steps and reruns
   validate/audit gates.
6. If deterministic repair produces non-state diffs and all gates pass, it opens
   or refreshes a repair PR. Otherwise it opens or updates escalation evidence.

CI Sweeper is not a general-purpose autonomous coding agent. Broader repair
ability requires a separate route and consumer contract.

Current Route Table truth: `consumer_kind: fix-runner`,
`execution.mode: live`, `side_effect_level: pr`, `maturity.runner:
dogfooded`. The live evidence is recorded in `zj-loop/ci-sweeper-state.md`.

## Post-Merge Roadmap Closeout

Post-Merge Roadmap Closeout is active, but not automatic live cleanup.

- Route Decision layer: `post-merge-roadmap-closeout` remains report-only.
- Automatic workflow layer: merged Roadmap-Sliced PRs run a dry-run plan,
  comment evidence on the PR, and upload a JSON artifact.
- Live cleanup layer: an operator may invoke the workflow or script with the
  fixed confirmation phrase
  `DELETE_MERGED_ROADMAP_BRANCH_AND_CLOSE_CARRIER`.
- Safety layer: the executor may delete only the merged `zjal/` roadmap branch
  named in the valid `zj-loop.post-merge-contract` and may close only the
  contract carrier issue after writing closeout evidence.

It is not a generic merged-PR cleanup agent.

## Verification Gates

Use the narrowest relevant gate after dogfood changes:

```bash
node --test scripts/report-only-route-dispatcher.test.mjs scripts/issue-backlog-triage-e2e-replay.test.mjs scripts/issue-triage-action-runner.test.mjs scripts/pr-steward-report-e2e-replay.test.mjs scripts/pr-steward-fix-request-e2e-replay.test.mjs scripts/pr-steward-claim-e2e-replay.test.mjs scripts/pr-steward-live-runner.test.mjs scripts/changelog-drafter-report-e2e-replay.test.mjs scripts/changelog-drafter-draft-request-e2e-replay.test.mjs scripts/changelog-drafter-live-runner.test.mjs scripts/dependency-sweeper-route-e2e-replay.test.mjs scripts/dependency-sweeper-claim-e2e-replay.test.mjs scripts/dependency-sweeper-live-runner.test.mjs scripts/issue-fix-request-contract.test.mjs scripts/issue-fix-request-dispatcher.test.mjs scripts/issue-fix-request-e2e-replay.test.mjs scripts/roadmap-activation-e2e-replay.test.mjs scripts/roadmap-activation-dispatcher.test.mjs scripts/live-runner-contract.test.mjs
node --test scripts/post-merge-roadmap-closeout-contract.test.mjs scripts/post-merge-roadmap-closeout-e2e-replay.test.mjs scripts/post-merge-roadmap-closeout.test.mjs scripts/validate-post-merge-closeout-workflow.test.mjs
bash scripts/ci-audit-gates.sh
bash scripts/ci-validate-gates.sh
```

`zj-loop/ZJ-LOOP.md` is the operational source for current live evidence and
run links. Keep this design document focused on stable capability boundaries.

## Drift Checklist

When dogfood config changes, check:

- Workflow paths use `zj-loop/STATE.md` and `zj-loop/zj-loop-run-log.md`.
- Generated `zj-loop-*.yml` workflow metadata hashes validate with
  `zj-loop-audit`.
- Pattern registry state paths use `zj-loop/*-state.md`.
- Starter README copy commands create state files under `zj-loop/`.
- `zj-loop/zj-loop-route-table.yaml` exists and keeps cross-component dispatch
  routes disabled until the consumer workflow/state owner is ready.
- Side-effect routes have explicit request evidence, dedupe behavior, failure
  owners, and loop-prevention rules.
- Generated state PR auto-merge remains limited to Daily Triage state/run-log
  files.
- Post-Merge live cleanup remains limited to valid Roadmap-Sliced closeout
  contracts.
- `zj-loop-init` bundled registry/templates are regenerated after registry or
  starter changes.
- `zj-loop-cost` bundled `registry.json` is regenerated after registry changes.
- `zj-loop-sync`, audit, and validate gates pass.

## Why This Case Matters

The reference repo is the product's own proof surface. A user should be able to
inspect it and see:

- a concrete state spine
- scheduled report-only automation
- replayable route and request contracts
- bounded workflow-dispatched consumers
- reusable verification gates
- constraints loaded as a skill
- release workflow checks
- starter and registry drift detection

That combination is the dogfood story: ZAgenticLoop is maintained by the same
loop primitives it teaches, with clear human gates and explicit boundaries.
