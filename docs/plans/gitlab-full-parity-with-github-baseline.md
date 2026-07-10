# GitLab Full Parity With GitHub Provider Baseline

Source issue: https://github.com/jununfly/ZAgenticLoop/issues/87

Activation:

- Issue Fix Request: https://github.com/jununfly/ZAgenticLoop/issues/87#issuecomment-4932784285
- Roadmap command: https://github.com/jununfly/ZAgenticLoop/issues/87#issuecomment-4932786315
- Activation request: https://github.com/jununfly/ZAgenticLoop/issues/87#issuecomment-4932795218
- Activation id: `act-87-4932786315-8c94c5b9`
- Branch: `zjal/act-87-4932786315-8c94c5b9-gitlab-full-parity-with-github-baseline`

## Contract

```json
{
  "schema": "zj-loop.roadmap_activation_pr_contract.v1",
  "activation_request_id": "act-87-4932786315-8c94c5b9",
  "source_issue_url": "https://github.com/jununfly/ZAgenticLoop/issues/87",
  "source_comment_url": "https://github.com/jununfly/ZAgenticLoop/issues/87#issuecomment-4932786315",
  "route_id": "roadmap-sliced-development",
  "consumer_id": "roadmap-sliced-development",
  "branch_name": "zjal/act-87-4932786315-8c94c5b9-gitlab-full-parity-with-github-baseline",
  "lifecycle_state": "requested",
  "closeout_contract": {
    "activation_carrier_issue": "87",
    "branch_name": "zjal/act-87-4932786315-8c94c5b9-gitlab-full-parity-with-github-baseline",
    "process_roadmap_path": "docs/plans/gitlab-full-parity-with-github-baseline.md"
  }
}
```

## Roadmap Goal

Align GitLab support to the current GitHub provider baseline. The route chain is
platform-neutral protocol; provider-specific implementations should be used only
where platform behavior would otherwise mislead agents or users.

Do not frame this as partial support. Work can be sliced and staged, but the
target is GitLab full parity with the current GitHub-side capabilities.

## Decisions

- GitHub current implementation is the validate baseline.
- Route protocol is platform-neutral.
- Reuse shared abstract components where they do not obscure platform
  semantics.
- Provider-specific adapters are allowed where platform differences are
  unavoidable.
- Provider API contracts live first in `@jununfly/zj-loop-core`, with
  split-friendly boundaries.
- GitLab API calls use Node `fetch`; do not require `glab`.
- Report-only routes may use low-permission CI context; side effects require
  `GITLAB_TOKEN`.
- Job logs carry concise summaries; canonical evidence lives in JSON artifacts.
- Issue/MR notes carry request and live side-effect evidence only.
- GitLab CI generated fragments live under `zj-loop/gitlab-ci/`.
- Root `.gitlab-ci.yml` is created when absent; if present, default to next
  steps instead of auto patching.
- Route enablement changes only Route Table policy. Provider wiring is separate.
- GitHub `workflow_dispatch` maps to GitLab manual pipeline job variables.
- Roadmap activation parity includes GitLab issue note slash command,
  provider adapter consumption, Activation Request note, branch/MR bootstrap,
  and MR post-merge contract.
- Post-merge closeout parity may do contract-authorized cleanup when guards
  pass; the fixed phrase remains the fallback.
- Add a provider parity gate.
- Durable architecture goes to
  `docs/designs/provider-adapter-parity-architecture.md`.

## Completion Conditions

- Durable provider parity architecture documents protocol versus provider
  implementation boundaries.
- GitHub baseline routes have an explicit GitLab parity row and target
  capability.
- `zj-loop-init` can install and upgrade GitLab provider wiring without
  treating GitHub Actions as universal automation.
- Generated GitLab CI templates cover the same route families as the GitHub
  provider baseline.
- GitLab Roadmap Activation, post-merge closeout, triage transition, CI
  Sweeper, PR/MR steward, dependency sweeper, and changelog drafter paths have
  deterministic scripts or adapters where suitable.
- Provider parity gate prevents release when docs/templates/scripts drift.
- README, Quickstart, durable docs, and dogfood reference explain provider
  selection and full-parity expectations.

## Slices

### 1. Provider Parity Architecture And Matrix

Status: completed

Intent:

- Add durable provider adapter parity architecture.
- Separate platform-neutral route protocol from GitHub/GitLab adapter
  implementations.
- Add the full GitHub/GitLab route capability matrix.

Allowed paths:

- `docs/designs/provider-adapter-parity-architecture.md`
- `docs/designs/dogfood-reference-case.md`
- `docs/plans/gitlab-full-parity-with-github-baseline.md`

Verification:

- `git diff --check` — passed

Evidence:

- Added `docs/designs/provider-adapter-parity-architecture.md`.
- Captured protocol/provider boundary rules, provider contract placement,
  GitHub/GitLab capability matrix, GitLab CI scaffold contract, evidence
  mapping, release gate expectations, and the current narrow GitHub Actions
  refusal exception.
- Preserved the current GitLab target-project pre-release evidence in
  `docs/designs/dogfood-reference-case.md`.

### 2. Provider Abstraction Core

Status: completed

Intent:

- Add provider contracts and shared adapter boundaries in
  `@jununfly/zj-loop-core`.
- Keep route-specific lifecycle ownership outside a generic mega-dispatcher.

Allowed paths:

- `tools/zj-loop-core/src/providers.ts`
- `tools/zj-loop-core/src/project.ts`
- `tools/zj-loop-core/src/post-merge-closeout-runner.ts`
- `tools/zj-loop-core/src/index.ts`
- `tools/zj-loop-core/test/provider.test.mjs`
- `tools/zj-loop-core/test/post-merge-closeout-runner.test.mjs`
- `tools/zj-loop-core/package.json`
- `tools/zj-loop-core/dist/**` generated by `npm run build`
- `docs/plans/gitlab-full-parity-with-github-baseline.md`

Verification:

- `cd tools/zj-loop-core && npm test` — passed

Evidence:

- Added shared provider helpers for provider kind detection, git remote
  repository parsing, issue URL parsing, and PR/MR URL parsing.
- Kept route-specific lifecycle ownership in existing runners; no generic
  dispatcher or queue was introduced.
- Rewired existing project provider detection through the shared helper.
- Rewired post-merge remote parsing to support GitHub, GitLab group/subgroup,
  and self-managed GitLab-style remotes.
- Added provider tests and extended post-merge closeout parser coverage.

### 3. GitLab CI Init And Upgrade

Status: completed

Intent:

- Add `zj-loop-init` GitLab CI install and upgrade provider wiring.
- Preserve default safety for existing `.gitlab-ci.yml`.

Allowed paths:

- `tools/zj-loop-init/src/cli.ts`
- `tools/zj-loop-init/dist/cli.js` generated by `npm run build`
- `tools/zj-loop-init/test/cli.test.mjs`
- `templates/gitlab-ci/**`
- `docs/plans/gitlab-full-parity-with-github-baseline.md`

Verification:

- `cd tools/zj-loop-init && npm test` — passed

Evidence:

- Added `--add gitlab-ci` artifact support.
- Added `--upgrade gitlab-ci` support.
- Added generated root `.gitlab-ci.yml` template and include-able
  `zj-loop/gitlab-ci/zj-loop-smoke.yml` fragment.
- Existing root `.gitlab-ci.yml` is skipped by default with next steps instead
  of auto-patching user CI.
- GitLab generated fragments are upgraded with `.bak` protection for modified
  generated files.

### 4. GitLab CI Template Parity

Status: completed

Intent:

- Add generated GitLab CI templates for every GitHub baseline route family.
- Keep generated templates calling published package APIs and deterministic
  scripts.

Allowed paths:

- `templates/gitlab-ci/**`
- `tools/zj-loop-init/src/cli.ts`
- `tools/zj-loop-init/dist/cli.js` generated by `npm run build`
- `tools/zj-loop-init/test/cli.test.mjs`
- `docs/plans/gitlab-full-parity-with-github-baseline.md`

Verification:

- `cd tools/zj-loop-init && npm test` — passed

Evidence:

- Added GitLab CI fragments for manual smoke, daily triage, CI Sweeper, MR
  steward, issue triage, dependency sweeper, changelog drafter, roadmap
  activation, and post-merge cleanup route families.
- Root `.gitlab-ci.yml` template now includes all GitLab fragments explicitly.
- Generated fragments call published package commands and emit JSON artifacts
  instead of repository-local scripts.
- Tests verify every generated GitLab fragment carries generated metadata,
  template version, computed hash, and artifact output.

### 5. GitLab Roadmap Activation Parity

Status: completed

Intent:

- Implement GitLab issue note slash command parsing, Activation Request note
  creation, branch/MR bootstrap, and MR handoff contract.

Allowed paths:

- `tools/zj-loop-core/src/roadmap-activation-runner.ts`
- `tools/zj-loop-core/src/roadmap-activation-cli.ts`
- `tools/zj-loop-core/test/roadmap-activation-runner.test.mjs`
- `tools/zj-loop-core/dist/**` generated by `npm run build`
- `templates/gitlab-ci/zj-loop-roadmap-activation.yml`
- `tools/zj-loop-init/test/cli.test.mjs`
- `docs/plans/gitlab-full-parity-with-github-baseline.md`

Verification:

- `cd tools/zj-loop-core && npm test` — passed
- `cd tools/zj-loop-init && npm test` — passed

Evidence:

- Added provider-neutral Roadmap Activation review title and review contract
  helpers.
- Preserved existing GitHub PR contract output for compatibility.
- Added GitLab MR contract output with `provider: gitlab`,
  `review_kind: merge-request`, source issue URL, source note URL, branch name,
  lifecycle state, and closeout contract fields.
- Extended `zj-loop-roadmap-activation contract-plan` with
  `--provider github|gitlab`; GitLab plans now output `mrTitle` and
  `mrContract`.
- Updated GitLab roadmap activation CI fragment to emit `contract-plan.json`
  for MR bootstrap/handoff evidence.
- Added tests for GitLab MR contract helper, CLI contract-plan output, and
  generated GitLab roadmap activation fragment.

### 6. GitLab Post-Merge Closeout Parity

Status: completed

Intent:

- Implement GitLab MR post-merge closeout with contract-authorized branch
  cleanup and carrier issue lifecycle notes.

Allowed paths:

- `tools/zj-loop-core/src/post-merge-closeout-runner.ts`
- `tools/zj-loop-core/src/post-merge-closeout-cli.ts`
- `tools/zj-loop-core/test/post-merge-closeout-runner.test.mjs`
- `tools/zj-loop-core/dist/**` generated by `npm run build`
- `templates/gitlab-ci/zj-loop-post-merge-cleanup.yml`
- `tools/zj-loop-init/test/cli.test.mjs`
- `docs/plans/gitlab-full-parity-with-github-baseline.md`

Verification:

- `cd tools/zj-loop-core && npm test` — passed
- `cd tools/zj-loop-init && npm test` — passed

Evidence:

- Added GitLab MR normalization into the existing closeout plan shape while
  preserving GitHub PR behavior.
- Closeout plans now expose a provider-aware `review` object so GitLab MR
  evidence is not mistaken for a GitHub-only PR surface.
- Extended `zj-loop-post-merge-closeout closeout-plan` with
  `--provider gitlab`, explicit MR IID, MR URL, MR body/body-file,
  source/target branch, merged flag, and carrier issue inputs.
- Added deterministic tests for GitLab MR closeout plans and CLI JSON output.
- Updated generated GitLab post-merge cleanup fragment to emit
  `closeout-plan.json` as dry-run/refusal evidence without executing cleanup.

### 7. GitLab Issue Triage And CI Sweeper Parity

Status: completed

Intent:

- Align issue backlog triage, confirmed triage transition, Issue Fix Request
  carrier reuse, and CI Sweeper repair/escalation paths for GitLab.

Allowed paths:

- `tools/zj-loop-core/src/providers.ts`
- `tools/zj-loop-core/src/issue-triage-transition-runner.ts`
- `tools/zj-loop-core/src/issue-triage-action-runner.ts`
- `tools/zj-loop-core/src/ci-sweeper-runner.ts`
- `tools/zj-loop-core/src/ci-sweeper-cli.ts`
- `tools/zj-loop-core/test/provider.test.mjs`
- `tools/zj-loop-core/test/issue-triage-transition-runner.test.mjs`
- `tools/zj-loop-core/test/issue-triage-action-runner.test.mjs`
- `tools/zj-loop-core/test/ci-sweeper-runner.test.mjs`
- `tools/zj-loop-core/dist/**` generated by `npm test`
- `docs/plans/gitlab-full-parity-with-github-baseline.md`

Verification:

- `cd tools/zj-loop-core && npm test` — passed

Evidence:

- Added shared provider issue URL construction for GitHub, GitLab, and
  self-managed GitLab hosts.
- Rewired confirmed triage transition evidence and source-issue carrier fallback
  URLs to use provider-aware issue URLs instead of GitHub-only defaults.
- Rewired issue triage action evidence source URLs to support GitLab issue
  carriers while preserving the existing GitHub default fixture behavior.
- Added CI Sweeper Issue Fix Request provider metadata for GitLab pipeline
  sources and an explicit `--provider github|gitlab` request-body CLI option.
- Added deterministic coverage for GitLab triage transition carrier reuse,
  GitLab issue triage action evidence, GitLab pipeline CI Sweeper request
  bodies, and provider issue URL formatting.

### 8. GitLab Review, Dependency, And Changelog Parity

Status: completed

Intent:

- Align PR/MR steward, dependency sweeper, and changelog drafter route families
  with GitLab provider semantics.

Allowed paths:

- `tools/zj-loop-core/src/pr-steward-runner.ts`
- `tools/zj-loop-core/src/dependency-sweeper-runner.ts`
- `tools/zj-loop-core/src/changelog-drafter-runner.ts`
- `tools/zj-loop-core/test/pr-steward-runner.test.mjs`
- `tools/zj-loop-core/test/dependency-sweeper-runner.test.mjs`
- `tools/zj-loop-core/test/changelog-drafter-runner.test.mjs`
- `tools/zj-loop-core/dist/**` generated by `npm test`
- `docs/plans/gitlab-full-parity-with-github-baseline.md`

Verification:

- `cd tools/zj-loop-core && npm test` — passed

Evidence:

- PR Steward now validates GitLab Merge Request fix requests as MR-shaped
  provider input instead of requiring GitHub-only PR fields.
- PR Steward plans expose provider-neutral `source_review` metadata while
  preserving the existing GitHub `source_pr` compatibility field.
- Dependency Sweeper repair plans now carry GitLab provider metadata from the
  consumed request/subject.
- Changelog Drafter release windows now carry GitLab provider metadata.
- GitLab live review/MR side effects for PR Steward, Dependency Sweeper, and
  Changelog Drafter are explicitly refused with provider-layer reasons instead
  of accidentally continuing through GitHub CLI actions.
- Added deterministic tests for GitLab MR request validation, GitLab dependency
  repair planning, and GitLab changelog draft planning/refusal evidence.

### 9. Provider Parity Release Gate And Dogfood

Status: completed

Intent:

- Add provider parity release gate.
- Record GitLab target-project dogfood evidence.

Allowed paths:

- `scripts/validate-provider-parity-gate.mjs`
- `scripts/validate-provider-parity-gate.test.mjs`
- `scripts/ci-validate-gates.sh`
- `package.json`
- `docs/designs/dogfood-reference-case.md`
- `docs/plans/gitlab-full-parity-with-github-baseline.md`

Verification:

- `npm run test:provider-parity-gate` — passed

Evidence:

- Added a deterministic provider parity release gate that checks GitHub/GitLab
  generated route template pairs, generated sentinels, GitLab CI stage syntax,
  absence of GitHub-specific syntax in GitLab templates, pinned
  `@jununfly/zj-loop-core` versions, Route Table-backed dispatch route ids, and
  durable provider/dogfood documentation evidence.
- Added direct test coverage for the provider parity gate.
- Added `test:provider-parity-gate` to package scripts and included it in
  `test:tools`.
- Wired the gate into `scripts/ci-validate-gates.sh`.
- Updated the dogfood capability map so provider parity gate evidence is part
  of the durable release validation story.

### 10. Docs, README, And Quickstart Provider Parity

Status: completed

Intent:

- Update README, Quickstart, and durable docs for GitHub/GitLab provider
  parity, install commands, and current route capability boundaries.

Allowed paths:

- `README.md`
- `README.zh-CN.md`
- `docs/QUICKSTART.md`
- `docs/plans/gitlab-full-parity-with-github-baseline.md`

Verification:

- `npm run test:provider-parity-gate` — passed
- `git diff --check` — passed

Evidence:

- README now presents GitHub Actions and GitLab CI as explicit provider
  adapters instead of implying GitHub Actions is the universal automation
  surface.
- README documents `zj-loop-init . --add gitlab-ci` and
  `zj-loop-init . --upgrade gitlab-ci`, GitLab generated fragment location,
  token boundary, current GitLab route surfaces, and the explicit live MR
  side-effect refusal boundary.
- README architecture map links to Provider Adapter Parity Architecture.
- Quickstart now includes an optional GitLab provider adapter path, a GitLab CI
  first-run section, generated artifact expectations, upgrade command, and the
  provider parity release gate.
- Chinese README now includes the GitLab CI adapter path, provider distinction,
  provider parity release gate, and current package versions.
