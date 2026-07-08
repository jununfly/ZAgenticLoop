# User-Project-Ready Route Consumer Checklist

Status: draft plan

Goal: make every action-capable Route consumer ready for real user-project
installation, so a user can choose the first enabled path from the generated
bundle instead of being forced into a single reference route.

This plan is scoped to the user-project implementation gap. It does not change
the existing principle that report-only routes stay report-only unless a
separate action-capable route exists.

## Readiness Definition

A Route consumer is user-project-ready only when all of these are true:

- [ ] The consumer has a published package CLI/API entry point. Generated user
  projects must not call repository-local `scripts/` files.
- [ ] The generated GitHub Actions workflow calls the published package
  entry point, not just `zj-loop-route dispatch`.
- [ ] The workflow still goes through Route Decision and Route Table enablement
  before side effects.
- [ ] Route Table template, dogfood Route Table, workflow dispatch selector,
  consumer id, and README naming are aligned.
- [ ] Side-effecting enablement requires the fixed confirmation phrase owned by
  `zj-loop-route`.
- [ ] The consumer writes durable evidence to the correct carrier: issue/PR
  comment, workflow summary, consumer state file, PR, or escalation issue.
- [ ] The consumer has deterministic replay or contract tests for deny, skip,
  duplicate, success, and failure/escalation paths.
- [ ] The consumer has at least one workflow-dispatch dogfood run that proves
  the generated-bundle path, not only a repo-specific workflow.
- [ ] Documentation clearly distinguishes `report-only`, `request-only`,
  `claim-only`, `dry-run`, `live`, `dogfooded`, and `user-project-ready`.

## Global Gaps

- [ ] Package repo-local consumer runners into published package commands or
  APIs.
  - Current evidence: generated workflow templates under
    `templates/github-actions/zj-loop-*.yml` mainly call
    `zj-loop-route dispatch`.
  - Target: each action-capable generated workflow calls a published
    deterministic runner after route authorization.

- [ ] Normalize route ids and consumer ids across dogfood and generated
  templates.
  - Current drift candidates: `post-merge-roadmap-closeout` versus
    `post-merge-cleanup`; generic generated routes such as `pr-steward` versus
    dogfood-specific `pr-steward-fix-request`; `issue-triage` versus
    `issue-triage-report` and `issue-triage-action`.
  - Target: selectors in workflows match Route Table route ids or an explicitly
    supported unambiguous consumer selector.

- [ ] Promote the Route Table template from placeholder maturity to explicit
  user-project readiness states.
  - Current evidence: disabled generated routes have `maturity.runner:
    missing`.
  - Target: every route row states whether it is `missing`, `designed`,
    `replayed`, `dogfooded`, or `user-project-ready`, with no ambiguous product
    copy.

- [ ] Add a user-project readiness matrix to README and Quickstart.
  - Target: users can see which routes are safe defaults, which require
    confirmation, which are report-only, and which are real live runners.

- [ ] Add generated-bundle E2E tests.
  - Target: initialize a temporary user project with
    `zj-loop-init --add github-actions`, enable a selected route, run the
    relevant deterministic command/API, and assert expected evidence output.

- [ ] Keep report-only routes out of worker side effects.
  - Target: report routes can recommend or record evidence only; side effects
    move to a separate action-capable route.

## Consumer Checklists

### CI Sweeper

- [ ] Move or expose deterministic repair logic through a published package
  command/API.
- [ ] Update generated `zj-loop-ci-sweeper.yml` to call the packaged runner
  after route authorization.
- [ ] Preserve narrow scope: validate-patterns/audit generated-artifact repair
  or escalation only.
- [ ] Verify generated workflow can create repair PR or escalation issue in a
  user-project-shaped dogfood run.
- [ ] Update Route Table template maturity to `user-project-ready` only after
  generated-bundle evidence exists.

### Roadmap-Sliced Development Activation

- [ ] Expose activation request parsing, authorization, duplicate detection,
  and request comment creation through published package CLI/API.
- [ ] Add or update generated workflow for issue slash-command activation.
- [ ] Ensure activation only creates an Activation Request; roadmap branch,
  implementation, verification, and PR remain owned by Roadmap-Sliced
  Development.
- [ ] Prove resume/failure behavior uses explicit issue or request ids and does
  not loop automatically.
- [ ] Document that slice implementation is bounded and not an unbounded
  autonomous loop.

### PR Steward Fix Request

- [ ] Align generated route id with dogfood semantics:
  `pr-steward-fix-request` for action-capable fix requests, and
  `pr-steward-report` for report-only observation.
- [ ] Package PR check rollup, request creation, dedupe, and claim eligibility.
- [ ] Keep source PR comments, labels, rebase, merge, workflow dispatch, repair,
  branch creation, and Fix PR creation forbidden during report and claim-only
  phases.
- [ ] Add generated-bundle evidence that a failing PR can create or update an
  independent Issue Fix Request carrier.
- [ ] Promote runner beyond `replayed` only after workflow-dispatch evidence.

### Dependency Sweeper

- [ ] Package dependency request creation, risk policy, claim eligibility, and
  repair/escalation runner boundaries.
- [ ] Keep patch/minor risk and verifier requirements deterministic.
- [ ] Update generated workflow to create or claim Issue Fix Requests only after
  Route Table authorization.
- [ ] Add generated-bundle evidence for at least one safe dependency request
  and one denied/escalated request.
- [ ] Promote to live only when branch/PR creation and verification gates are
  exercised through generated workflow.

### Changelog Drafter

- [ ] Keep report observation separate from draft-producing action.
- [ ] Decide whether the user-project-ready action route should be named
  `changelog-drafter-draft-request` rather than generic
  `changelog-drafter`.
- [ ] Package release-window detection, draft request creation, and draft PR or
  draft evidence generation.
- [ ] Ensure generated workflow never tags, releases, publishes, or merges.
- [ ] Prove generated-bundle evidence for draft evidence and draft PR boundary.

### Issue Triage Action

- [ ] Keep `issue-triage-report` report-only.
- [ ] Package `issue-triage-action` dry-run and live guarded action runner.
- [ ] Keep live mutation limited to allowlisted labels and fixed comment
  templates.
- [ ] Add generated workflow support for dry-run first, then live promotion with
  explicit Route Table enablement.
- [ ] Prove unsupported labels, freeform comments, lifecycle transitions,
  assignments, milestones, close/reopen, and batch mutation are denied.

### Post-Merge Roadmap Closeout

- [ ] Align generated workflow selector with route id
  `post-merge-roadmap-closeout`.
- [ ] Package contract parsing, dry-run plan, live guarded cleanup, and evidence
  formatting.
- [ ] Keep live cleanup narrow: only merged `zjal/` roadmap branch deletion and
  carrier issue closure named by a valid post-merge contract.
- [ ] Require fixed confirmation phrase for live cleanup.
- [ ] Add generated-bundle evidence for dry-run, skipped, denied, and live
  cleanup paths.

### Manual Smoke And Report Routes

- [ ] Keep manual smoke enabled by default and side-effect free.
- [ ] Ensure smoke validates generated metadata, pinned package versions, Route
  Table presence, and audit command availability.
- [ ] Keep `human`, `ignore`, `daily-triage-report`, `manual-smoke-report`,
  `issue-triage-report`, and `pr-steward-report` visibly report-only.
- [ ] Add docs that report-only status is intentional, not an unfinished live
  runner.

## User Choice Model

- [ ] `zj-loop-init --add github-actions` installs all generated workflows and
  a Route Table with safe defaults.
- [ ] Only manual smoke and selected report routes are enabled by default.
- [ ] Each side-effecting route can be enabled independently with
  `zj-loop-route enable <route-or-consumer> --confirm "<fixed phrase>"`.
- [ ] The user can inspect route readiness with `zj-loop-route status`.
- [ ] The README presents route options as a menu of independently ready
  consumers instead of a single recommended first route.

## Release Gate

Do not claim "user-project-ready Route consumers" until:

- [ ] every action-capable generated workflow calls a published package
  command/API
- [ ] every action-capable route has generated-bundle dogfood evidence
- [ ] Route Table templates and dogfood Route Table use aligned route ids
- [ ] README and Quickstart expose the self-selection model
- [ ] audit/validate gates catch template drift, package version drift, and
  route execution contract drift
