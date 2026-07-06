# Daily Triage Route CI Sweeper E2E Test Cases

These test cases verify the dogfood path:

```text
Signal -> Route Decision -> Issue Fix Request -> CI Sweeper -> repair PR / escalation issue
```

Daily Triage is the signal producer in this dogfood path. The Route Dispatcher
creates the replayable Route Decision and Issue Fix Request before CI Sweeper
acts as the allowlisted Fix Consumer.

Use this document when changing Daily Triage, Route Table policy, CI Sweeper,
deterministic repair commands, workflow permissions, or dogfood gates.

## Scope

The suite is layered:

- Local deterministic replay proves the route-to-outcome model without GitHub
  side effects.
- General Issue Fix Request replay proves the chain is not CI Sweeper-specific.
- GitHub Actions path verification proves Daily Triage can run with repository
  permissions and update loop state.
- CI Sweeper consumer verification proves the repair PR and escalation branches
  using controlled manual `workflow_dispatch` requests.

The full automatic `main` failure route should be tested only with explicit
human approval. By default, do not intentionally break `main`; use manual CI
Sweeper dispatch with realistic route request fields.

## Required Evidence

Every real GitHub run should record:

- workflow run URL
- source workflow
- source run id or synthetic test run id
- source URL
- head branch
- head SHA
- dedupe key
- request branch
- PR URL or issue URL when one is created
- cleanup actions for temporary branches, PRs, and issues

## TC1: Local Replay Contract

**Goal:** Prove the route-dispatch chain reaches every expected terminal
outcome without creating real GitHub PRs or issues.

**Agent steps:**

1. Confirm the worktree is clean, or record current unrelated changes.
2. Run `node scripts/ci-sweeper-e2e-replay.mjs`.
3. Run `node scripts/issue-fix-request-e2e-replay.mjs`.
4. Run `node --test scripts/ci-sweeper-e2e-replay.test.mjs scripts/issue-fix-request-e2e-replay.test.mjs`.
5. Confirm the replay covers `repair-pr`, `escalation-issue`,
   `duplicate-request`, and `route-denied`.

**Expected result:**

- Replay suite returns `passed: true`.
- Tests pass.
- If a replay fails, `/tmp/ci-sweeper-e2e-replay.json` points to the failing
  step: Daily Triage signal, Route Decision, CI Sweeper dispatch, or CI Sweeper
  outcome.

## TC2: Workflow Contract And Gates

**Goal:** Prove workflow policy, route contract, and repository gates still
agree before running real GitHub side effects.

**Agent steps:**

1. Inspect `.github/workflows/daily-triage.yml`,
   `.github/workflows/ci-sweeper.yml`, and
   `zj-loop/zj-loop-route-table.yaml`.
2. Run:

   ```bash
   node --test scripts/route-ci-failure.test.mjs scripts/ci-sweeper-workflow-contract.test.mjs scripts/ci-sweeper-e2e-replay.test.mjs scripts/issue-fix-request-contract.test.mjs scripts/issue-fix-request-dispatcher.test.mjs scripts/issue-fix-request-e2e-replay.test.mjs
   bash scripts/ci-audit-gates.sh
   bash scripts/ci-validate-gates.sh
   ```

**Expected result:**

- Route tests pass.
- Workflow contract tests pass.
- E2E replay tests pass.
- Audit gate passes.
- Validate gate passes. If local sandbox DNS blocks npm registry access, rerun
  the same gate with normal network access and record that the first failure was
  network-only.

## TC3: Daily Triage Manual Run

**Goal:** Prove Daily Triage can run in GitHub Actions with the permissions
needed to update loop state and, when applicable, dispatch CI Sweeper.

**Human step:**

1. Approve a manual Daily Triage workflow run.

**Agent steps:**

1. Trigger or observe `.github/workflows/daily-triage.yml` on `main`.
2. Confirm the runner has the expected permissions: Actions, Contents, Issues,
   PullRequests, and Statuses write.
3. Confirm Daily Triage writes `zj-loop/STATE.md` and appends
   `zj-loop/zj-loop-run-log.md`.
4. Confirm validate/audit gates run before any automated PR is merged.
5. Confirm CI Sweeper dispatch is either performed for an eligible failure or
   explicitly skipped/denied when no eligible failure exists.
6. If Daily Triage opens a state PR, inspect that it records readiness, state
   changes, run-log changes, and inline validate/audit statuses.

**Expected result:**

- Daily Triage workflow succeeds.
- No CI Sweeper dispatch occurs when validate/audit are green.
- If a state PR is created, it is gate-backed and can be merged or skipped by
  policy.

## TC4: CI Sweeper Repair PR Path

**Goal:** Prove CI Sweeper creates a repair PR only when deterministic repair
produces a real non-state diff and repair, validate, and audit gates all pass.

**Human step:**

1. Approve a controlled temporary repair scenario.

**Agent steps:**

1. Create a temporary branch that includes a controlled, CI Sweeper-repairable
   drift. Generated bundle drift is preferred.
2. Dispatch `.github/workflows/ci-sweeper.yml` manually with realistic route
   request fields:
   - `source_workflow`
   - `source_run_id`
   - `source_url`
   - `head_branch`
   - `head_sha`
   - `dedupe_key`
   - `request_branch`
3. Watch the CI Sweeper run.
4. Inspect the generated repair PR.
5. Close the temporary PR after recording evidence.
6. Delete temporary branches.

**Expected result:**

- `Run deterministic repair plan` succeeds.
- `Run validate gates after repair` succeeds.
- `Run audit gates after repair` succeeds.
- `Detect repair diff` reports a non-state diff.
- `Create or update deterministic repair PR` runs.
- `Escalate CI Sweeper repair failure` is skipped.
- The repair PR body records the route, dedupe key, repair outcome, validate
  outcome, audit outcome, and human-review requirement.

## TC5: CI Sweeper No-Diff Escalation Path

**Goal:** Prove CI Sweeper escalates instead of creating a misleading green PR
when deterministic repair succeeds but produces no non-state diff.

**Human step:**

1. Approve a controlled no-diff scenario.

**Agent steps:**

1. Dispatch `.github/workflows/ci-sweeper.yml` against a branch/ref where
   deterministic repair is expected to succeed but produce no non-state diff.
2. Watch the CI Sweeper run.
3. Confirm no repair PR is created for the request branch.
4. Inspect the generated escalation issue.
5. Close the temporary issue after recording evidence.
6. Delete temporary branches if any were created.

**Expected result:**

- `Run deterministic repair plan` succeeds.
- `Run validate gates after repair` succeeds.
- `Run audit gates after repair` succeeds.
- `Detect repair diff` reports `false`.
- `Create or update deterministic repair PR` is skipped.
- `Escalate CI Sweeper repair failure` runs.
- The escalation issue records `Non-state repair diff: false`, repair outcome,
  validate outcome, audit outcome, source workflow, source run, and dedupe key.

## TC6: CI Sweeper Repair Failure Escalation Path

**Goal:** Prove CI Sweeper escalates with diagnostic evidence when deterministic
repair itself fails.

**Agent steps:**

1. Use a controlled branch/ref or fixture that makes deterministic repair fail
   before the repair PR condition can be satisfied.
2. Dispatch `.github/workflows/ci-sweeper.yml` manually with realistic route
   request fields.
3. Watch the CI Sweeper run.
4. Inspect the escalation issue.
5. Close temporary issues and delete temporary branches after recording
   evidence.

**Expected result:**

- Repair PR creation is skipped.
- Escalation issue is created or updated.
- The issue body includes repair outcome, validate outcome, audit outcome,
  dedupe key, source run, and a usable next step.

## Required CI Sweeper Repair Contract

The deterministic repair plan must install root dependencies before running
root-level scripts. Root scripts such as
`scripts/check-zj-loop-init-sync.mjs` depend on root devDependencies like
`yaml`.

The expected order is:

1. for each release-managed package: `npm ci`
2. for each release-managed package with a build script: `npm run build`
3. root `npm ci --ignore-scripts`
4. root `node scripts/check-zj-loop-init-sync.mjs`
5. root `node scripts/validate-release-workflows.mjs`

The contract is covered by
`scripts/ci-sweeper-deterministic-repair.test.mjs`.

## Cleanup Requirements

After every real GitHub-side test:

- close temporary PRs with a comment linking the workflow run
- close temporary issues with a comment linking the workflow run
- delete temporary remote branches
- delete matching local temporary branches
- keep durable evidence in a testing document, runbook, or issue comment

## Known Limitations

- Full Daily Triage automatic dispatch to CI Sweeper requires an eligible
  validate/audit failure on `main`; do not create that failure without explicit
  human approval.
- Some generated bundle drift shapes may be repaired during package tests before
  a dirty-worktree check can fail. Prefer explicit CI Sweeper dispatch for
  low-risk consumer-path validation.
- GitHub Actions may display a step-level annotation for a failed
  `continue-on-error` step even when the job successfully escalates.
