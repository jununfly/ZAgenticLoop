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
| GitLab Provider Bundle | `templates/gitlab-ci/`, `zj-loop-init --add/--upgrade gitlab-ci`, `scripts/gitlab-provider-dogfood-replay.mjs`, `scripts/validate-provider-parity-gate.mjs`, `tools/zj-loop-audit` | Generated GitLab bundle plus deterministic provider dogfood replay | Proves GitLab route templates stay paired with GitHub templates, use configurable stage/tags/image settings, expose manual replay variables, pin package versions, avoid GitHub-only syntax, warn on untracked/ignored local GitLab substrate, and preserve provider-aware contracts for CI Sweeper, Roadmap Activation MR closeout, and PR Steward MR evidence. Live GitLab MR side effects remain refused where the runner is not yet live. |
| Daily Triage | `.github/workflows/daily-triage.yml`, `zj-loop/STATE.md`, `zj-loop/zj-loop-run-log.md` | Scheduled producer plus generated state PR | Updates operational memory, emits route candidates, and may dispatch allowlisted consumers. Its generated state PR auto-merge is a narrow exception limited to loop state/run-log files. |
| PRD Handoff Planner | `zj-loop-prd-handoff handoff-plan`, `tools/zj-loop-core/src/prd-handoff-runner.ts` | Deterministic report-only handoff planner | Converts a ready PRD/plan issue plus exact next command into a stable handoff comment body and manual `gh issue comment ...` command. Default mode performs no GitHub writes; `comment-enabled` is explicit opt-in planning and callers must enforce marker-based idempotency. |
| CI Sweeper | `.github/workflows/ci-sweeper.yml`, `zj-loop/zj-loop-route-table.yaml`, `zj-loop/ci-sweeper-state.md` | Live dogfooded `fix-runner` | Handles validate/audit failures only. Completion forms are `repair-pr` when deterministic repair creates non-state diffs and repair/validate/audit gates pass, or `escalation-issue` otherwise. |
| Route Decision replay suite | `scripts/*route*replay*.mjs`, `scripts/*dispatcher*.mjs`, `scripts/*contract*.mjs` | Local deterministic protocol evidence | Proves route decisions, request creation, duplicate suppression, denials, claims, and recovery paths without requiring live GitHub side effects. |
| Roadmap activation | `roadmap-activation-dispatcher.mjs`, `zj-loop-activation-contract.mjs`, route table `roadmap-sliced-development` row, `zj-loop/roadmap-activation-state.md` | Live issue-triggered activation-comment route | Authorized slash commands create append-only activation requests only. Route Table truth is `consumer_kind: activation-consumer`, `execution.mode: live`, and `maturity.runner: dogfooded`; Roadmap-Sliced Development consumes explicit issue/request ids and owns branch, roadmap, implementation, verification, and PR handoff. |
| PR Steward routes | PR Steward report/fix-request/claim replay scripts, replayed live runner, `zj-loop/pr-steward-state.md` | Report-only plus claim-only route with replayed repair/escalation runner | Report routes do not comment, label, rebase, merge, dispatch workflows, repair, or open Fix PRs. Fix request Route Table truth is `consumer_kind: fix-runner`, `execution.mode: claim-only`, and `maturity.runner: replayed`; claim evidence consumes a request, and the replayed runner can produce independent `repair-pr` / `escalation-issue` evidence without mutating the source PR/MR. GitLab MR requests are accepted as provider evidence and use MR wording in plans, while live GitLab review side effects are explicitly refused. |
| Issue Backlog Triage route | Issue backlog triage replay scripts and `zj-loop/issue-triage-state.md` | Report-only protocol evidence | Records allowed issue observations and recommended triage transitions only. It must not perform formal issue lifecycle transitions, public comments, labels, assignments, milestones, close/reopen, Issue Fix Request creation, or batch mutation in recommendation mode. |
| Issue Triage transition route | `tools/zj-loop-core/src/issue-triage-transition-runner.ts`, `scripts/issue-triage-transition-e2e-replay.mjs`, route table `issue-triage-transition` row, `zj-loop/issue-triage-state.md` | Request-only confirmed-transition consumer with live workflow-dispatch dogfood evidence | Consumes fixed recommended transition requests after maintainer/collaborator confirmation, or a Route Table allowlisted trusted automation confirmation for `ready-for-agent` request-carrier-only transitions, and creates or dedupes source issue Issue Fix Request comments. Independent Issue Fix Request issues are narrow exceptions, not the default. The E2E replay covers `issue-backlog-triage -> issue-triage-transition -> source issue request carrier`; live dogfood on #7 proved workflow-dispatch execution, marker-based dedupe, and source issue request comment creation. Route Table truth remains `execution.mode: request-only`; source issue tracker label/state mutation is refused until explicit promotion. |
| Issue Triage action route | `scripts/issue-triage-action-runner.mjs`, route table `issue-triage-action` row, `zj-loop/issue-triage-state.md` | Dry-run action consumer with replayed runner | Separate `triage-action-consumer` route for allowlisted labels and fixed comment templates. Route Table truth is `execution.mode: dry-run`, `maturity.runner: replayed`; live issue mutation is refused until workflow-dispatch dogfood evidence supports explicit promotion. |
| Dependency Sweeper routes | Dependency route/claim replay scripts, replayed live runner, generated workflow-dispatch `live-repair` path, `zj-loop/dependency-sweeper-state.md` | Claim-only route with workflow-dispatch escalation evidence | Supports bounded request and claim lifecycle evidence plus replayed `repair-pr` / `escalation-issue` live-runner evidence. Workflow-dispatch dogfood run `29234374181` used `core_package=./tools/zj-loop-core`, executed guarded `live-repair`, uploaded `live-repair-result.json`, and produced verifier-backed `escalation-issue` evidence without pushing a repair branch or creating a repair PR; Route Table promotion is still handled separately. |
| Changelog Drafter | `.github/workflows/changelog-drafter.yml`, report/draft-request replay scripts, replayed live runner, `zj-loop/changelog-drafter-state.md` | Report-only route with replayed draft evidence/PR runner | Records release-window evidence and draft request candidates. Route Table truth is `consumer_kind: draft-consumer`, `execution.mode: report-only`, and `maturity.runner: replayed`; the replayed runner can produce `draft-evidence` or an independent `draft-pr`, but automatic routing does not generate release notes, edit changelogs, create PRs, tag, release, publish, dispatch workflows, or start consumer work until workflow-dispatch dogfood evidence exists. |
| Post-Merge Roadmap Closeout | `.github/workflows/post-merge-roadmap-closeout.yml`, `scripts/post-merge-roadmap-closeout.mjs`, `zj-loop/post-merge-state.md` | Automatic dry-run plus contract-authorized live cleanup | Merged Roadmap-Sliced PRs get dry-run evidence and artifacts. Route Table truth is `consumer_kind: cleanup-consumer`, `execution.mode: dry-run`, and `maturity.runner: replayed`; live branch deletion and carrier issue closure may run automatically only when the merged PR contains a valid closeout contract and executor guards pass. Fixed confirmation remains a fallback path. |
| Release Workflow Validation | `scripts/validate-release-workflows.mjs`, `scripts/validate-generated-bundle-release-gate.mjs`, `scripts/validate-provider-parity-gate.mjs` | Validate gate | Ensures every release-managed package has matching workflow, tag pattern, and pack output; generated GitHub bundle workflows stay synced; GitHub/GitLab provider route templates stay paired, version-pinned, Route Table-backed, and documented with dogfood evidence. |
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

## Issue 6 Consumption Evidence

Issue [#6](https://github.com/jununfly/ZAgenticLoop/issues/6) was consumed as a
real `issue-backlog-triage -> issue-triage-transition ->
roadmap-sliced-development` dogfood case:

1. `issue-triage-transition` created a source issue Issue Fix Request comment:
   [issuecomment-4925604217](https://github.com/jununfly/ZAgenticLoop/issues/6#issuecomment-4925604217).
2. The maintainer added `/zj-loop start roadmap-sliced-development` on the
   source issue:
   [issuecomment-4925642070](https://github.com/jununfly/ZAgenticLoop/issues/6#issuecomment-4925642070).
3. `ZJ Loop Roadmap Activation` ran successfully:
   [29022420139](https://github.com/jununfly/ZAgenticLoop/actions/runs/29022420139).
4. Roadmap-Sliced Development executed on branch
   `zjal/issue-6-daily-triage-local-registry`.

The run fixed the product gap that caused the original ZCodeGraph dogfood
confusion: cost estimation now uses local registry truth by default, init no
longer silently replaces the active loop contract, daily-triage runtime state
has local/default-safe scaffolding, and docs distinguish readiness from
execution authority.

Release readiness for the generated bundle is checked by
`npm run test:generated-bundle-release-gate` and provider parity is checked by
`npm run test:provider-parity-gate`. The generated-bundle gate fails if
generated workflows drift from templates, if generated workflows pin a different
`@jununfly/zj-loop-core` version than the current package, if a workflow
dispatches an unknown Route Table route, or if an action-capable generated route
is not `install-ready` or `execution-ready` while still disabled by default. The
gate also runs the deterministic Roadmap Activation user-project fixture, which
generates a temporary bundle, enables the Roadmap Activation route in that
fixture, simulates an issue-comment slash command, verifies Activation Request
creation, branch/PR contract evidence, duplicate handling, permission denial,
disabled route denial, and loop marker detection.

## GitLab Target-Project Pre-Release Evidence

The provider-aware adoption path was verified before publishing by installing
local packed tarballs into an external GitLab target project:

- `jununfly-zj-loop-init-0.1.9.tgz`
- `jununfly-zj-loop-core-0.1.6.tgz`

The maintainer ran the target-project dogfood sequence from the GitLab project
root:

1. `zj-loop-init . --add github-actions`
2. `zj-loop-init . --pattern daily-triage --tool codex`
3. `zj-loop-init . --add route-table`
4. `zj-loop-route status`
5. `zj-loop-init . --upgrade github-actions`
6. Optional `zj-loop-init . --add github-actions --force`

Observed result:

- detected GitLab projects refuse `--add github-actions` by default
- detected GitLab projects refuse `--upgrade github-actions` by default
- `daily-triage` local loop substrate initializes successfully
- `zj-loop/zj-loop-route-table.yaml` is created or skipped deterministically
- `zj-loop-route status` reads the generated Route Table successfully
- `--force` remains an explicit provider-adapter override with warning output

This is intentionally pre-release cross-repo dogfood evidence. It proves the
GitLab-safe path without publishing an npm version first and without treating
GitHub Actions as a universal provider adapter.

Recent Roadmap Activation dogfood runs added three durable lessons:

- Issue [#4](https://github.com/jununfly/ZAgenticLoop/issues/4) clarified that
  `zj-loop-audit` findings must distinguish score/level impact from execution
  blocking. Optional hardening and future-tooling findings may affect the audit
  score without implying that a loop is blocked from running.
- Issue [#84](https://github.com/jununfly/ZAgenticLoop/issues/84) established
  provider-aware adoption as the default first mile. GitHub Actions are a
  GitHub provider adapter, not a universal substrate; detected GitLab projects
  refuse GitHub Actions install/upgrade unless the operator explicitly uses
  `--force`.
- Issue [#87](https://github.com/jununfly/ZAgenticLoop/issues/87) was the
  GitLab full-parity activation. The source issue carried the Issue Fix
  Request, Roadmap-Sliced activation command, Activation Request, and branch
  handoff for `act-87-4932786315-8c94c5b9`, proving the source-issue carrier
  model for a large provider-parity roadmap.

Issue #92 extended the GitLab provider dogfood baseline after a downstream
GitLab validation run. The follow-up hardening added:

- `zj-loop-init --add/--upgrade gitlab-ci --gitlab-core-package <package>`
  for local tarball or internal package-source validation without manual CI
  search/replace
- GitLab consumer-plan commands that keep blocked/refused plans observable as
  `consumer-plan.json` artifacts
- GitLab CI Sweeper dry-run request artifacts:
  `issue-fix-request.md` and `issue-fix-request-result.json`
- Post-Merge Closeout GitLab dry-run wording that uses MR/manual pipeline
  language rather than GitHub Actions or PR-only wording

Issue #101 tightened the GitLab provider bundle after repeated target-project
validation gaps. The follow-up hardening added:

- GitLab install/upgrade readiness output that separates fragment generation,
  root `.gitlab-ci.yml` include reachability, and Route Table presence
- uniform `ZJ_LOOP_SIGNAL_ID` manual/API replay input across generated GitLab
  fragments, while preserving issue/MR/comment route variables
- GitLab MR metadata fetch for post-merge closeout by MR IID
- GitLab-native route metadata for pipeline, MR, dependency alert, and release
  window artifacts
- separate `dispatch_allowed` and `execution_allowed` plan fields so report
  routes, blocked routes, and execution-ready routes are not conflated
- generated Route Table route profiles for `production_safe_default` and
  `dogfood_validation`
- audit warnings when generated/local GitLab CI substrate exists but is ignored
  or untracked by Git
- minimal-diff Route Table enable/disable updates and safer Roadmap Activation
  branch slugs

Issues #104, #105, and #106 extended that GitLab dogfood line into route
readiness:

- manual smoke jobs now emit `environment-diagnostics.json` and use `needs: []`
  to reduce friction in existing pipelines
- GitLab init readiness output calls out root include/stage requirements,
  runner tags, private Node images, and package source
- issue backlog triage now has stable `issue-recommendations.json` and
  `transition-requests.json` artifact contracts
- Roadmap Activation emits `execution-result.json` and has guarded GitLab
  branch/MR execution with missing-token refusal, `zjal-*` branch guard, draft
  MR default, and idempotent MR update behavior

## Daily Triage Flow

Daily Triage is the clearest self-running dogfood loop:

1. Audit the reference repo and extract readiness score/level.
2. Check recent validate/audit workflow health.
3. Build a Route Decision from `zj-loop/zj-loop-route-table.yaml`.
4. Check for duplicate CI Sweeper lifecycle evidence.
5. Rewrite `zj-loop/STATE.md` and append `zj-loop/zj-loop-run-log.md`.
6. Create an Issue Fix Request and dispatch CI Sweeper only when route guards
   pass and no matching lifecycle exists.
7. When a ready PRD/plan issue has an exact next implementation command, use
   `zj-loop-prd-handoff handoff-plan` to expose where the handoff lives. In
   default report-only mode this produces a manual `gh issue comment ...`
   command instead of writing to GitHub.
8. Run validate/audit gates for the generated state branch.
9. Open and squash-merge a generated state PR only when the narrow exception in
   `zj-loop/zj-loop-constraints.md` applies.
10. Open or refresh weekly loop report issues.

Daily Triage remains a producer. It may update operational memory, create
reviewable evidence, and hand off to an allowlisted dispatcher. It must not
perform product or code fixes directly.

## Source Issue Carrier Boundary

When a source issue already exists, dogfood request lifecycles should stay on
that issue by default. The source issue may carry Activation Requests, Issue Fix
Requests, PR handoff evidence, closeout evidence, and final status notes as
append-only structured comments. Creating a separate Issue Fix Request issue is
allowed only for missing source issues, cross-repository permission limits,
source issues unsuitable for automation evidence, or explicit human-requested
isolation.

This boundary keeps the user-visible issue as the lifecycle home and prevents
the resolved request from drifting away from the original report.

## Issue Backlog Triage Dogfood Evidence

The 2026-07-09 `issue-backlog-triage` dogfood run used #7 as the real source
issue and reached the current supported live boundary:

```text
Issue Backlog
-> Route Decision
-> Recommended Triage Transition
-> Confirmed Triage Transition
-> Source Issue Fix Request Comment
```

Durable human-readable result:

- Source issue: [#7](https://github.com/jununfly/ZAgenticLoop/issues/7)
- Successful workflow-dispatch run:
  [29018974110](https://github.com/jununfly/ZAgenticLoop/actions/runs/29018974110)
- Source issue request carrier:
  [issuecomment-4925192831](https://github.com/jununfly/ZAgenticLoop/issues/7#issuecomment-4925192831)
- Dedupe result: exactly one `<!-- zj-loop:issue-fix-request` comment on #7.

The run exposed two real workflow issues before succeeding:

- [#75](https://github.com/jununfly/ZAgenticLoop/pull/75) fixed false dedupe
  where a maintainer confirmation comment containing the transition request id
  could be mistaken for an existing Issue Fix Request carrier. Dedupe now
  requires the structured Issue Fix Request marker plus the request id.
- [#77](https://github.com/jununfly/ZAgenticLoop/pull/77) fixed missing
  `GH_TOKEN: ${{ github.token }}` for workflow `gh issue view/comment` calls.

This dogfood evidence is split intentionally:

- This document keeps the stable, human-readable capability story and findings.
- `zj-loop/issue-triage-state.md` keeps the route-owned, replayable evidence
  links and status facts that future agents can inspect without reconstructing
  the run from chat.

Follow-up gap: #7 and #77 were closed manually by the maintainer after success.
The loop did not automatically produce or execute a closeout plan for directly
related source issues and repair PRs. Future closeout work should make the next
close action explicit, including target issue/PR, close reason, required guard,
and evidence links.

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

Post-Merge Roadmap Closeout is active with contract-authorized live cleanup.

- Route Decision layer: `post-merge-roadmap-closeout` remains report-only.
- Automatic workflow layer: merged Roadmap-Sliced PRs run a dry-run plan,
  comment evidence on the PR, and upload a JSON artifact.
- Live cleanup layer: when the merged PR carries a valid
  `zj-loop.post-merge-contract` and all executor guards pass, the workflow or
  script may run live cleanup without another human confirmation. The fixed
  phrase `DELETE_MERGED_ROADMAP_BRANCH_AND_CLOSE_CARRIER` remains a manual
  fallback when contract authorization is unavailable or explicitly required.
- Safety layer: the executor may delete only the merged `zjal-` roadmap branch
  named in the valid `zj-loop.post-merge-contract` and may close only the
  contract carrier issue after writing closeout evidence. Historical `zjal/`
  branches remain accepted for closeout compatibility, but new automation
  generates `zjal-...` branch names to avoid Git ref prefix conflicts.

It is not a generic merged-PR cleanup agent.

## Verification Gates

Use the narrowest relevant gate after dogfood changes:

```bash
node --test scripts/report-only-route-dispatcher.test.mjs scripts/issue-backlog-triage-e2e-replay.test.mjs scripts/issue-triage-transition-e2e-replay.test.mjs scripts/issue-triage-action-runner.test.mjs scripts/pr-steward-report-e2e-replay.test.mjs scripts/pr-steward-fix-request-e2e-replay.test.mjs scripts/pr-steward-claim-e2e-replay.test.mjs scripts/pr-steward-live-runner.test.mjs scripts/changelog-drafter-report-e2e-replay.test.mjs scripts/changelog-drafter-draft-request-e2e-replay.test.mjs scripts/changelog-drafter-live-runner.test.mjs scripts/dependency-sweeper-route-e2e-replay.test.mjs scripts/dependency-sweeper-claim-e2e-replay.test.mjs scripts/dependency-sweeper-live-runner.test.mjs scripts/issue-fix-request-contract.test.mjs scripts/issue-fix-request-dispatcher.test.mjs scripts/issue-fix-request-e2e-replay.test.mjs scripts/roadmap-activation-e2e-replay.test.mjs scripts/roadmap-activation-dispatcher.test.mjs scripts/live-runner-contract.test.mjs
node --test scripts/post-merge-roadmap-closeout-contract.test.mjs scripts/post-merge-roadmap-closeout-e2e-replay.test.mjs scripts/post-merge-roadmap-closeout.test.mjs scripts/validate-post-merge-closeout-workflow.test.mjs
npm run test:provider-parity-gate
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
