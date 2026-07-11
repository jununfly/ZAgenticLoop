# Issue 101 GitLab Provider Bundle Gaps Roadmap

Source issue: https://github.com/jununfly/ZAgenticLoop/issues/101

Issue Fix Request:

- Request id: `ifr_triage_c3dc6d47a53b`
- Carrier: https://github.com/jununfly/ZAgenticLoop/issues/101#issuecomment-4943180683
- Requested consumer: `roadmap-sliced-development`

Branch: `zjal-issue-101-gitlab-provider-bundle-gaps`

## Goal

Turn the GitLab provider bundle feedback from #101 into execution-ready,
user-project-useful GitLab support without weakening the shared route protocol.

## Completion Conditions

- GitLab generated fragments consistently inherit configured image, runner tags,
  and Node preflight behavior.
- GitLab user-project validation can run manual smoke and route-specific replay
  jobs without hidden substrate prerequisites.
- GitLab MR/post-merge closeout can consume MR metadata/body by MR IID where
  live provider data is required.
- Consumer plans distinguish route dispatch allowance from execution readiness
  and point to primary dry-run artifacts.
- GitLab provider signals carry useful GitLab-native metadata for MR,
  dependency, CI pipeline, and release-window routes.
- Dogfood-validation enablement is distinct from production-safe defaults.
- Audit and route enablement catch local/generated substrate drift without noisy
  route-table rewrites.
- Roadmap activation branch slug generation handles empty, missing, Unicode, and
  trailing separator cases.

## Parent 1: GitLab CI Install Substrate

Completion condition: Generated GitLab CI installation gives private GitLab
projects a runnable substrate with consistent image/tag/Node settings and clear
include/install status.

### Leaf 1-1: Shared GitLab Image Tags And Node Preflight

Status: completed

Intent: Ensure every generated GitLab fragment inherits configured image,
runner tags, and Node >=18 preflight behavior.

Evidence:

- All nine generated GitLab fragments already render
  `__ZJ_LOOP_GITLAB_IMAGE__`, `__ZJ_LOOP_GITLAB_TAGS__`, and Node >=18
  preflight checks.
- `zj-loop-init` tests cover custom image/tag rendering.
- Provider parity confirms all GitHub/GitLab route template pairs remain
  aligned.

Verification:

```bash
cd tools/zj-loop-init && npm test # passed
npm run test:provider-parity-gate # passed
git diff --check # passed
```

### Leaf 1-2: GitLab Route Table And Include Readiness

Status: completed

Intent: Make GitLab upgrade/install output distinguish fragments generated,
root CI includes reachable, route table present, and exact next steps when user
CI is not patched.

Evidence:

- `zj-loop-init --add gitlab-ci` and `--upgrade gitlab-ci` now print a GitLab
  CI readiness summary that separates fragment generation/upgrade, root
  `.gitlab-ci.yml` include reachability, and route table readiness.
- Existing root CI files get the exact `include:` block for generated
  `zj-loop/gitlab-ci/*.yml` fragments instead of a wildcard instruction.
- `--upgrade gitlab-ci` now creates a missing
  `zj-loop/zj-loop-route-table.yaml` readiness substrate instead of leaving a
  runtime `ENOENT` for route dispatch.

Verification:

```bash
cd tools/zj-loop-init && npm test # passed
npm run check:zj-loop-init # passed
git diff --check # passed
```

### Leaf 1-3: GitLab Manual Replay Surface

Status: pending

Intent: Add documented manual/API replay variables so MR, pipeline, and issue
routes can be exercised without requiring a live GitLab event.

Verification:

```bash
cd tools/zj-loop-init && npm test
npm run test:provider-parity-gate
git diff --check
```

## Parent 2: Provider Metadata And Closeout

Completion condition: GitLab route artifacts carry provider-native metadata and
post-merge closeout can fetch GitLab MR data instead of requiring manually
supplied MR body/state.

### Leaf 2-1: GitLab MR Metadata Fetch

Status: pending

Intent: Fetch GitLab MR state, target branch, source branch, merged timestamp,
and description/body by MR IID for post-merge closeout planning.

Verification:

```bash
cd tools/zj-loop-core && npm test
npm run test:provider-parity-gate
git diff --check
```

### Leaf 2-2: Provider Native Route Artifacts

Status: pending

Intent: Add or normalize GitLab-native metadata in MR Steward, Dependency
Sweeper, CI Sweeper, and Changelog Drafter plans/artifacts.

Verification:

```bash
cd tools/zj-loop-core && npm test
npm run test:route-decision
git diff --check
```

## Parent 3: Readiness And Profile Clarity

Completion condition: Users and agents can distinguish route authorization,
execution readiness, production-safe defaults, and dogfood-validation enablement
without guessing.

### Leaf 3-1: Dispatch Vs Execution Readiness

Status: pending

Intent: Split consumer plan fields so dispatch allowance and execution
readiness are explicit, while blocked plans still point to primary dry-run
artifacts.

Verification:

```bash
cd tools/zj-loop-core && npm test
npm run test:route-decision
git diff --check
```

### Leaf 3-2: Production Safe Route Profiles

Status: pending

Intent: Separate production-safe route defaults from dogfood-validation
enablement, keeping route enablement in Route Table policy.

Verification:

```bash
cd tools/zj-loop-init && npm test
npm run test:provider-parity-gate
git diff --check
```

## Parent 4: Audit Route Enable And Slug Hardening

Completion condition: Audit and deterministic helpers prevent common GitLab
validation footguns without causing noisy diffs or malformed branch names.

### Leaf 4-1: Audit Local Substrate Tracking

Status: pending

Intent: Warn when generated/local GitLab substrate exists but is ignored or
untracked and would disappear in CI.

Verification:

```bash
cd tools/zj-loop-audit && npm test
cd tools/zj-loop-audit && npm run build && node dist/cli.js ../..
git diff --check
```

### Leaf 4-2: YAML Preserving Route Enable

Status: pending

Intent: Keep route enable/disable operations minimal-diff and avoid rewriting
the whole Route Table when possible.

Verification:

```bash
cd tools/zj-loop-core && npm test
git diff --check
```

### Leaf 4-3: Roadmap Activation Branch Slug Trimming

Status: pending

Intent: Trim trailing separators from generated roadmap activation branches and
cover empty, missing, Unicode, and non-slug title cases.

Verification:

```bash
cd tools/zj-loop-core && npm test
npm run test:route-decision
git diff --check
```

## Parent 5: Closeout

Completion condition: Process roadmap is absorbed into durable docs/state,
deleted, and PR handoff carries verification evidence plus post-merge closeout
plan.

### Leaf 5-1: Durable Docs And Process Cleanup

Status: pending

Intent: Merge durable decisions into provider adapter, route table, route
consumer, dogfood, README, and Quickstart docs; delete process roadmap files.

Verification:

```bash
bash scripts/ci-validate-gates.sh
bash scripts/ci-audit-gates.sh
git diff --check
```

## Human Gates

- Scope expansion beyond GitLab parity with current GitHub-side behavior.
- Live cleanup or destructive GitLab side effects.
- Release or publish.
- Merge to main.
