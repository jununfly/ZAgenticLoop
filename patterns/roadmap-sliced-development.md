# Roadmap-Sliced Development Pattern

Roadmap-Sliced Development is a reusable human-agent development pattern for
turning ambiguous product, architecture, documentation, or release initiatives
into reviewable slices with explicit decisions, verification evidence, commits,
and PR handoff.

Pattern id: **roadmap-sliced-development**
Chinese name: **路线图切片开发循环**

## Goal

Turn a large, ambiguous product/architecture/release goal into a sequence of
bounded slices, each with explicit decisions, verification, commits, and a final
cleanup step that folds temporary process notes back into durable docs.

This pattern is for active development work, not background maintenance. In this
repo, automated Daily Triage keeps repo state fresh; Roadmap-Sliced Development
Pattern drives focused human-led change.

## When It Fits

Use this pattern when the work has high ambiguity and high cross-file coupling:

- brand and domain language alignment
- architecture optimization
- release preparation
- product experience/documentation reshape
- package rename, package boundary, or public API cleanup
- multi-step refactors where each step must remain reviewable

Do not use it for small direct edits, routine dependency updates, or tasks where
the next action is already obvious.

## Entry Criteria

Use this pattern only when at least two of these are true:

- the task needs multiple directional decisions
- the task touches more than one architectural layer
- the task affects public package names, CLI names, URLs, docs, release gates, or
  user mental models
- the task has meaningful sequencing risk
- the human expects to steer through repeated short confirmations
- the work will need a closeout step that merges process knowledge into durable
  docs

Prefer a simpler direct-edit workflow when the change can be done and reviewed
as one obvious patch.

## Scheduling / Cadence

This is not a fixed cron loop. The cadence is human-pulled:

- **Grill session**: clarify scope and pressure-test direction.
- **Roadmap session**: create or extend the shared map.
- **Slice session**: execute one bounded "next cut".
- **Checkpoint**: commit to the roadmap branch.
- **Closeout**: merge process files into durable docs, delete roadmap/process
  files, and commit.

The user-facing command rhythm has been:

```text
先提交修改；然后 [$zj-grill-me] [$zj-roadmap-driven] 开始下一刀
```

That rhythm is the scheduler.

## Required Skills

- `zj-grill-me` — interrogates assumptions one branch at a time. It asks only
  when repo exploration cannot answer the question.
- `zj-roadmap-driven` — keeps the shared map in JSON, renders a lightweight
  Markdown view, and records decisions at the node where they matter.
- `zj-grill-with-docs` — used near closeout when process notes need to be
  consolidated into stable domain or architecture docs.
- Repo-local `AGENTS.md` / domain docs — provide build commands, review norms,
  protected areas, and vocabulary.

Optional but recurring supporting moves:

- refresh the repo's code intelligence index before code-heavy work.
- branch creation for bounded initiative work.
- direct git hygiene: commit, merge to `origin/main`, prune merged branches.

## State

State is layered rather than singular:

| State surface | Purpose |
| --- | --- |
| Roadmap JSON | Source of truth for task tree, status, and decisions during the initiative. |
| Roadmap Markdown | Human-readable progress window; generated from JSON. |
| Git commits | Durable checkpoints after each completed slice. |
| Durable docs | Final resting place for decisions after closeout. |
| `zj-loop/STATE.md` / `zj-loop/zj-loop-run-log.md` | Background repo operations evidence, not the main active-development state. |

The important rule is: process state is temporary, decisions are not. Closeout
must move durable decisions into docs before deleting roadmap/process files.

## Runtime Contract

When a user says "run under ZAgenticLoop constraints" or invokes this pattern
for continuous execution, the agent should run leaf-by-leaf on the dedicated
roadmap branch:

1. select the current executable leaf node
2. confirm the leaf has a verification or decision-only gate
3. confirm the leaf has lightweight commit intent
4. execute the slice
5. run the declared verification gate
6. update roadmap status, notes, and verification evidence before commit
7. commit the leaf slice by default
8. continue to the next executable leaf

Automatic leaf commits are part of the default runtime contract once the
roadmap has a dedicated branch. If the user explicitly disables automatic slice
commits, stop at the commit boundary and wait for authorization.

The loop stops only when one of these happens:

- roadmap completed
- Human Gate reached
- final or unexpected verification gate failed
- scope expansion is needed
- roadmap write safety cannot be trusted
- external blocker prevents meaningful progress
- budget, time, or context limit is reached
- user explicitly disabled automatic slice commits and the next action is a
  commit boundary

Stopping is correct when the next action requires human judgment,
shared-state mutation, or a changed roadmap boundary.

Expected-red contract tests are not stop conditions when the leaf notes or
commit intent identify them as expected. They become stop conditions only if the
leaf's final verification gate remains red.

## Activation Request Contract

Roadmap-Sliced Development may be started manually by a human, or by consuming a
pending activation request that was created from an authorized issue comment.
When the trigger comes from plan intake, the GitHub issue remains the canonical
PRD/plan record and the activation lifecycle lives in append-only structured
issue comments.

The accepted first-version command is:

```text
/zj-loop start roadmap-sliced-development
```

Activation rules:

- Labels are routing metadata, not lifecycle state.
- `zj-loop/STATE.md` is Daily Triage memory, not an activation queue.
- `zj-loop-activate` owns slash command parsing, GitHub permission checks,
  allowlist checks, duplicate detection, and request/denial comments.
- The slash command creates only an activation request. It does not create a
  branch, roadmap, commits, PR, or implementation work.
- Roadmap-Sliced Development consumes only an explicitly provided issue id or
  request id by default. It must not scan all issues as a global work queue.
- Duplicate commands while a pending request exists append a duplicate response
  that references the existing `request_id`.
- Failed activation consumption is terminal for that request. Retry requires a
  new activation request.
- Once a request is consumed, later branch, roadmap, slice, verification, or
  commit failures are resumed inside the Roadmap-Sliced lifecycle and do not
  require reactivation.
- If a slash command repeats after a request is already consumed, activation
  dispatch writes audit-only `zj-loop.activation-resume-existing` evidence with
  the original `request_id`, consumed comment id, resume anchors, and
  `resume_policy: resume-without-new-activation`; it must not create another
  activation request.
- If a consumed request is missing resume anchors, activation dispatch fails
  closed with `zj-loop.activation-resume-blocked` and reason
  `missing-resume-anchors`; the Roadmap-Sliced Consumer or human must repair the
  consumed lifecycle evidence instead of guessing.
- Activation dispatch records resume anchors but does not check whether
  `roadmap_branch` or `roadmap_file` still exists. Stale anchor handling belongs
  to the Roadmap-Sliced Consumer resume path.
- Lifecycle comments are append-only; do not edit the original request comment.

The consumed comment must include enough resume anchors for a human or agent to
continue without reactivation:

- `roadmap_branch`
- `roadmap_file`
- `roadmap_view`
- `next_action`

If lifecycle parsing is missing, inconsistent, or ambiguous, fail closed and
require human review before creating or consuming another request.

## Roadmap Write Safety

Roadmap JSON is the source of truth. Markdown is a generated view. Product
surfaces that write roadmap state should treat writes as serialized critical
sections:

- every write command obtains a per-roadmap lock
- read commands can proceed without mutating the lock
- stale locks are not cleared automatically by default
- timeout messages include lock owner, lock path, and exact unlock command
- explicit unlock requires human or operator intent
- render runs after successful substantive writes

If a write times out waiting for a lock, the agent stops rather than
auto-unlocking. Unlock is allowed only when the user explicitly approves it or
the operator runs an explicit unlock action.

Active construction should prefer shallow executable leaves under a visible
parent. Warn, but do not hard-block, when the active focus is deeper than depth
3 from the roadmap root; then lift or fold the focus, or record why the deeper
focus remains executable.

## Operational Mapping

Use this mapping to keep roadmap language tied to concrete development systems:

| Pattern concept | Product/planning equivalent | Development equivalent |
| --- | --- | --- |
| Roadmap | PRD / plan | One bounded git branch, usually one PR at closeout. |
| Parent node | Plan section / major slice | A reviewable workstream inside the branch; may map to an issue/epic when tracker hierarchy is useful. |
| Leaf node | Slice / issue | One issue-tracker item or one commit-sized task. |
| Decision | Product/architecture decision | Roadmap JSON decision plus durable doc/ADR entry when it survives closeout. |
| Rendered roadmap Markdown | Human progress view | PR progress summary or planning appendix. |
| Closeout | Plan completion | PR opened with branch merge request, verification notes, and durable-doc updates. |

PR rule:

- A non-trivial roadmap maps to one PR by default.
- If the roadmap is too large for one PR, split PRs by parent node.
- Multi-PR roadmaps must record the split relationship in the roadmap and in
  every PR body.

Branch rule:

- A non-trivial roadmap **must** use a dedicated git branch.
- Allowed exceptions: read-only analysis or a tiny documentation correction.
- If no branch is created, record a roadmap decision explaining why the work is
  read-only, tiny, or intentionally kept on the current branch.

Recommended branch naming:

```text
zjal-<roadmap-id>
```

Historical `zjal/<roadmap-id>` branches may still be consumed by closeout
guards, but new automation must generate the single-segment `zjal-...` form.
This avoids Git ref prefix conflicts when a repository already has a `zjal`
branch or stale `refs/*/zjal` file.

Recommended issue naming:

```text
[roadmap-id] <leaf-node-id> <self-explaining slice label>
```

The roadmap owns planning structure; the issue tracker owns externally visible
work items; the PR owns merge review.

## Minimal Viable Checklist

Use these seven items as the hard gate for practical execution. If this checklist
cannot be satisfied, the initiative is not ready to run as Roadmap-Sliced
Development.

1. **Branch**: non-trivial roadmap work uses a dedicated git branch, unless a
   recorded exception applies.
2. **Leaf gate**: every leaf node declares a verification or decision-only gate.
3. **Commit intent**: every leaf node has lightweight commit intent before
   implementation starts.
4. **Evidence before commit**: leaf status, notes, and verification evidence are
   updated before committing the slice.
5. **Gate-backed status**: `completed` means gate passed or decision-only gate
   satisfied.
6. **Decision audit**: closeout classifies each roadmap decision as `durable
   doc`, `PR only`, or `discarded process note`.
7. **Separate closeout commit**: closeout is committed separately from the final
   feature slice.

Other rules in this document are recommended practices or L3 hardening unless a
specific roadmap raises their risk enough to make them explicit gates.

## Typical Cycle

1. **Frame the initiative**  
   Name the goal, create or extend a roadmap, and decide whether the work is
   explore or exploit.

2. **Create the branch**  
   For non-trivial work, create a dedicated git branch from the roadmap id before
   implementation starts. If the branch is intentionally skipped, record the
   exception as a roadmap decision before editing files.

3. **Grill the uncertainty**  
   Resolve one decision branch at a time. If the repo can answer, inspect the
   repo instead of asking the human.

4. **Control roadmap expansion**  
   When adding parent or leaf nodes, record whether the expansion is scope
   correction, discovered dependency, or follow-up. Follow-up nodes do not enter
   the current PR unless a Human Gate explicitly approves the scope expansion.

5. **Record the decision**  
   Each directional decision lands on the roadmap node. A decision not recorded
   is treated as not settled.

6. **Execute one slice**  
   Implement the smallest slice that advances the roadmap without mixing
   unrelated refactors.

7. **Verify locally**  
   Run the smallest meaningful gate: `git diff --check`, package tests, build,
   audit, Pages link check, or release validation depending on the slice.

8. **Update slice evidence**  
   Before committing, update the leaf-node status, notes, and verification
   evidence so the commit contains the complete reviewable process state.

9. **Commit the slice**  
   Commit after the slice is coherent. Commit is the hard boundary of a slice:
   if it cannot be committed cleanly, the slice is still too large or not done.

10. **Repeat or close**
   Continue with the next slice, expand the roadmap when needed, or close out by
   consolidating process docs into durable docs and deleting temporary files.

11. **Close out and hand off the PR**
   After the closeout commit, continue automatically to PR handoff: confirm the
   branch is clean, push the roadmap branch, and open or update the PR with
   verification notes, closeout status, durable docs, and the post-merge branch
   cleanup plan. `closeout commit complete` is not the same as `roadmap loop
   complete`.

## Definition of Slice

One slice should satisfy all of these:

- advances one roadmap node or one tightly related sibling group
- has one primary behavioral/documentation/release outcome
- can be verified with a named gate
- has a lightweight commit intent before implementation starts
- can be committed with a specific commit message
- defaults to one coherent commit
- has status, notes, and verification evidence updated before commit
- maps to one issue-tracker item when the work needs external tracking
- does not require the human to remember hidden context outside the roadmap
- leaves the repo in a coherent state if the next slice never happens

If a slice cannot meet those conditions, split it before implementation.

Commit intent rule:

- Each leaf node should declare a lightweight commit intent before execution.
- The final commit message does not have to match the intent word for word.
- If the actual change substantially diverges from the intent, split the slice
  or record the decision before committing.

Commit count rule:

- A leaf node defaults to one coherent commit.
- Multiple commits are allowed when they still belong to the same leaf, such as
  implementation followed by tests/docs, or mechanical rename followed by
  behavior convergence.
- If the commits represent separable outcomes, split them into separate leaf
  nodes instead.

Commit readiness rule:

- Before committing a slice, update the leaf-node status, notes, and
  verification evidence.
- The commit should contain the complete reviewable process state for that
  slice.
- After the commit, a lightweight follow-up is allowed only for commit hashes,
  PR links, or other information that could not exist before the commit.

Verification gate rule:

- Every leaf node must declare a verification gate.
- A slice without a gate is not ready to commit.
- Research/decision-only leaves still need gates, such as `decision recorded`,
  `durable doc updated`, or `human confirmed`.

Status evidence rule:

- `completed` means the verification gate passed or a decision-only gate was
  satisfied.
- If the gate has not passed, the node must remain `in_progress`, become
  `blocked`, or be marked as deferred with a follow-up issue.
- Do not mark a node `completed` based on subjective confidence alone.

## Parent Node Completion Criteria

Parent nodes need completion criteria, but not leaf-level verification gates.
A parent node is complete when:

- every child leaf is completed, intentionally deferred, or linked to a
  follow-up issue
- the parent-level durable decision has been archived in durable docs, ADRs, or
  the PR body
- no child leaf requires hidden chat context to understand its status

This keeps parent nodes from becoming empty folder labels.

Deferred leaf rule:

- Deferred leaf nodes must create follow-up issues by default.
- The only exception is an explicit `won't do` decision with the reason recorded
  in the roadmap and PR.

Roadmap expansion rule:

- New parent or leaf nodes must record an expansion reason.
- Use `scope correction` when the original goal already required the node.
- Use `discovered dependency` when the node blocks the current goal.
- Use `follow-up` when the work is valuable but does not block the current goal.
- After adding `scope correction` or `discovered dependency` nodes, reassess
  whether the roadmap still fits one PR.
- If the expansion makes the PR too large, split PRs by parent node and record
  the split relationship in the roadmap and PR bodies.
- Follow-up nodes do not enter the current PR unless a Human Gate explicitly
  approves the scope expansion.

## Issue Tracker Guidance

Leaf nodes are the natural issue boundary, but not every leaf node needs an
external issue. Parent nodes may map to an issue/epic when the tracker supports
hierarchy or the work needs unified discussion and scheduling across multiple
leaf nodes. Create tracker issues when the work needs assignment, review, async
discussion, or cross-tool visibility.

Issue rule:

- A leaf node does **not** have to map one-to-one to an external issue.
- If no external issue is created, the leaf node must still be traceable through
  its roadmap status and final commit.
- Create an external issue only when the work needs cross-person/Agent
  assignment, async discussion, scheduling, review, or tracker-level visibility.

Recommended issue fields:

- roadmap id
- node id
- slice label
- expected verification gate
- human gate, if any
- branch or PR link once available

Avoid creating issues for roadmap bookkeeping nodes. Parent nodes are usually
planning structure, not issue-tracker work items.

## Maturity Ladder

| Level | Operating mode | Human role | Agent autonomy |
| --- | --- | --- | --- |
| L1 | Roadmap report-only | Approves map, names, and next slice | Explore, summarize, propose, no code changes without explicit instruction. |
| L2 | Assisted slices | Confirms scope and merge boundaries | Implements bounded slices, verifies locally, commits only when asked. |
| L3 | Release-grade initiative loop | Reviews gates and public surfaces | Runs slice/checkpoint/closeout loop with strict gates, branch hygiene, and live link/release checks. |

Recommended default: start each new initiative at L1 until the roadmap is stable,
then move to L2 for implementation. Use L3 only when release gates, branch rules,
and closeout rules are already explicit.

From L2 onward, the Minimal Viable Checklist is mandatory. Additional rules in
this document become L3 hardening when the initiative touches release, public
URLs, package identity, architecture boundaries, or multi-PR coordination.

## Standard Artifact Pack

Each initiative should have predictable artifacts:

| Artifact | Required | Purpose |
| --- | --- | --- |
| `docs/plans/<initiative>-roadmap.json` | Yes | Source of truth for nodes, modes, status, and decisions. |
| `docs/plans/<initiative>-roadmap.md` | Yes | Lightweight human progress window rendered from JSON. |
| Durable design doc or ADR | Usually | Final home for decisions that should survive closeout. |
| Commit series | Yes | Durable run log for completed slices. |
| Verification notes | Yes | Evidence that each slice passed the right gate. |
| Temporary inventories or drafts | Optional | Allowed during explore, deleted or consolidated during closeout. |

The roadmap files are process state. Durable docs and commits are the lasting
knowledge.

Roadmap JSON should usually enter the PR as reviewable process evidence. Before
merge, closeout decides whether it is deleted as process state or promoted into
a durable PRD/plan artifact.

## Closeout Contract

An initiative is not complete just because the final slice works. It is complete
when:

- all leaf nodes are completed, intentionally deferred, or linked to follow-up
  issues
- deferred leaf nodes have follow-up issues unless explicitly marked `won't do`
  with a recorded reason
- durable-decision audit has classified each roadmap decision as `durable doc`,
  `PR only`, or `discarded process note`
- discarded process notes have recorded reasons
- roadmap decisions have been merged into durable docs, ADRs, README, or pattern
  docs
- process roadmap files have been deleted after durable docs/PR absorb the key
  decisions
- roadmaps intended to survive as PRD/plan artifacts have been moved or retained
  as durable docs, not left in the process path
- public links, package names, release gates, or docs touched by the initiative
  have been re-checked
- closeout changes are committed separately from the final feature slice
- final commit is pushed to the roadmap branch
- PR is opened with verification notes and merge request context
- branch cleanup plan is recorded for post-merge execution

Closeout is the guardrail against comprehension debt.

Durable-decision audit rule:

- Before deleting or migrating roadmap files, audit every roadmap decision.
- Classify each decision as `durable doc`, `PR only`, or `discarded process
  note`.
- `durable doc` decisions must be moved into docs, ADRs, README, pattern docs,
  or other lasting artifacts.
- `PR only` decisions must be summarized in the PR body.
- `discarded process note` decisions must include a reason they do not need to
  survive closeout.

Closeout commit rule:

- Closeout must be a separate commit from the final feature slice.
- The closeout commit carries durable docs consolidation, roadmap/process file
  deletion or migration, decision audit, and closeout evidence.
- Do not hide closeout inside the final feature commit.
- Do not treat the closeout commit as terminal for a development roadmap. It is
  complete only after the agent continues to PR handoff, unless a Human Gate
  explicitly pauses before push/PR or push/PR creation is externally blocked.

Closeout is a merge gate:

- PR merge requires closeout to be complete.
- Draft PRs and stacked PRs may declare `closeout pending`.
- A PR must not merge while closeout is still pending.
- Branch cleanup is post-merge checklist work, not a PR merge gate.

Roadmap retention rule:

- Delete process roadmaps by default after closeout.
- Keep a roadmap only when it is intentionally promoted into a durable PRD/plan.
- A durable roadmap should live with durable docs, not in the temporary process
  path.
- It is normal for roadmap JSON/Markdown to appear in the PR for review and then
  disappear before merge.

## PR Contract

The PR is the final review surface for a roadmap. It should include:

- roadmap link
- branch name
- completed parent nodes
- issues closed or linked
- verification commands/results
- durable docs updated
- deferred nodes and follow-up issues
- known risks or human gates resolved
- closeout status

The PR should not require reviewers to reconstruct the roadmap from chat.

Post-closeout continuation rule:

- After closeout commit, the agent continues automatically to PR handoff.
- PR handoff means confirming the branch is clean, pushing the roadmap branch,
  and opening or updating the PR with verification notes, closeout status,
  durable docs, and post-merge branch cleanup plan.
- Treat PR handoff as an executable gate, not a prose-only reminder. Run the
  Roadmap Handoff Gate with branch, PR, closeout, and process-file evidence; do
  not say `roadmap loop complete` unless the gate passes or an explicit Human
  Gate records why push/PR handoff is paused.
- Stopping before PR handoff is valid only when a Human Gate explicitly says to
  pause before push/PR, or when an external blocker prevents push/PR creation.
- If blocked, record the blocker and the exact next command needed to resume.
- `roadmap loop complete` means PR handoff is complete, not merely that closeout
  was committed.

Deterministic PR body handoff:

- Before opening or updating the PR, generate the PR body from structured
  handoff input instead of hand-writing the post-merge contract:

  ```bash
  ROADMAP_HANDOFF_GATE_PATH=/path/to/handoff-input.json npm run roadmap-handoff:body
  ```

- Use the generated body for `gh pr create --body-file` or `gh pr edit
  --body-file`, then run `npm run test:roadmap-handoff` or the
  `scripts/roadmap-handoff-gate.mjs` gate with the live PR evidence.
- If the generated body is not used, the PR handoff is still responsible for a
  valid `zj-loop.post-merge-contract`; otherwise post-merge cleanup must remain
  report-only.

Roadmap evidence policy:

- Include roadmap JSON/Markdown in the PR when it helps reviewers inspect the
  process and decisions.
- Before merge, delete process roadmap files or move them into durable docs.
- `main` should not retain process roadmaps by default unless the PR explicitly
  says they are promoted durable PRD/plan artifacts.

Default: one roadmap, one PR. When a roadmap is intentionally split across
multiple PRs, each PR should state:

- which parent node it covers
- what remains outside the PR
- links to sibling PRs
- whether merge order matters

After roadmap expansion, re-check this PR boundary. `scope correction` and
`discovered dependency` expansions may force a parent-node PR split. `follow-up`
expansions should normally move to a later issue or roadmap instead of expanding
the current PR.

Branch cleanup policy:

- PR body or closeout notes should record a post-merge branch cleanup plan.
- After merge, delete the roadmap branch by default.
- If a branch is retained, record the retention reason.
- Branch cleanup does not block PR merge, but it should be tracked as post-merge
  checklist work.

Post-merge automation boundary:

- Roadmap-Sliced Development does not listen to merge events itself. It defines
  the closeout, PR handoff, and post-merge contract.
- The actual post-merge consumer is Post-Merge Cleanup in `roadmap-closeout`
  mode, routed through the route table.
- PR merge remains a Human Gate.
- Without an explicit machine-readable post-merge contract in the PR body,
  post-merge consumers must report only.
- Automated carrier issue closure is only allowed for the Roadmap activation
  carrier issue named in the contract. Ordinary linked issues are not closed by
  this path.
- Automated branch deletion is only allowed for the already-merged current
  roadmap branch named in the contract. Generic head-branch cleanup is out of
  scope.

The PR body is the source of truth for this contract:

```yaml
kind: zj-loop.post-merge-contract
version: 1
consumer: post-merge-cleanup
mode: roadmap-closeout
roadmap:
  id: <roadmap-id>
  branch: zjal-<roadmap-id>
carrier:
  issue: <activation-carrier-issue-number>
cleanup:
  delete_merged_branch: true
  close_carrier_issue: true
safety:
  require_pr_merged: true
  require_branch_merged: true
  no_pending_followups: true
  missing_contract_behavior: report-only
```

## Extended PR Template

Use this recommended template for PRs created from this pattern when the roadmap
touches release, public URLs, package identity, architecture boundaries, or
multi-PR coordination. The Minimal Viable Checklist remains the hard gate; this
template is recommended / L3 hardening, not a second mandatory checklist.

```markdown
## Roadmap

- Roadmap id:
- Roadmap branch:
- Roadmap link:
- Closeout status: pending | complete
- Closeout commit:
- Post-merge branch cleanup plan:

## Post-Merge Contract

```yaml
kind: zj-loop.post-merge-contract
version: 1
consumer: post-merge-cleanup
mode: roadmap-closeout
roadmap:
  id:
  branch: zjal-
carrier:
  issue:
cleanup:
  delete_merged_branch: true
  close_carrier_issue: true
safety:
  require_pr_merged: true
  require_branch_merged: true
  no_pending_followups: true
  missing_contract_behavior: report-only
```

## Scope

- Covered parent node(s):
- Parent completion criteria:
- Covered leaf node(s):
- Roadmap expansions and reasons:
- Leaf commit intent(s):
- Multi-commit leaf exceptions:
- Leaf status/notes/verification evidence committed:
- Out of scope:
- Sibling PRs / merge order:
- PR boundary reassessed after expansion:

## Issues

- Linked issues:
- Issues closed:
- Leaf nodes without external issues:
- Deferred leaf follow-up issues:
- Verification failure follow-up issues:
- Won't do leaves and reasons:

## Decisions

- Durable decisions moved to docs/ADR:
- Decisions intentionally left only in PR:
- Decisions discarded as process notes and reasons:
- Human Gate decisions recorded:
- Short confirmations interpreted as:
- Human Gate scope:
- Human Gate validity / expiry:

## Verification

- Commands run:
- Results:
- Leaf-node gates satisfied:
- Public links / release surfaces checked:

## Roadmap Retention

- Process roadmap deleted before merge: yes | no
- Promoted durable PRD/plan: yes | no
- Durable location, if retained:

## Risks / Human Gates

- Risks:
- Human gates resolved:
- Verification waivers:
- Follow-up issues:
```

Keep this template local to the pattern until the repo decides whether to make
it the default `.github/PULL_REQUEST_TEMPLATE.md`.

## Pattern Phases

| Phase | Mode | What happens |
| --- | --- | --- |
| Explore | `explore` | Identify missing context, read existing docs/code, propose candidate map. |
| Decision | `explore -> exploit` | Grill open branches and record decisions in the roadmap. |
| Slice | `exploit` | Implement one bounded change set. |
| Checkpoint | `exploit` | Verify, commit, and sometimes push/merge. |
| Closeout | `exploit` | Consolidate temporary work products, delete roadmap/process files, update durable docs. |
| Publish | `exploit` | Tags, package release, Pages/report link verification, branch cleanup. |

## Verification Strategy

Verification is slice-specific. The pattern does not require maximal gates on
every slice; it requires the gate to match risk.

Every leaf node must name its verification gate before it is considered ready
for commit.

Roadmap status follows gate evidence. A node is `completed` only after its gate
passes or its decision-only gate is satisfied.

Expected-red contract tests:

- An expected-red test is not a Human Gate.
- It is part of the implementation workflow when the leaf notes or commit intent
  explicitly say the red result is expected.
- The red test must prove the target gap, and the next step must be the green
  implementation inside the same leaf.
- If the final leaf verification gate is still red, it becomes a failed
  verification gate.

Verification failure rule:

- A failed leaf-node gate blocks the current parent node by default.
- Do not continue to the next slice until the failure is fixed, deferred with a
  follow-up issue, or explicitly allowed by a Human Gate.
- If a human allows continuation, record the decision in the roadmap and PR.
- If a Human Gate allows continuation after verification failure, create a
  follow-up issue by default and record the waiver scope and validity.
- The only exception is an explicit `won't fix` / `won't do` decision with the
  reason recorded in the roadmap and PR.

Observed gate mapping:

| Slice type | Minimum verification |
| --- | --- |
| Documentation/report | `git diff --check`, link scan, direct URL check when public links are involved. |
| Registry or pattern change | registry validation and relevant tool tests. |
| CLI/tool change | package tests, build, and root tool gate if shared behavior changes. |
| Contract-first / TDD slice | expected red test, then green implementation, then final verification gate. |
| Release change | release-ready validation, package packing/install checks, publish workflow check. |
| Pages/public URL change | GitHub Pages config check and `curl -I -L` against final URLs. |

The verifier role may be the same Codex session for low-risk docs, but higher
risk code/release slices should use independent checks or separate verifier
steps before merging.

## Verifier Split

Use a stronger split as risk rises:

| Risk | Checker shape |
| --- | --- |
| Low-risk docs | Same agent may run `git diff --check` and link scans. |
| Cross-doc public messaging | Same agent can edit, but must verify rendered/live links and scan old terminology. |
| Code or CLI behavior | Maker implements; verifier runs tests/builds and checks compatibility. |
| Release/public package | Separate verification pass checks package metadata, tags, workflow status, and npm/public URLs. |
| Architecture boundary | Verifier checks that the change did not move policy into the wrong layer. |

The maker should not be the only judge for release, architecture, or public
surface changes.

## Human Gates

This pattern depends on frequent human gates. The human decides:

- naming and brand/domain language
- whether a roadmap node should continue explore/exploit
- whether scope should be expanded or closeout should begin
- whether temporary process docs should be deleted
- whether package identity, public URLs, or release paths are acceptable
- when to merge branches into `origin/main`

Always stop before:

- merge to shared branch
- publish or release
- delete an unmerged, shared, protected, or non-current-roadmap remote branch
- destructive cleanup
- roadmap scope expansion
- continuing after failed verification
- modifying denylisted or sensitive paths
- changing package identity, public URLs, or public API

Deleting the already-merged current roadmap branch is post-merge checklist work,
not a Human Gate. Any branch deletion outside that narrow case remains a Human
Gate.

Common gate phrases in this repo:

- `确认`
- `采用`
- `要`
- `提交到分支`
- `提交到 origin/main`
- `根据 roadmap 合并过程文件，并删除这些文件和 roadmap 文件`

Human Gate approvals must be recorded as roadmap decisions. Short confirmations
such as `确认`, `采用`, or `要` are valid only when the roadmap decision explains
what boundary was approved: scope, package identity, public surface, branch
merge, verification waiver, closeout, or retention policy.

High-risk Human Gate approvals must also record scope and validity:

- affected roadmap node(s) or PR(s)
- whether the approval is one-time or applies to the rest of the roadmap
- whether any verification gate is waived or downgraded
- expiry condition, such as scope expansion, public-surface change, failed
  verification, or release-boundary change

Low-risk approvals should still name the approved boundary, even when they do
not need a full expiry rule.

## Failure Modes & Mitigations

| Failure | Mitigation |
| --- | --- |
| Endless slicing without release value | Define a release-standard roadmap and choose closeout once the publishable surface is coherent. |
| Temporary roadmap/docs become permanent clutter | Closeout requires merging process notes into durable docs, then deleting roadmap/process files. |
| Closeout only deletes files | Run a durable-decision audit before deleting or migrating roadmap files. |
| Closeout hides inside feature work | Keep closeout as a separate commit with decision audit and process-file handling. |
| Agent stops after closeout commit | Treat closeout commit as the bridge to automatic PR handoff, not as the roadmap terminal state. |
| Merged branches linger without reason | Record branch cleanup plan before merge and delete or justify retention after merge. |
| Agent keeps asking instead of exploring | `zj-grill-me` rule: if codebase can answer, inspect the codebase. |
| Decisions disappear into chat history | Record decisions through roadmap CLI on the relevant node. |
| Short Human Gate confirmations become ambiguous | Record the approved boundary in the roadmap decision, not just the phrase. |
| Large slice mixes unrelated concerns | Keep each "刀" bounded and commit after coherent verification. |
| Commit becomes a mixed bag | Declare lightweight commit intent before executing a leaf node, then split or record a decision if work diverges. |
| Multi-commit slice hides separate outcomes | Default to one coherent commit; explain multi-commit exceptions or split the leaf. |
| Commit lacks process evidence | Update leaf status, notes, and verification evidence before committing the slice. |
| Status becomes subjective | Treat `completed` as gate-backed evidence, not as confidence or momentum. |
| Roadmap becomes a backlog | Require an expansion reason for new nodes and keep follow-ups out of the current PR unless approved. |
| Expanded roadmap silently overloads one PR | Reassess PR boundary after scope correction or discovered dependency expansion. |
| Public links look right locally but fail online | Verify live URLs after Pages or release configuration changes. |
| Pattern drifts beyond proof | Require real initiative evidence before broadening the public contract or starter behavior. |
| Roadmap becomes a substitute for judgment | Require human gates for naming, scope expansion, public surfaces, and closeout. |
| Verification is postponed until the end | Attach a minimum verification gate to every slice. |
| Expected red is mistaken for a Human Gate | Treat contract-first red tests as implementation evidence, not final verification failure. |
| Failed verification is ignored | Treat failed leaf-node gates as blocking until fixed, deferred with follow-up, or explicitly waived by a Human Gate. |
| Human Gate approval becomes a permanent pass | Record scope, validity, and expiry conditions for high-risk approvals. |
| Verification waiver loses the failure | Require a follow-up issue unless the roadmap and PR record an explicit `won't fix` / `won't do` reason. |
| Closeout deletes useful context | Move durable decisions before deleting process files. |

## Anti-Patterns

- Starting with a roadmap when one direct patch would do.
- Treating `确认` as approval for unspecified extra scope.
- Treating short Human Gate replies as durable decisions without recording the
  approved boundary.
- Reusing a Human Gate approval outside its recorded scope or after its validity
  conditions changed.
- Allowing work to continue after failed verification without a follow-up issue
  or explicit `won't fix` / `won't do` decision.
- Letting every slice expand the roadmap instead of finishing the current node.
- Adding roadmap nodes without classifying them as scope correction, discovered
  dependency, or follow-up.
- Pulling follow-up work into the current PR without a Human Gate.
- Expanding the roadmap without checking whether one PR is still reviewable.
- Keeping all decisions in chat and then asking future agents to infer them.
- Committing large mixed slices that cannot be reviewed independently.
- Starting a leaf node without a lightweight commit intent.
- Using multiple commits inside one leaf without explaining why they remain one
  coherent slice.
- Committing a slice before its roadmap status, notes, and verification evidence
  are updated.
- Marking a node `completed` without a passed verification gate or satisfied
  decision-only gate.
- Treating an expected-red contract test as a Human Gate instead of continuing
  to the green implementation inside the same leaf.
- Deleting roadmap/process files before durable docs have absorbed the useful
  decisions.
- Closing out without classifying each roadmap decision as durable doc, PR only,
  or discarded process note.
- Mixing closeout changes into the final feature slice commit.
- Treating `closeout commit complete` as `roadmap loop complete` instead of
  continuing to PR handoff.
- Treating branch cleanup as forgotten background work instead of a post-merge
  checklist item.
- Calling the pattern L3 because it is fast, rather than because verification,
  budget, branch hygiene, and closeout are proven.

## Cost Profile

This is a high-human-attention, medium-to-high token pattern. Cost is driven by
repo exploration, repeated verification, and context carried across many slices.

Suggested budget posture:

- Use it for high-leverage initiatives, not routine edits.
- Prefer one focused slice per run.
- Summarize and commit often to reduce context debt.
- Close out process files promptly so future agents can read stable docs instead
  of reconstructing the conversation.

## Success Metrics

- Each slice has a clear commit and verification note.
- Roadmap decisions are recoverable without reading the chat transcript.
- Durable docs improve at closeout; temporary roadmap/process files do not
  accumulate.
- Public surfaces remain consistent after rename/release/documentation work.
- The human can steer with short confirmations because the shared map carries
  the context.

## Closeout Decision Audit

Closeout date: 2026-07-02

The process roadmap that graduated this pattern recorded 35 decisions. All
durable decisions were absorbed into this pattern before deleting the process
roadmap files.

| Decision area | Classification | Durable location |
| --- | --- | --- |
| Roadmap / branch / PR mapping | durable doc | Operational Mapping, Closeout Contract, PR Contract |
| Issue and parent-node mapping | durable doc | Issue Tracker Guidance, Parent Node Completion Criteria |
| Leaf gates, commit intent, commit readiness, and status evidence | durable doc | Minimal Viable Checklist, Definition of Slice |
| Human Gate recording, scope, validity, and verification waiver handling | durable doc | Human Gates, Verification Strategy |
| Roadmap expansion and PR boundary reassessment | durable doc | Roadmap expansion rule, PR Contract |
| Durable-decision audit, roadmap retention, and closeout commit | durable doc | Closeout Contract |
| Branch cleanup after merge | durable doc | Branch cleanup policy |
| Candidate status and graduation condition | durable doc | Candidate Registry Shape |
| Runtime continuous execution, stop conditions, roadmap write safety, and focus depth | durable doc | Runtime Contract, Roadmap Write Safety |

No roadmap decision was retained only as `PR only`. No decision was discarded as
an unneeded process note.

## Registry Shape

Registry entry:

```yaml
- id: roadmap-sliced-development
  name: Roadmap-Sliced Development Pattern
  file: roadmap-sliced-development.md
  goal: Drive ambiguous architecture, product, documentation, and release initiatives through bounded roadmap-backed slices
  cadence: 1d
  risk: medium
  tools: [grok, claude-code, codex]
  skills: [zj-grill-me, zj-roadmap-driven, zj-grill-with-docs]
  state: zj-loop/roadmap-sliced-state.md
  phases: [explore, decide, slice, verify, commit, closeout, pr-handoff]
  human_gates: [naming, scope-expansion, release-boundary, branch-merge, process-doc-deletion]
  starter: starters/roadmap-sliced-development
  week_one_mode: L2
  token_cost: medium
```

This pattern is registered in `patterns/registry.yaml`. Keep the registry entry,
starter, README tables, and bundled tool registries in sync when changing its
public surface.
