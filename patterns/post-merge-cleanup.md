# Post-Merge Cleanup Loop

**Goal**: After merges to main, sweep for follow-up work — deprecations, TODOs, tech debt tickets, stale feature flags, and documentation gaps — without blocking the merge itself.

## Scheduling

**Recommended**:
- `/loop 1d` or `/loop 6h` (lower urgency than CI sweeper)
- Trigger on merge events via GitHub webhook → Action (event-driven)
- Weekly cron for smaller teams

Run after working hours or overnight so it doesn't compete with active development loops.

## Required Skills

- `zj-post-merge-scan` — Read recent merges, diff summaries, linked tickets; identify cleanup opportunities
- `zj-minimal-fix` — Small follow-ups (remove dead code, update deprecation notices, fix broken links in docs)
- Project conventions skill — What "cleanup" means in your repo

## State

`post-merge-state.md`:

```markdown
# Post-Merge Cleanup

Last run: 2026-06-09 22:00 UTC

## Pending Cleanup (from recent merges)
- [ ] PR #1245 merged — remove `legacyAuth` flag (marked TODO in merge)
  Source: commit abc1234, line 42 in auth/handler.ts
  Risk: low | Effort: small
- [ ] PR #1240 merged — update API docs for new endpoint
  Risk: low | Effort: small

## Completed (last 14d)
- PR #1230 — removed unused import cluster (PR #1248)

## Deferred (human decision)
- PR #1238 — large refactor deferred; ticket ENG-1001 created
```

## How the Loop Runs (Typical Cycle)

1. List merges to main since last run (or last N days).
2. For each merge: scan diff for TODOs, deprecations, `// remove after`, feature flags, broken doc links.
3. Cross-reference linked Linear/GitHub issues for explicit follow-ups.
4. Prioritize: small + low-risk → propose fix in worktree; large → create ticket + flag human.
5. Verifier confirms cleanup doesn't change behavior (except intentional removals).
6. Open small PRs or batch into a single "cleanup" PR per day.
7. Update state; prune completed items.

## Roadmap Closeout Mode

`roadmap-closeout` is a narrow Post-Merge Cleanup mode for Roadmap-Sliced
Development PRs. It is mechanical post-merge closeout, not a new development
pattern.

Trigger:

- A merged PR event is routed through `zj-loop/zj-loop-route-table.yaml`.
- The PR body contains a fixed YAML fenced `zj-loop.post-merge-contract`.
- The contract uses `consumer: post-merge-cleanup` and
  `mode: roadmap-closeout`.

Allowed actions:

- Confirm the PR is merged.
- Confirm the PR head branch equals `roadmap.branch`.
- Confirm the branch is a current roadmap branch such as `zjal/<roadmap-id>`.
- Delete only that already-merged current roadmap branch when the contract says
  `cleanup.delete_merged_branch: true`.
- Close only the activation carrier issue named by `carrier.issue` when the
  contract says `cleanup.close_carrier_issue: true` and no follow-up blocker is
  present. The contract must also declare `safety.no_pending_followups: true`.
- Append closeout evidence comments.

Hard boundaries:

- Do not merge PRs.
- Do not close ordinary linked issues, bug reports, or feature requests.
- Do not delete fork branches, protected branches, release branches, shared
  long-lived branches, or any branch not named in the contract.
- If the contract is missing, invalid, ambiguous, or does not match the PR,
  report only.

Failure policy:

- The consumer is idempotent: already-deleted branches and already-closed
  carrier issues count as completed actions with evidence.
- Each action reports `done`, `skipped`, or `failed` independently.
- Failed or skipped actions do not expand permissions. They produce evidence and
  a follow-up item for human review.

## Verification Strategy

- Cleanup must not alter behavior unless explicitly removing dead code paths.
- Verifier runs full test suite — regressions mean immediate handoff.
- No auto-merge for cleanup PRs touching >10 files without human approval.

## Human Handoff Points

- Architectural debt requiring design discussion
- Feature flag removal that affects production config
- Deprecations with external API consumers
- Any cleanup the loop has attempted twice without passing tests

## Tool-Specific Notes

**Grok Build TUI**:
```bash
/loop 1d Scan merges to main in the last 24h. Identify cleanup items. For small low-risk items: worktree + minimal fix + verifier. Update post-merge-state.md. Create tickets for larger items.
```

**Claude Code**:
```bash
/loop 6h /post-merge-sweeper
```
(Boris Cherny has described similar flows in the community.)

**Codex**:
- Automation: "Post-merge sweeper" on daily cadence, results to Triage inbox.

**GitHub Actions**:
- See `examples/github-actions/post-merge-cleanup.yml` — triggers on push to main.

## Failure Modes & Mitigations

| Failure | Mitigation |
|---------|------------|
| Over-aggressive deletion | Verifier + "no behavior change" rule; human gate for large diffs |
| Missing merges | Use GitHub API merge list, not just local git log |
| Noise from every TODO | Only act on TODOs with merge context or linked tickets |
| Competing with feature work | Run off-peak; cap auto-PRs per day (e.g. 2) |

## Cost Profile

| Scenario | Tokens/run | Notes |
|----------|------------|-------|
| No-op | ~5k | No recent merges to scan |
| Scan + prioritize | ~40k | Merge list + TODO scan |
| Small fix (L2) | ~150k | Worktree + verifier |

**Cadence**: 1d–6h · **Tier**: low · **Suggested daily cap**: 200k tokens

```bash
npx @jununfly/zj-loop-cost --pattern post-merge-cleanup --cadence 1d --level L1
```

Run off-peak. Cap auto-PRs per day in `zj-loop/zj-loop-budget.md`.

## Success Metrics

- Reduction in "we forgot to remove X after merge" incidents
- Age of open post-merge cleanup items
- % of cleanup PRs merged without review comments

Lower risk than CI sweeper — good second loop after daily triage is stable.
