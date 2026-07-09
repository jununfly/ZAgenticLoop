# Daily Triage Loop

**Goal**: Start each day (or active period) with a prioritized, actionable picture of what needs attention — without manually checking CI, issues, PRs, and chat.

## Scheduling

**Recommended**:
- `/loop 1d` for morning triage (Grok, Claude Code)
- `/loop 2h` during active sprints for faster signal
- GitHub Action cron `0 8 * * 1-5` for teams without a TUI

Many teams run triage-only first (reporting, no auto-fix) for 1–2 weeks before enabling action.

For the responsibility split between Daily Triage, Issue Triage,
`zj-loop-triage`, and `zj-triage`, see
[Triage Architecture](../docs/designs/triage-architecture.md).

## Required Skills

- `zj-loop-triage` — Reads CI, issues, commits, chat; produces prioritized findings (see `templates/SKILL.md.zj-loop-triage`)
- `zj-minimal-fix` (optional, phase 2) — Drafts small fixes for obvious failures
- Reviewer sub-agent or skill (optional, phase 2) — Verifies proposed fixes

## State

Use `zj-loop/STATE.md` (or a Linear board view) as the memory spine:

```markdown
# Loop State — Project X

Last run: 2026-06-09 08:15 UTC

## High Priority (loop is acting or waiting on human)
- [ ] #1241 — flaky test in auth flow (CI red on main)
  Loop action: Opened worktree. Fix proposed. Waiting for human PR review.

## Watch List
- PR #1238 open 4 days with no activity.

## Recent Noise (ignored this run)
- Dependabot PRs (separate automation)
```

Fields the loop must update every run:
- `Last run` timestamp
- Item status + last action taken
- Human decisions that overrode the loop

## How the Loop Runs (Typical Cycle)

1. Scheduler fires (morning or interval).
2. Triage skill ingests: CI failures (24h), open issues/tickets, recent commits, prior `zj-loop/STATE.md`.
3. High-priority items appended to state with suggested next action.
4. (Phase 2) For small, self-contained failures: open worktree → implementer → verifier.
5. (Phase 3) Connectors update PRs/tickets; ambiguous items flagged for human.
6. Prune resolved/merged items from state.
7. Record post-run critique in state: false positives, repeated items, re-prioritized or dropped items, and one adjustment for next run.

## Plan Intake Candidates

Daily Triage may discover GitHub issues that are really PRDs, plans, or
multi-slice initiative requests. It should classify those as plan intake
candidates, but it must not start Roadmap-Sliced Development by changing labels,
writing `zj-loop/STATE.md`, creating branches, or creating roadmap files.

The activation path is an explicit maintainer/collaborator issue comment:

```text
/zj-loop start roadmap-sliced-development
```

Current first-version constraints:

- The command is parameterless; roadmap id and branch naming belong to
  Roadmap-Sliced Development when it consumes the request.
- Only `roadmap-sliced-development` is allowlisted.
- Daily Triage recommends the command only when a candidate is first discovered
  or its activation lifecycle status changes.
- If a pending, consumed, failed, duplicate, denied, or ambiguous activation
  comment already exists, report that status instead of repeating the same
  recommendation.
- Labels remain routing metadata. `zj-loop/STATE.md` remains triage memory, not
  an activation queue.

## PRD Next-Command Handoff

When Daily Triage finds a ready PRD/plan issue and can name the exact next
implementation command, the PRD issue is the human and agent handoff object. Do
not leave the command only in local state.

Use the deterministic PRD handoff planner:

```bash
npx --yes --package @jununfly/zj-loop-core zj-loop-prd-handoff handoff-plan \
  --prd-issue-url https://github.com/OWNER/REPO/issues/123 \
  --next-command 'Ask Codex: "Run the roadmap-sliced-development loop for issue #123..."'
```

Default `report-only` mode does not write to GitHub. It prints:

- the stable handoff comment body
- the idempotency marker `<!-- zj-loop:prd-next-command-handoff -->`
- the exact manual `gh issue comment ...` command for a maintainer to run
- the locations where the handoff currently lives

Only use `--mode comment-enabled` when issue-comment write authority has been
explicitly enabled by route/workflow policy. Even then, the core planner only
plans the comment; the workflow or caller owns GitHub writes and must use the
marker to skip or update an existing handoff instead of spamming duplicates.

## Post-Run Critique

After each Daily Triage run, record:

- High-noise items.
- False positives (items incorrectly flagged).
- Items that should be deprioritized.
- Any human-review friction.
- One change to improve the next cycle.

## Verification Strategy

- Phase 1 (report-only): Human reads `zj-loop/STATE.md` — no auto-action verification needed.
- Phase 2+: Never let implementer mark work done; verifier confirms fix scope and tests.
- Triage skill must not invent architectural work — signal only.

## Human Handoff Points

- Design decisions or multi-file refactors
- Security, auth, payments, infrastructure
- Items flagged "needs discussion" in triage output
- Anything the loop has surfaced 3+ days without resolution

## Tool-Specific Notes

**Grok Build TUI**:
```bash
/loop 1d Run the zj-loop-triage skill. Append high-priority items to STATE.md. For obvious small bugfixes only: worktree + zj-minimal-fix + verifier sub-agent (maker/checker). Flag ambiguous items for human review.
```

**Claude Code**:
```bash
/loop 1d Run $zj-loop-triage and update STATE.md. Do not auto-fix on first week — report only.
```

**Codex**:
- Automations tab: daily prompt calling `$zj-loop-triage`, output to Triage inbox + `zj-loop/STATE.md`.

**GitHub Actions**:
- See `examples/github-actions/daily-triage.yml`.

## Failure Modes & Mitigations

| Failure | Mitigation |
|---------|------------|
| Triage creates noise | Tighten skill rules; add "Noise / Ignore" section |
| State file grows unbounded | Prune merged/closed items every run |
| Auto-fix on wrong priority | Start report-only; add explicit effort/risk gates |
| Missed overnight failures | Add `fireImmediately: true` or run at start of day + mid-day |
| Stale critique / never reviewed | Add human handoff when critique entries accumulate without resolution across N runs. |

## Cost Profile

| Scenario | Tokens/run | Notes |
|----------|------------|-------|
| No-op | ~5k | Nothing actionable in state |
| Full triage (L1) | ~50k | CI + issues + commits scan |
| Assisted fix (L2) | ~200k | Worktree + implementer + verifier |

**Cadence**: 1d–2h · **Tier**: low · **Suggested daily cap**: 100k tokens

```bash
npx @jununfly/zj-loop-cost --pattern daily-triage --cadence 1d --level L1
```

Scaffold `zj-loop/zj-loop-budget.md` and `zj-loop/zj-loop-run-log.md` with `zj-loop-init`. See [operating-loops.md](../docs/operating-loops.md).

## Success Metrics

- Time from "something broke" to "human knows about it"
- % of mornings where `zj-loop/STATE.md` matched what you'd have found manually
- Reduction in ad-hoc "what's on fire?" Slack messages

Start report-only. Add action only when triage quality is consistently good.
