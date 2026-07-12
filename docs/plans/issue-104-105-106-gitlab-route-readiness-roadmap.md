# Roadmap — Issues 104/105/106 GitLab Route Readiness

## Roadmap Metadata

- Roadmap id: `issues-104-105-106-gitlab-route-readiness`
- Branch: `zjal-issues-104-105-106-gitlab-route-readiness`
- Source carriers:
  - #104 `ifr_triage_a064f4b67c1c`
  - #105 `ifr_triage_ec14f0deb2c5`
  - #106 `ifr_triage_2b661c2e8360`
- Route: `issue-backlog-triage -> issue-triage-transition -> roadmap-sliced-development`
- Execution policy: consume issues in order, keep source issues as carriers, open a verifier-backed PR, no auto-merge.

## Parent 1 — Consume #104 GitLab Smoke Bootstrap

Completion condition: existing GitLab CI adoption guidance and generated smoke behavior make stage/include/tag/image/runtime requirements explicit, with replay artifacts preserved.

### Leaf 1.1 — GitLab CI Readiness Diagnostics

- Status: completed
- Intent: improve `zj-loop-init --add/--upgrade gitlab-ci` output for existing root `.gitlab-ci.yml`, stage/include requirements, runner tags, private image, and Node >=18 runtime.
- Evidence: `zj-loop-init` readiness summary now prints configured stage, runner tags, image, package source, smoke artifact contract, root CI action requirement, runner tag hint, and private image hint. Verification: `npm test` in `tools/zj-loop-init`.

### Leaf 1.2 — Smoke Job Playability

- Status: completed
- Intent: make generated manual smoke route easier to play in existing GitLab pipelines while preserving `route-decision.json` and `consumer-plan.json`.
- Evidence: GitLab smoke template uses `needs: []` and writes `environment-diagnostics.json` alongside `route-decision.json` and `consumer-plan.json`; generated bundle tests assert the artifacts. Verification: `npm test` in `tools/zj-loop-init`.

### Leaf 1.3 — #104 Durable Docs

- Status: completed
- Intent: update README/Quickstart/design docs with GitLab bootstrap guidance and close #104 scope in state.
- Evidence: README, Quickstart, Provider Adapter Parity Architecture, and Dogfood Reference Case document smoke diagnostics, root include/stage requirements, runner tags, private image, and replay artifacts.

## Parent 2 — Consume #105 GitLab Triage Artifacts

Completion condition: GitLab issue backlog recommendation and transition request evidence are stable, replayable artifacts with provider-native URLs and clear dispatch/execution wording.

### Leaf 2.1 — Recommendation Artifact Contract

- Status: completed
- Intent: add deterministic `issue-recommendations.json` style artifact builder/schema for GitLab issue backlog triage.
- Evidence: `buildIssueRecommendationsArtifact()` exports stable `zj-loop.issue_recommendations.v1` shape preserving GitLab provider, project path, pipeline URL, issue IID, issue URL, labels, assignees, recommendation, reason, and request payload. Verification: `node --test test/issue-triage-transition-runner.test.mjs` in `tools/zj-loop-core`.

### Leaf 2.2 — Transition Request Artifact Contract

- Status: completed
- Intent: add stable `transition-requests.json` or equivalent batch evidence for request-only transition results.
- Evidence: `buildTransitionRequestsArtifact()` exports stable `zj-loop.transition_requests.v1` shape preserving GitLab issue URL, requested transition, request-only side-effect policy, route decision, consumer plan, exit codes, and Issue Fix Request. GitLab issue-triage fragment writes `issue-recommendations.json` and `transition-requests.json`. Verification: core transition tests and `zj-loop-init` tests.

### Leaf 2.3 — #105 Durable Docs

- Status: completed
- Intent: document dispatch-allowed versus live-execution-refused/request-only wording.
- Evidence: Quickstart and Provider Adapter Parity Architecture document stable GitLab triage artifacts and request-only/no-mutation boundary.

## Parent 3 — Consume #106 GitLab Roadmap Runner Readiness

Completion condition: GitLab roadmap activation can move from contract-only planning to guarded execution-ready branch/MR planning/execution when token and Route Table guards pass.

### Leaf 3.1 — GitLab Provider Primitives

- Status: completed
- Intent: add GitLab branch/MR/note primitives with structured refusal for missing token or unsupported live side effects.
- Evidence: `executeGitLabRoadmapActivation()` plans guarded GitLab branch/MR operations, refuses missing live token and unsafe branch prefix, and uses GitLab API calls for branch lookup/create plus MR lookup/create/update. Verification: mocked fetch tests in roadmap activation runner.

### Leaf 3.2 — Roadmap Activation Execute Command

- Status: completed
- Intent: add `zj-loop-roadmap-activation execute --provider gitlab` contract-plan consumer that is idempotent by activation id and `zjal-*` branch.
- Evidence: `zj-loop-roadmap-activation execute --provider gitlab --contract-plan ...` emits `zj-loop.gitlab_roadmap_activation_execution_result.v1`; dry-run CLI test passes; live mocked test updates existing MR by source branch instead of creating a duplicate.

### Leaf 3.3 — GitLab CI Bundle Execution Job

- Status: completed
- Intent: generate GitLab CI job wiring activation contract artifacts into guarded execution result artifacts.
- Evidence: GitLab roadmap activation fragment now runs `zj-loop-roadmap-activation execute --provider gitlab` and uploads `execution-result.json`. Verification: `npm test` in `tools/zj-loop-init`.

### Leaf 3.4 — #106 Durable Docs

- Status: completed
- Intent: update architecture docs with GitLab roadmap execution readiness and closeout continuity.
- Evidence: Quickstart, Provider Adapter Parity Architecture, Route Consumer Execution Architecture, Dogfood Reference Case, and README document the narrow guarded GitLab Roadmap Activation live path.

## Closeout

- Status: ready
- Required before PR handoff:
  - All parent nodes completed/deferred with evidence.
  - `zj-loop/roadmap-sliced-state.md` updated.
  - Process roadmap decisions absorbed into durable docs or PR body.
  - Verification commands recorded before commit.
  - PR body includes post-merge branch cleanup plan.
