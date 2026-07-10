# Provider Adapter Parity Architecture

This document defines how ZAgenticLoop keeps route protocols platform-neutral
while supporting concrete GitHub and GitLab provider adapters.

It is a durable reference for maintainers and advanced users. User-facing docs
may link here when they need to explain why a route has one shared protocol but
different provider implementation files.

## Goal

GitLab support should align to the current GitHub provider baseline. The target
is not "GitLab can initialize a local loop"; the target is that every
GitHub-backed route family has a GitLab-backed equivalent or an explicit
documented blocker.

The implementation can land in slices, but architecture and release gates must
make unfinished parity visible.

## Mental Model

```text
Route protocol
  -> provider-neutral request or evidence contract
  -> provider adapter
  -> GitHub Actions / GitLab CI / local manual surface
  -> provider issue, PR/MR, branch, note/comment, artifact, or job summary
```

The route protocol decides what the loop means. The provider adapter decides
how that meaning is represented on a platform.

Use shared components when the abstraction is truly stable. Use provider-specific
components when sharing names would make agents confuse GitHub implementation
details with universal protocol.

## Boundary Rules

- Route chains, request schemas, completion forms, and consumer kinds are
  platform-neutral.
- GitHub issues and GitLab issues are provider carriers, not different protocol
  objects.
- GitHub PRs and GitLab MRs are provider carriers for the same review boundary.
- GitHub workflow summaries and GitLab job logs are concise runtime summaries;
  canonical evidence should be attached as JSON artifacts where possible.
- GitHub issue comments and GitLab issue notes carry append-only request and
  live side-effect evidence.
- Provider adapters may differ in API calls, CI syntax, permission variables,
  branch/MR mechanics, and artifact upload mechanics.
- Side-effecting GitLab actions require `GITLAB_TOKEN`. Report-only jobs may
  use the low-permission CI context.
- Do not require `glab` for GitLab support. Use Node `fetch` in deterministic
  package code.
- Do not hide route-specific lifecycle behind a global queue or generic worker.
  Route-specific dispatchers still own dedupe, retry, status, and failure
  recovery.

## Provider Contract Placement

Provider API contracts should live first in `@jununfly/zj-loop-core` because
the current route consumers already share request validation, route table reads,
and deterministic runner helpers there.

Keep the layout split-friendly:

```text
tools/zj-loop-core/src/providers/
  github/
  gitlab/
  shared/
```

Shared code should handle:

- provider kind detection
- provider URL parsing
- normalized issue, pull request, merge request, comment/note, branch, and
  artifact references
- request/evidence envelope validation
- predictable error shapes

Provider-specific code should handle:

- API endpoint construction
- auth header construction
- CI environment variable extraction
- comment versus note formatting constraints
- PR versus MR creation and lookup
- workflow/job artifact behavior

## Baseline Capability Matrix

| Route family | GitHub baseline | GitLab parity target | Shared protocol | Provider-specific surface |
| --- | --- | --- | --- | --- |
| Manual smoke/report-only | `workflow_dispatch`, GitHub Actions summary, JSON evidence | Manual pipeline job with variables, GitLab job log, JSON artifact | Route Decision report evidence | CI syntax, artifact upload |
| Daily Triage | Scheduled/manual GitHub workflow, state PR exception, Route Table dispatch candidates | Scheduled/manual GitLab pipeline, MR or branch evidence only where policy allows | Producer/router evidence and Route Decision candidates | state branch/MR mechanics, token permissions |
| Issue Backlog Triage | GitHub issue scan produces recommendations only | GitLab issue scan produces recommendations only | Report-only issue observations | issue list API, labels/state vocabulary mapping |
| Issue Triage Transition | Maintainer/collaborator fixed phrase confirms transition and appends source issue Issue Fix Request comment | Maintainer/member fixed phrase confirms transition and appends source issue Issue Fix Request note | Confirmed transition request, Issue Fix Request carrier reuse | permission checks, issue note API |
| Roadmap Activation | GitHub issue slash command creates Activation Request comment and bootstraps branch/PR contract | GitLab issue note slash command creates Activation Request note and bootstraps branch/MR contract | Activation Request and Roadmap-Sliced lifecycle | note parsing, branch/MR API |
| CI Sweeper | Workflow failure/manual dispatch creates or consumes fix request and may open repair PR or escalation issue | Pipeline failure/manual job creates or consumes fix request and may open repair MR or escalation issue | Fix runner request, repair/escalation completion form | pipeline metadata, MR creation, artifact links |
| PR/MR Steward | Pull request events produce report/fix-request/claim evidence and optional repair/escalation PR | Merge request events produce report/fix-request/claim evidence and optional repair/escalation MR | Review steward request and completion evidence | event payloads, approval/status vocabulary |
| Dependency Sweeper | Dependency signals create request/claim evidence and optional repair/escalation PR | GitLab dependency signals create request/claim evidence and optional repair/escalation MR | Fix runner request and capability match | dependency source APIs, branch/MR mechanics |
| Changelog Drafter | Release-window route produces draft evidence or draft PR | Release-window route produces draft evidence or draft MR | Draft consumer request and draft completion form | tag/release source APIs, MR creation |
| Post-Merge Closeout | Merged PR contract authorizes narrow branch deletion and carrier issue closeout | Merged MR contract authorizes narrow branch deletion and carrier issue closeout | Closeout contract and cleanup completion form | merge event source, issue close API |

## GitLab CI Scaffold Contract

GitLab generated files should live under `zj-loop/gitlab-ci/` as include-able
fragments. `zj-loop-init` may create a root `.gitlab-ci.yml` only when absent.
When `.gitlab-ci.yml` already exists, default behavior should report skipped
and provide next steps instead of patching user CI.

`--force` may overwrite official generated fragments. Root CI patching should
stay explicit because user projects often already have meaningful GitLab CI
topology.

Generated GitLab jobs should:

- call published `@jununfly/zj-loop-*` package commands or APIs
- pin package versions in generated snippets
- emit concise job logs
- upload canonical JSON evidence artifacts
- use Route Table enablement for route side effects
- require `GITLAB_TOKEN` before issue notes, labels, branches, MRs, or cleanup

The generated GitLab adapter is not a fully offline bundle by default. Even when
users vendor package tarballs under `zj-loop/vendor/`, `npm exec` may still need
registry access or a prepared npm cache for transitive dependencies. The
supported baseline is therefore "online or cache-backed package execution" with
explicit warnings when vendored tarballs are ignored by Git. Fully offline
execution requires a separate, intentional packaging strategy and must not be
implied by the standard GitLab CI fragments.

## Evidence Mapping

| Evidence role | GitHub carrier | GitLab carrier |
| --- | --- | --- |
| Runtime summary | Workflow step summary | Job log summary |
| Canonical JSON evidence | Workflow artifact | Job artifact |
| Route request evidence | Issue/PR comment | Issue/MR note |
| Review boundary | Pull request | Merge request |
| Activation carrier | GitHub issue | GitLab issue |
| Closeout carrier | GitHub issue plus merged PR contract | GitLab issue plus merged MR contract |

## Release Gate Expectations

Provider parity should be releasable only when a deterministic gate can answer:

- every GitHub generated route template has an explicit GitLab parity row
- every Route Table side-effect route states provider support status
- generated GitLab templates call published package APIs, not repo-local scripts
- GitLab templates pin the same package versions as GitHub templates
- provider docs and README do not present GitHub Actions as universal automation
- GitLab target-project dogfood evidence is linked or explicitly marked absent
- gaps are visible as blockers or follow-ups, not hidden in prose

## Current Narrow Exception

The only accepted current narrow exception is the provider-aware adoption path
that refuses GitHub Actions installation in detected GitLab projects by default
while allowing explicit `--force`. That exception is a safety guard, not GitLab
full parity. It remains valid while full provider parity is implemented because
it prevents users from installing an inert GitHub adapter into a GitLab project.
