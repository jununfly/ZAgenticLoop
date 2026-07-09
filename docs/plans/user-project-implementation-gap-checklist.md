# User Project Implementation Gap Checklist

Status: draft checklist

Goal: identify the remaining gaps between the current generated-bundle
installation path and a real user-project implementation where Route consumers
can process signals into bounded outcomes.

## Readiness Vocabulary

- [ ] Split the current overloaded `user-project-ready` language into two
  explicit levels:
  - `install-ready`: a user project can generate Route Table rows, workflows,
    package commands, and evidence/plan outputs.
  - `execution-ready`: a user project can process a real signal into a durable
    request carrier, run the matching consumer, and produce the consumer's
    bounded completion form.
- [ ] Update Route Table maturity/status surfaces so agents cannot mistake
  generated workflow availability for live execution capability.
- [ ] Update README, Quickstart, architecture docs, and release gates to use
  the split terminology consistently.

## Current Reality To Preserve

- [ ] Keep generated bundle installation as the safe baseline:
  `zj-loop-init . --add github-actions`.
- [ ] Keep manual smoke enabled and side-effect free by default.
- [ ] Keep action-capable routes disabled by default until explicit
  `zj-loop-route enable ... --confirm "<fixed phrase>"`.
- [ ] Keep report-only routes visibly report-only; do not smuggle worker
  behavior into report routes.
- [ ] Keep consumer-specific commands rather than creating a generic mega-runner.

## Product Gaps

- [ ] Provide a clearer first-run command sequence for user projects:
  install bundle, run smoke, inspect route status, enable one route, trigger one
  consumer path, inspect evidence.
- [ ] Add `zj-loop-route doctor <route-or-consumer>` or equivalent diagnostic
  output that explains why a route is not executable yet.
- [ ] Add next-step output to generated workflows when a route is disabled,
  missing permissions, missing request JSON, or blocked by maturity.
- [ ] Make generated workflow summaries consistent across consumers: route
  decision, consumer plan, request carrier, runner output, result status, and
  next steps.
- [ ] Document a route-by-route "first useful path" for users choosing their
  first automation.

## Protocol Gaps

- [ ] Add a deterministic bridge from Route Decision to the correct durable
  carrier:
  - Issue Fix Request for fix runners.
  - Activation Request for Roadmap-Sliced Development.
  - Draft Request for Changelog Drafter.
  - Triage Action Request for issue triage action.
  - Post-merge closeout contract for cleanup.
- [ ] Ensure every request carrier has append-only evidence, dedupe, retry, and
  failed/resumable semantics.
- [ ] Roadmap Activation lifecycle uses fixed states:
  `requested -> consumed -> running -> blocked|failed|completed|merged`.
  - `blocked`: requires human grill, then may resume after a recorded decision.
  - `failed`: technical failure; manual resume is allowed, automatic retry is
    limited to one idempotent retry on the same commit/head.
  - Verification failure classification:
    - `failed`: tool, environment, permission, network, or script failure; also
      applies when the same verification command cannot run before code changes.
      One idempotent automatic retry is allowed before stopping.
    - `blocked`: product logic conflict, unresolved design decision, risk
      expansion, or a verification failure that needs human grill.
    - Red contract tests are not human gates by themselves. In a TDD slice, the
      agent continues implementation until the red test turns green or a true
      `blocked`/`failed` condition appears.
  - `completed`: PR exists and slices are completed; do not re-run.
  - `merged`: hand off to post-merge closeout.
  - New requirement changes create a new Activation Request rather than
    mutating or reusing an old request.
- [ ] Human grill decisions for Roadmap Activation resume are stored in the
  same Activation Request carrier as append-only structured comments.
  Roadmap/process state keeps a working summary and resume anchor; PR body or
  closeout notes absorb durable decisions before merge.
- [ ] Ensure generated workflows never require users to paste raw JSON for the
  main happy path; raw JSON can remain an escape hatch.
- [ ] Keep request creation separate from request consumption so retries and
  failures remain audit-friendly.
- [ ] Store execution-ready opt-in in the Route Table as the authority:
  - Route Table owns `enabled`, `readiness`, `consumer_id`, side-effect level,
    required permissions, and fixed confirmation phrase summary.
  - Workflow inputs may choose a one-time target or trigger source, but must not
    override disabled routes or promote `install-ready` routes to
    `execution-ready`.
  - Package commands such as `zj-loop-route enable <route> --execution-ready
    --confirm "<fixed phrase>"` update the Route Table instead of asking users
    to hand-edit YAML.
  - README and Quickstart teach command-driven enablement.
  - Workflow health/release gates fail, or at minimum report workflow health
    failure, when a workflow claims live runner behavior but the Route Table is
    not both `execution-ready` and `enabled`.
- [ ] Implement deterministic APIs/scripts for protocol-critical Roadmap
  Activation steps so agents do not guess at runtime:
  - Parse issue-comment slash commands.
  - Authorize actors against maintainer/collaborator allowlists.
  - Dedupe Activation Requests.
  - Create append-only structured Activation Request comments.
  - Compute stable `activation_request_id` values.
  - Validate Route Table readiness, enabled state, and consumer match.
  - Generate branch names, PR titles, and PR body contract blocks.
  - Classify lifecycle state transitions.
  - Detect loop-prevention markers.
  - Render GitHub workflow summaries and structured `nextSteps`.
- [ ] Keep judgment-heavy Roadmap Activation work in the agent/consumer layer:
  roadmap slicing, slice implementation, test-failure repair, human-grill
  judgment, and durable-doc natural-language drafting.

## Execution Gaps

- [ ] CI Sweeper: move from repair-plan evidence to an execution-ready path
  that can create a verifier-backed repair PR or escalation issue in a user
  project.
- [ ] Dependency Sweeper: create Issue Fix Request from dependency signal,
  consume/claim it, then create bounded repair PR or escalation issue.
- [ ] PR Steward: convert PR check failure into an independent Issue Fix
  Request, then run an allowlisted fix consumer without mutating the source PR.
- [ ] Changelog Drafter: convert release-window evidence into a draft request,
  then produce draft evidence or a draft PR without tagging, releasing, or
  publishing.
- [ ] Issue Triage Action: keep dry-run as install-ready; define the explicit
  promotion path for allowlisted labels/fixed comments to become
  execution-ready.
- [ ] Roadmap Activation: support issue-comment slash command ingestion as the
  main path, not only workflow-dispatch inputs.
- [ ] Roadmap Activation execution-ready target includes creating an Activation
  Request, triggering Roadmap-Sliced Consumer, creating the roadmap branch/PR,
  automatically completing all slices, and auto-merging when every hard gate
  passes; problems and high-risk decisions must stop and grill the human.
  This intentionally goes beyond the current repository constraint that forbids
  auto-merge and therefore needs a separate guard/permission design before
  implementation.
- [ ] Roadmap Activation auto-merge boundary:
  - Default behavior: automatically implement slices, create/update PR, request
    review, and stop before merge.
  - Opt-in behavior: allow `execution.auto_merge: platform-auto-merge` only
    when repository branch protection, required checks, review policy, closeout
    evidence, and unresolved-risk gates all pass.
  - Forbidden behavior: scripts must not directly merge into protected/main or
    bypass GitHub/GitLab protection.
- [ ] Roadmap Activation automated slice execution uses fixed hard gates before
  PR-ready/review handoff:
  - Activation scope gate: the slice remains inside the Activation Request
    scope or an explicitly recorded allowed expansion.
  - Leaf completion gate: every leaf is `completed`, `deferred`, or
    `linked-follow-up`; empty status is not allowed.
  - Verification gate: every completed leaf has command-level evidence; failed
    verification stops the run as `blocked` or `failed`.
  - Decision audit gate: every human grill decision is recorded as an
    append-only structured comment on the Activation Request carrier.
  - Working state gate: roadmap/process state contains enough resume context to
    continue from the current slice.
  - PR evidence gate: PR body or closeout notes absorb key decisions and
    verification evidence before review handoff.
  - Risk gate: new side-effect classes, release/merge policy changes,
    permission expansion, or cross-route behavior stop for human grill.
- [ ] Roadmap Activation branch, PR, carrier, and closeout linkage uses a fixed
  protocol:
  - Activation Request comment generates a stable `activation_request_id`.
  - Branch name is `zjal/<activation-request-id>-<short-slug>`.
  - PR title is `Roadmap Activation: <short title>`.
  - PR body contains a structured contract block with
    `activation_request_id`, source issue/comment URL, route id, consumer id,
    branch name, lifecycle state, and closeout contract.
  - Roadmap/process state stores resume anchors only and is not the unique audit
    source.
  - Post-Merge Closeout consumes only the PR body closeout contract; it must not
    infer cleanup targets by guessing branch names or scanning state files.
- [ ] Post-Merge Closeout: support contract-backed dry-run and narrow live
  cleanup with fixed confirmation phrase and carrier issue boundaries.

## Generated Workflow Gaps

- [ ] Replace manual JSON workflow inputs with event-derived or issue-comment
  derived request creation on the main path.
- [ ] Use artifacts or comments for structured evidence that is easy to replay.
- [ ] Add workflow permissions that match each route's actual side-effect
  level, avoiding both under-permissioned failure and broad default scopes.
- [ ] Add concurrency/dedupe keys for workflows that may run repeatedly on the
  same signal.
- [ ] Add workflow-level loop prevention: generated branches, generated PRs,
  and generated comments must not recursively retrigger the same route.

## Test And Gate Gaps

- [ ] Extend `test:generated-bundle-release-gate` from structure checks to
  fixture-based execution checks.
- [ ] Add a deterministic local Roadmap Activation fixture as a release gate:
  - Generate `zj-loop/route-table.yaml` and GitHub workflows.
  - Simulate an issue-comment slash command.
  - Build an Activation Request payload.
  - Route Dispatcher routes to the `roadmap-sliced-development` consumer.
  - Consumer dry-run produces deterministic branch/PR plan, structured PR
    contract block, and closeout contract.
  - Cover disabled route, duplicate request, invalid actor, missing permission,
    and loop-prevention marker cases.
- [ ] Add a GitHub smoke fixture for dogfood/periodic validation:
  - Create a real issue comment in this repository or a test repository.
  - Confirm Activation Request issue/comment creation or update.
  - Confirm consumer workflow trigger.
  - Confirm branch/PR output or `blocked`/`failed` evidence.
  - Keep real GitHub writes out of the normal release gate.
- [ ] Add generated user-project fixtures for each selected first route.
- [ ] Test disabled route, enabled route, missing permission, duplicate request,
  successful bounded outcome, and escalation outcome per consumer.
- [ ] Test that generated workflows call published package commands only.
- [ ] Test that `install-ready` routes are not reported as `execution-ready`.
- [ ] Add release-blocking gates for the new readiness vocabulary.

## Documentation Gaps

- [ ] Update route docs to explain `install-ready` versus `execution-ready`.
- [ ] Apply release wording gates before README or release notes claim user
  project capability:
  - Allowed wording: `install-ready` means generated Route Table rows,
    workflows, commands, and report/plan evidence are available.
  - Allowed wording: `execution-ready` means real signals can become durable
    request carriers and bounded consumer outcomes.
  - Allowed wording: `dogfood-verified` means verified in this repository or a
    test repository, but it is not automatically a user-project capability
    claim.
  - `report-only`, `dry-run`, and `claim-only` must be explicitly labeled.
  - Disallowed wording: ambiguous "ready for user projects" without naming the
    readiness level.
  - Disallowed wording: "automated fix" when the route only produces a plan or
    report.
  - Disallowed wording: "end-to-end" before durable carrier creation, consumer
    execution, and bounded outcome evidence exist.
- [ ] Show one complete user-project walkthrough for the first recommended
  route.
- [ ] Add failure diagnosis examples: disabled route, stale request, duplicate
  request, missing permission, verifier failure, and no-op repair.
- [ ] Keep dogfood evidence separate from user-project capability claims.
- [ ] Add a durable migration note for any renamed readiness fields.

## Open Design Questions

- [x] Should `user-project-ready` be split?
  - Decision: yes. Use `install-ready` and `execution-ready`.
- [x] Should generated workflows create request carriers directly, or should a
  shared Route Dispatcher command create them before consumer workflows run?
  - Decision: use shared deterministic Route Dispatcher APIs/CLI, with
    route-specific carrier builders behind them.
- [x] Should execution-ready be route-by-route or bundle-wide?
  - Decision: route-by-route. The bundle can be install-ready while individual
    consumers graduate to execution-ready.
- [x] Should live issue mutation be part of the next execution-ready target?
  - Decision: no. Keep Issue Triage Action install-ready/dry-run until the safer
    fix/draft/activation/cleanup paths prove the model.
- [x] What is the first execution-ready route to dogfood in a user-shaped
  project?
  - Decision: Roadmap Activation first, CI Sweeper second. Roadmap Activation
    has the clearest product path from issue-comment plan input to
    Roadmap-Sliced branch/PR, while CI Sweeper is the next best bounded repair
    route.
- [x] Can an automated Roadmap Activation dynamically expand the roadmap while
  completing slices?
  - Decision: yes, but only inside a scope guard. Allowed expansion includes
    necessary leaf additions, slice splitting, and linked follow-up leaf
    creation that directly supports the activation goal. Human grill is
    required for parent-goal changes, new product areas, new side-effect
    classes, or release/merge policy changes. Reasonable out-of-scope work
    becomes a new follow-up issue or Activation Request rather than silently
    expanding the current run.
- [x] Which hard gates are required before automated Roadmap Activation can
  move to PR-ready or review handoff?
  - Decision: require seven fixed gates: activation scope, leaf completion,
    verification evidence, decision audit, resumable working state, PR evidence,
    and risk escalation. A run that cannot satisfy these gates stops as
    `blocked` or `failed` instead of continuing silently.
- [x] If automated slice verification fails, should the run enter `blocked` or
  `failed`?
  - Decision: distinguish technical failure from decision/risk blockage.
    Tooling, environment, permission, network, script, or pre-existing command
    failures enter `failed`, with at most one idempotent automatic retry.
    Product logic conflicts, unresolved decisions, risk expansion, or failures
    needing human grill enter `blocked`. Red contract tests in TDD are normal
    implementation signals, not human gates.
- [x] Should Roadmap Activation branch, PR, carrier, and closeout linkage be a
  fixed protocol?
  - Decision: yes. Use stable `activation_request_id`, deterministic `zjal/`
    branch naming, structured PR body contract, and contract-backed closeout.
    Roadmap/process state may help resume work but must not become the only
    audit source or cleanup source.
- [x] Where should user-project `execution-ready` opt-in configuration live?
  - Decision: Route Table is the authority. Workflows can trigger or select a
    target for one run, but cannot override disabled routes or upgrade route
    readiness. Package commands update the Route Table, docs present the
    command path, and workflow health/release gates detect live-runner claims
    that are not backed by `execution-ready` plus `enabled`.
- [x] How far must the Roadmap Activation user-project E2E fixture go before
  the route can claim `execution-ready`?
  - Decision: use two layers. A deterministic local fixture is release-gating
    and validates generated bundle output, issue-comment ingestion, Activation
    Request payload creation, Route Dispatcher selection, consumer dry-run
    output, contract blocks, duplicates, permissions, invalid actors, disabled
    routes, and loop prevention. A real GitHub smoke fixture remains
    dogfood/periodic validation and verifies issue comment, carrier creation,
    workflow trigger, and branch/PR or `blocked`/`failed` evidence without
    making live GitHub writes part of every release gate.
- [x] What capability claims are allowed before a route reaches
  `execution-ready`?
  - Decision: ban ambiguous `user-project-ready` wording. README and release
    notes must distinguish `install-ready`, `execution-ready`,
    `dogfood-verified`, `report-only`, `dry-run`, and `claim-only`. Do not claim
    "automated fix" for plan/report routes or "end-to-end" before durable
    carrier, consumer execution, and bounded outcome evidence exist.
- [x] Which Roadmap Activation steps must be deterministic scripts/APIs instead
  of agent judgment?
  - Decision: deterministic code owns protocol-critical parsing, authorization,
    dedupe, request/comment rendering, stable IDs, Route Table validation,
    branch/PR/contract generation, lifecycle transition classification,
    loop-prevention detection, and workflow summary/`nextSteps` rendering.
    Agents/consumers own roadmap slicing, implementation, repair reasoning,
    human-grill judgment, and durable-doc prose.
