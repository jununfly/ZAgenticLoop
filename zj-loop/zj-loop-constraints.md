# Loop Constraints

These constraints are binding for loops operating on this repository. Load them before triage, fixes, verification, issue updates, PR work, or release work.

## Operating Mode

- Daily triage is report-only for product and code work: it may update
  `zj-loop/STATE.md` and `zj-loop/zj-loop-run-log.md`, then hand findings to a
  human or an allowlisted dispatcher.
- Assisted fixes may prepare changes in a branch or isolated worktree, but humans merge.
- Never auto-merge to `main`.
- Never mark a draft PR ready, merge a PR, close an issue, or publish a release without human approval.
- Narrow exception: Daily Triage may squash-merge only its own generated
  operational state PR when all of these are true:
  - the PR changes only `zj-loop/STATE.md` and/or
    `zj-loop/zj-loop-run-log.md`
  - `scripts/ci-validate-gates.sh` and `scripts/ci-audit-gates.sh` pass in the
    Daily Triage workflow before the PR is opened or merged
  - the workflow posts the required inline commit statuses for the generated
    branch
  - the branch name is the deterministic `automated/daily-triage-*` generated
    state branch
  - the merge deletes the generated branch
  This exception must not be reused for code, docs, pattern, workflow, release,
  or dependency PRs.
- Narrow exception: Post-Merge Cleanup `roadmap-closeout` may close only the
  Roadmap activation carrier issue named in a valid merged-PR
  `zj-loop.post-merge-contract`. It must not close ordinary linked issues.
  Its executor may delete only the merged `zjal/` roadmap branch named in that
  same contract after all executor guards pass.
- Use one isolated worktree per unattended code-change experiment.

## Push & Merge

- Tell the human before pushing.
- Open draft PRs for assisted changes unless the human explicitly asks for a different flow.
- Keep PRs narrow: one fix, pattern update, or documentation decision per PR.
- If a change crosses more than one pattern, starter, or tool package, escalate before continuing.

## Hard Denylist

Never edit these paths or risk areas without explicit human approval:

- `.env`
- `.env.*`
- `**/secrets/**`
- `**/credentials/**`
- `**/*_key*`
- `**/*_secret*`
- `.terraform/**`
- `k8s/production/**`
- `**/migrations/**`
- `auth/**`
- `payments/**`
- `billing/**`

## Human Review Required

These areas may be edited only in a PR or equivalent human review flow:

- `docs/primitives*.md`
- `docs/assets/**`
- `tools/zj-loop-audit/src/**`
- `patterns/**`
- `patterns/registry.yaml`
- `patterns/registry.schema.json`
- `starters/**`
- `templates/**`
- `stories/**`
- `.github/workflows/**`
- `.github/ruleset-main-protection.json`
- `ZJ-CONTEXT.md`
- `docs/zj-adr/**`

## Pattern & Registry Rules

- New patterns require an entry in `patterns/registry.yaml`.
- Pattern intent must stay tool-agnostic.
- Put tool-specific instructions under `examples/` or per-tool starters.
- When editing `patterns/registry.yaml`, run registry validation before proposing the change.

## Story Rules

- Failure stories in `stories/` must include token cost, root cause, and remediation.
- Do not record only wins; include what failed and how the loop changed afterward.

## Generated & Local Artifacts

- Do not hand-edit `tools/**/dist/**`; regenerate from source.
- Do not commit `.zcodegraph/**` unless a human explicitly asks for it.
- Do not edit package lockfiles unless the task is dependency-related or an install/build step legitimately updates them.

## Verification

- Always run `git diff --check` before proposing a change.
- If `tools/zj-loop-audit/` changed, run:
  - `cd tools/zj-loop-audit && npm run build`
  - `node dist/cli.js ../..`
- For repo readiness changes, run:
  - `bash scripts/before-after-demo.sh`
- If patterns, starters, registry, templates, or sync behavior changed, run the narrowest relevant gate:
  - `npm run validate:registry`
  - `npm run check:zj-loop-init`
  - `bash scripts/ci-validate-gates.sh`
  - `bash scripts/ci-audit-gates.sh`
- If a relevant gate is not run, say exactly which one was skipped and why.

## Communication

- Say what you are about to do before editing files or taking external actions.
- Report verification commands and outcomes.
- Escalate ambiguity instead of guessing on design decisions, broad refactors, releases, or review policy.

## Budget & Pause

- If token spend reaches 80% of the daily cap in `zj-loop/zj-loop-budget.md`, switch to report-only.
- If `loop-pause-all` is active in `zj-loop/STATE.md`, an issue label, or a PR label, stop immediately.
- Make at most 3 fix attempts on the same item before escalating with context.
