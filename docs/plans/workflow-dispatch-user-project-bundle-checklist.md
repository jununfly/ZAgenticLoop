# Workflow-Dispatch User-Project Bundle Checklist

This checklist tracks the productization gap between today's GitHub Actions
examples and a workflow-dispatch bundle that can be installed into user
projects with `zj-loop-init`.

## Goal

Create a real, useful `workflow-dispatch` user-project bundle:

```text
Manual Workflow Dispatch
  -> Route Decision
  -> allowlisted consumer dispatch
  -> durable evidence / PR / escalation
```

The smoke path is manual `workflow_dispatch` because it is easy to run, inspect,
and debug in a newly configured user project. Issue comment activation and daily
triage routing remain first-class paths, but they build on the same bundle
contract instead of replacing it.

## Productization Checklist

- [ ] Add a `zj-loop-init --add github-actions` install path.
  - Agent: implement deterministic scaffold behavior.
  - Human: review generated workflow defaults before release.
  - Evidence: CLI test proves generated files, skip behavior, and `--force`
    overwrite behavior.

- [ ] Generate the full consumer workflow bundle in one install.
  - Agent: `--add github-actions` generates dispatcher/smoke workflow plus all
    known consumer workflow templates at once.
  - Human: review generated defaults as a bundle, not as disconnected examples.
  - Evidence: generated files include every allowlisted consumer workflow, while
    Route Table policy controls which routes can run side effects.

- [ ] Generate portable GitHub Actions workflows, not repository dogfood copies.
  - Agent: create templates that do not depend on this repository's private
    scripts, local package paths, or dogfood-only state files.
  - Human: confirm which workflows are included by default.
  - Evidence: fixture output shows only user-project portable paths.

- [ ] Keep Route Table as the mandatory dispatch control plane.
  - Agent: make generated workflows read or reference
    `zj-loop/zj-loop-route-table.yaml` before dispatching consumers.
  - Human: confirm no workflow bypasses Route Decision for side-effecting work.
  - Evidence: tests or fixtures cover route id, request kind, consumer, and
    disabled-route handling.

- [ ] Put deterministic dispatch logic in published package APIs/scripts.
  - Agent: generated workflows call maintained `@jununfly/zj-loop-*` commands or
    APIs for route matching, request id generation, duplicate handling,
    payload validation, and evidence rendering.
  - Human: review the command/API surface before release.
  - Evidence: user-project generated files do not contain complex copied
    scripts; package tests cover deterministic behavior.

- [ ] Pin published package versions in generated workflows.
  - Agent: generated workflows call explicit package versions instead of
    floating latest tags.
  - Human: upgrade workflow package versions through an explicit upgrade path.
  - Evidence: generated workflow fixtures include pinned versions, and README
    explains how to upgrade intentionally.

- [ ] Provide an explicit GitHub Actions bundle upgrade path.
  - Agent: add a planned `zj-loop-init --upgrade github-actions` command or
    equivalent that updates pinned workflow package versions and generated
    workflow templates intentionally.
  - Human: review generated diffs before committing the upgrade.
  - Evidence: upgrade tests cover pinned version changes, skipped local
    modifications, and clear next steps when a file cannot be upgraded safely.

- [ ] Back up user-modified workflows during upgrade, then write the new version.
  - Agent: `zj-loop-init --upgrade github-actions` renames user-modified
    generated workflow files with a `.bak` suffix and writes the upgraded
    workflow in the canonical path by default.
  - Human: review the new workflow and the `.bak` file after upgrade if local
    customization matters; complex local workflow migration is intentionally a
    project maintainer responsibility.
  - Evidence: upgrade tests cover clean generated files, modified files,
    `.bak` creation, canonical overwrite, and clear output naming both files.

- [ ] Detect user-modified workflows with lightweight template metadata.
  - Agent: generated workflows include a lightweight metadata comment with
    `template_id`, `template_version`, and generated content hash data needed to
    compare against known generated output.
  - Human: avoid editing metadata comments unless intentionally opting out of
    generated workflow upgrade behavior.
  - Evidence: upgrade tests distinguish clean generated workflows from
    user-modified workflows without requiring a separate manifest file.

- [ ] Treat missing or invalid workflow metadata as a workflow health failure.
  - Agent: `zj-loop-audit` fails generated workflow health when required
    metadata is missing or invalid because metadata is a primary integrity
    signal for official generated artifacts.
  - Human: redeploy or upgrade the GitHub Actions bundle to restore a valid
    official generated workflow.
  - Evidence: audit output explains the failing workflow, missing/invalid
    metadata, and the redeploy/upgrade command to fix it.

- [ ] Keep upgrade support focused on official generated paths.
  - Agent: prioritize this repository's dogfood health, official generated
    workflow templates, pinned package upgrades, and basic overwrite protection.
  - Human: own project-specific workflow customizations beyond the `.bak` safety
    net.
  - Evidence: docs state that deep local customization is an open-ended
    maintainer responsibility, not a fully automated migration guarantee.

- [ ] Provide a manual `workflow_dispatch` smoke path.
  - Agent: generate a workflow that can be manually invoked to produce a Route
    Decision and dispatch only allowlisted consumers.
  - Human: run it once in a dogfood repository.
  - Evidence: workflow summary contains the Route Decision payload and target
    consumer result.

- [ ] Pair side-effecting workflow dispatch with durable request evidence.
  - Agent: for PR/issue/branch-producing routes, require Issue Fix Request,
    Activation Request, PR comment, issue comment, or workflow summary evidence.
  - Human: confirm which evidence stores are acceptable for each consumer.
  - Evidence: generated docs and templates name the evidence store explicitly.

- [ ] Add loop prevention to every generated workflow.
  - Agent: include actor checks, branch namespace checks, request id / dedupe key
    guards, and no self-triggering loops for generated state branches.
  - Human: review exceptions where a workflow intentionally triggers another
    workflow.
  - Evidence: test fixture or checklist documents the exact stop conditions.

- [ ] Define permissions and secrets up front.
  - Agent: generated workflows must declare minimal `permissions` blocks and
    document when `GITHUB_TOKEN` is enough versus when a PAT or app token is
    required.
  - Human: enable repository Actions permissions if needed.
  - Evidence: README or generated comments include a setup checklist.

- [ ] Make consumer activation explicit.
  - Agent: default bundle can be runnable, but side-effecting consumers must be
    disabled or guarded until the Route Table row is explicitly enabled.
  - Human: decide which consumers are enabled for the project.
  - Evidence: generated route table shows enabled/disabled status without
    requiring agent interpretation.

- [ ] Enable only the manual smoke/report-only route by default.
  - Agent: generated Route Table marks the manual smoke/report-only route as
    enabled and all side-effecting consumer routes as disabled.
  - Human: opt into each side-effecting route by editing Route Table policy.
  - Evidence: a newly initialized project can run the smoke workflow without
    creating issues, PRs, branches, or comments outside workflow evidence.

- [ ] Support issue comment activation as the collaboration path.
  - Agent: connect maintainer/collaborator slash-command intake to Activation
    Request creation for allowlisted routes.
  - Human: confirm allowed commands and authorization rules.
  - Evidence: append-only GitHub issue comments can replay accepted, denied, and
    duplicate requests.

- [ ] Support daily triage as the scheduled producer path.
  - Agent: generated daily triage workflow emits Route Decision candidates and
    does not execute consumer work directly.
  - Human: choose schedule cadence and enabled route ids.
  - Evidence: report-only run shows candidate, route decision, and skipped or
    dispatched consumer status.

- [ ] Support CI failure routing to CI Sweeper.
  - Agent: route failed CI signals through Route Decision before dispatching
    `ci-sweeper`.
  - Human: confirm bounded repair scope.
  - Evidence: success opens a repair PR; no-op or unsupported failures create
    escalation evidence instead of silent failure.

- [ ] Support PR event routing to PR Steward.
  - Agent: route PR events through Route Decision and emit PR Steward evidence
    without mutating PR state unless explicitly enabled.
  - Human: confirm review/comment boundaries.
  - Evidence: PR comment or workflow summary shows steward report evidence.

- [ ] Support dependency alert routing to Dependency Sweeper.
  - Agent: route dependency signals through Route Decision and claim/PR paths.
  - Human: confirm update policy and verification gates.
  - Evidence: claim or PR evidence records package, risk, gate, and failure
    handling.

- [ ] Support release/changelog routing to Changelog Drafter.
  - Agent: route release signals through Route Decision and draft request
    evidence.
  - Human: confirm release trigger and publication boundary.
  - Evidence: draft PR, issue comment, or release note evidence is replayable.

- [ ] Support post-merge closeout as a guarded optional path.
  - Agent: implement only with strict merged-PR, branch namespace, and carrier
    issue guards.
  - Human: confirm fixed confirmation phrase before destructive cleanup.
  - Evidence: closeout records deleted branch, closed carrier issue, or skipped
    reason.

- [ ] Add bundle-level validation tests.
  - Agent: test generated workflows, route table compatibility, and invalid
    consumer rejection.
  - Human: run dogfood workflow at least once before release.
  - Evidence: CI shows deterministic fixture tests plus one real workflow run.

- [ ] Split validation between init-time generation and audit-time readiness.
  - Agent: `zj-loop-init` tests prove generated files, skip/force behavior,
    Route Table defaults, workflow names, and consumer list are deterministic.
  - Agent: `zj-loop-audit` checks installed user-project readiness, including
    workflow bundle presence, Route Table presence, default smoke-only enablement,
    and side-effecting route guards.
  - Human: review audit warnings before enabling side-effecting consumers.
  - Evidence: init tests fail on bad generation; audit reports actionable
    readiness gaps in installed projects.

- [ ] Provide a command to enable consumer workflows through Route Table policy.
  - Agent: add a deterministic `zj-loop-route` command/API that enables an
    allowlisted consumer route by updating `zj-loop/zj-loop-route-table.yaml`
    instead of requiring users or agents to hand-edit YAML.
  - Human: choose the consumer to enable and review the resulting route table
    diff before committing.
  - Evidence: command output names the enabled consumer, affected route ids,
    side-effect capability, required permissions, and next verification step.

- [ ] Write only necessary state and low-churn audit fields to Route Table.
  - Agent: route enablement writes `enabled: true` and, where useful,
    low-churn fields such as `enabled_reason`; avoid volatile fields such as
    `enabled_at` that create noisy diffs.
  - Human: provide a concise enable reason when the route needs durable context.
  - Evidence: route table diffs remain reviewable and do not behave like runtime
    logs.

- [ ] Require fixed confirmation phrases for side-effecting route enablement.
  - Agent: `zj-loop-route enable <consumer>` must refuse to enable
    side-effecting routes unless the command includes the route-specific fixed
    confirmation phrase.
  - Human: copy the exact phrase only after reviewing the command output,
    affected route ids, side-effect capability, permissions, and next
    verification step.
  - Evidence: command tests cover missing, wrong, and correct confirmation
    phrases for every side-effecting route class.

- [ ] Keep route disable low-friction.
  - Agent: `zj-loop-route disable <consumer>` does not require a confirmation
    phrase because it reduces automation authority.
  - Human: use disable as the fast rollback path when a consumer behaves
    unexpectedly.
  - Evidence: command output reports affected route ids and next verification
    step without requiring a guard phrase.

- [ ] Use predictable confirmation phrase formats.
  - Agent: regular side-effecting routes require
    `enable <consumer> side effects`; destructive routes require
    `enable <consumer> destructive side effects`.
  - Human: use the predictable phrase format shown by command output and README.
  - Evidence: CLI help, README examples, and tests use the same phrase format.

- [ ] Keep route enablement out of `zj-loop-init` and `zj-loop-audit`.
  - Agent: `zj-loop-init` installs the bundle, `zj-loop-audit` reports
    readiness, and `zj-loop-route` manages Route Table enable/disable/status.
  - Human: use `zj-loop-route` for running configuration changes after install.
  - Evidence: README and CLI help present route enablement as runtime
    configuration management, not initialization or auditing.

- [ ] Update user-facing docs after the bundle exists.
  - Agent: document install command, smoke run, enablement path, permissions, and
    failure recovery.
  - Human: confirm the docs match actual workflow UI behavior.
  - Evidence: README / QUICKSTART links to the bundle path and troubleshooting.

- [ ] Document command-based consumer enablement in README.
  - Agent: add README examples for installing the bundle and enabling a specific
    consumer workflow through the Route Table enable command.
  - Human: confirm examples match the released CLI surface.
  - Evidence: README shows install, smoke run, enable consumer, verify, and
    rollback/disable guidance.

## Known Design Decisions

- The default install target is `zj-loop-init --add github-actions`.
- The first smoke path is manual `workflow_dispatch`.
- `--add github-actions` generates the full known consumer workflow bundle in
  one install rather than requiring per-consumer incremental installation.
- Route Table remains mandatory for consumer dispatch.
- Route Table explicitly controls enablement; generated side-effecting
  workflows are not permission to run side effects by themselves.
- A newly initialized project enables only the manual smoke/report-only route by
  default.
- Side-effecting consumer workflows are enabled by command-driven Route Table
  updates, not by asking users or agents to hand-edit YAML as the primary path.
- Route enablement belongs to a dedicated `zj-loop-route` command surface:
  `zj-loop-route enable <consumer>`, `zj-loop-route disable <consumer>`, and
  `zj-loop-route status`.
- Route enablement writes only necessary state and low-cost audit fields; Route
  Table must not become a runtime event log.
- Side-effecting route enablement must require a fixed confirmation phrase; this
  is the primary user-facing guard rather than a two-step plan/apply token flow.
- Route disable is intentionally low-friction and does not require a
  confirmation phrase.
- Confirmation phrases use predictable formats:
  `enable <consumer> side effects` or
  `enable <consumer> destructive side effects`.
- Generated workflows must be portable user-project templates, not copied
  dogfood workflows from this repository.
- Generated workflows call published package commands/APIs for deterministic
  route and dispatch logic; they must not embed complex generated scripts into
  the user project.
- Generated workflows pin published package versions by default; upgrades are
  explicit rather than floating to latest.
- Pinned workflow package versions require an explicit upgrade path such as
  `zj-loop-init --upgrade github-actions`.
- Workflow bundle upgrade preserves user-modified generated workflows by
  renaming them with a `.bak` suffix, then writes the upgraded workflow to the
  canonical path by default.
- User modification detection uses lightweight workflow metadata comments and
  generated content hashes, not a separate machine-readable manifest as the
  primary mechanism.
- Missing or invalid workflow metadata is a workflow health failure, not merely
  an upgrade maintainability warning; redeploying the bundle is the simple
  repair path.
- Upgrade maintainability focuses on official generated paths and this
  repository's dogfood health; complex user customization gets basic `.bak`
  protection but not exhaustive automated migration.
- Durable evidence is required for side-effecting routes.
- Side-effecting consumers are enabled explicitly through Route Table policy.

## Non-Goals

- Do not generate complex route-dispatch scripts into `zj-loop/` or another
  user-project directory as the primary implementation mechanism.
- Do not make workflow files reinterpret route semantics independently from the
  published package contract.

## Open Grill Questions

- Are there any remaining workflow-dispatch bundle decisions that must be
  settled before turning this checklist into a roadmap?
