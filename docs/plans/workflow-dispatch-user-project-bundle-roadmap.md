# Workflow-Dispatch User-Project Bundle Roadmap

Roadmap id: `workflow-dispatch-user-project-bundle`

Branch: `zjal/workflow-dispatch-user-project-bundle`

Carrier issue: https://github.com/jununfly/ZAgenticLoop/issues/52

Activation request: `rsd-52-workflow-dispatch-bundle`

Source checklist:
[workflow-dispatch-user-project-bundle-checklist.md](./workflow-dispatch-user-project-bundle-checklist.md)

## Goal

Ship a real, useful GitHub Actions `workflow_dispatch` bundle that user
projects can install with `zj-loop-init`, run through a manual smoke path, and
then explicitly enable side-effecting consumers through Route Table policy.

## Completion Criteria

- `zj-loop-init --add github-actions` installs the full known GitHub Actions
  workflow bundle.
- Generated workflows are portable user-project templates, not dogfood copies.
- Generated workflows call pinned published `@jununfly/zj-loop-*` package
  commands/APIs for deterministic dispatch behavior.
- Only the manual smoke/report-only route is enabled by default.
- `zj-loop-route enable/disable/status` manages Route Table route enablement.
- Side-effecting route enablement requires predictable fixed confirmation
  phrases.
- `zj-loop-init --upgrade github-actions` provides an explicit pinned-version
  upgrade path with `.bak` protection for modified generated workflows.
- Generated workflow metadata is treated as a workflow health signal by
  `zj-loop-audit`.
- README/QUICKSTART document install, smoke run, route enablement, verification,
  disable/rollback, and upgrade.
- This repository dogfoods the bundle enough to prove the manual smoke path and
  at least one Route Table-controlled consumer path.

## Parent Nodes

### 1. Bundle Install And Templates

Status: completed

Completion condition: generated workflow templates, pinned package references,
metadata comments, init command behavior, and tests are all in place.

Leaf nodes:

- [x] 1.1 Add portable workflow bundle templates for manual smoke, dispatcher,
      and all allowlisted consumers.
- [x] 1.2 Add `zj-loop-init --add github-actions` scaffold behavior.
- [x] 1.3 Add generated workflow metadata comments and pinned package versions.
- [x] 1.4 Add init tests for generated files, skip behavior, `--force`, default
      enabled route state, and generated consumer list.

Verification evidence:

- `npm test` in `tools/zj-loop-init`
- `npm run check:zj-loop-init`

Notes:

- First slice added the installable workflow bundle and init scaffold behavior.
- Runtime dispatcher package/API, route enablement CLI, upgrade, and audit
  health checks remain in later parent nodes.

### 2. Deterministic Route Dispatch Surface

Status: active

Completion condition: workflows call published package commands/APIs for route
matching, request ids, duplicate handling, payload validation, and evidence
rendering instead of embedding complex generated scripts.

Leaf nodes:

- [ ] 2.1 Identify the existing package best suited to host dispatch commands.
- [ ] 2.2 Implement the minimal deterministic dispatch command/API needed by
      generated workflows.
- [ ] 2.3 Add package tests for allowed route, disabled route, invalid consumer,
      and report-only smoke behavior.

### 3. Route Enablement CLI

Status: candidate

Completion condition: `zj-loop-route enable/disable/status` updates Route Table
policy predictably and safely.

Leaf nodes:

- [ ] 3.1 Add `zj-loop-route status`.
- [ ] 3.2 Add `zj-loop-route enable <consumer>` with fixed confirmation phrases
      for side-effecting/destructive routes.
- [ ] 3.3 Add `zj-loop-route disable <consumer>` as a low-friction rollback
      path.
- [ ] 3.4 Keep Route Table writes limited to necessary state and low-churn audit
      fields.

### 4. Upgrade And Audit

Status: candidate

Completion condition: installed workflow bundles can be audited and upgraded
without floating to latest or silently overwriting user-modified files.

Leaf nodes:

- [ ] 4.1 Add `zj-loop-init --upgrade github-actions`.
- [ ] 4.2 Add `.bak` backup behavior for modified generated workflows before
      writing upgraded canonical files.
- [ ] 4.3 Add lightweight metadata/hash validation.
- [ ] 4.4 Add `zj-loop-audit` checks for bundle presence, route defaults,
      side-effect guards, pinned versions, and invalid/missing metadata as
      workflow health failures.

### 5. Documentation And Dogfood

Status: candidate

Completion condition: user-facing docs explain the command path and this repo
proves the bundle with workflow evidence.

Leaf nodes:

- [ ] 5.1 Update README and QUICKSTART with install, smoke, enable, verify,
      disable/rollback, and upgrade commands.
- [ ] 5.2 Add or update durable design docs with final workflow-dispatch bundle
      architecture decisions.
- [ ] 5.3 Dogfood the manual smoke/report-only route in this repository.
- [ ] 5.4 Dogfood at least one side-effecting consumer route through explicit
      Route Table enablement and evidence capture.

## Decisions

- `--add github-actions` generates the full known consumer workflow bundle in
  one install.
- Route Table controls enablement; workflows alone do not authorize side
  effects.
- Only manual smoke/report-only route is enabled by default.
- Generated workflows call pinned published package commands/APIs.
- Route enablement belongs to `zj-loop-route`, not `zj-loop-init` or
  `zj-loop-audit`.
- Side-effecting route enablement requires predictable fixed confirmation
  phrases.
- Route disable remains low-friction.
- Upgrade preserves modified generated workflows as `.bak` and writes the new
  canonical version.
- Missing/invalid generated workflow metadata is a workflow health failure.

## Out Of Scope

- Exhaustive automated migration for deeply customized user workflows.
- Embedding complex route-dispatch scripts into user projects.
- Letting workflows reinterpret Route Table semantics independently from
  published package contracts.

## Verification Strategy

- Narrow tests for each touched package or script.
- `npm run check:zj-loop-init` when init behavior changes.
- `npm run build` in touched tool packages when applicable.
- `bash scripts/ci-validate-gates.sh` and `bash scripts/ci-audit-gates.sh` for
  broad workflow/pattern/template changes.
- `git diff --check` before every commit/PR handoff.
