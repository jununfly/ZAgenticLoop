# Issue Triage Loop

**Goal**: Continuously discover, summarize, prioritize, and record issue/discussion observations so the team (and other loops) always have a clean, actionable top-of-queue. Pure report / proposal mode in week one. Extremely low risk, high leverage.

## Scheduling

**Recommended**:
- `/loop 2h` or `1d` (morning + end of day for busy repos)
- GitHub Action on `issues` / `discussion` events + scheduled fallback
- Pairs beautifully with Daily Triage (this loop feeds the "what should I work on" report)

This is an excellent always-on, low-cost companion loop.

For the responsibility split between Issue Triage, Daily Triage,
`zj-loop-triage`, and `zj-triage`, see
[Triage Architecture](../docs/designs/triage-architecture.md).

## Required Skills

- `zj-issue-triage` — Scans open issues, discussions, and (optionally via MCP) Linear / Jira. Extracts signals (labels, comments, linked PRs, age, reactions), records possible-duplicate observations, priority, label-suggestion observations, and one-sentence summaries.
- `zj-loop-verifier` (light or human) — Sanity check on the proposed triage actions / new labels before anything is applied.

## State

Filename: `zj-loop/issue-triage-state.md`

Compact rolling view of the current backlog health:

```markdown
# Issue Triage State
Last run: 2026-06-09 09:15 UTC
Open actionable: 14 (was 17)
New since last run: 3
Human-attention candidates: 2 (one possible duplicate observation for #412, one unclear spec)

## Top 5 (by loop score)
- #487 (bug, p1, 2d old) — "Crash on export with large files" — label-suggestion observation: bug + needs-repro + area:export
- ...
```

The loop prunes closed/merged items and only keeps "needs attention" items.

## How the Loop Runs (Typical Cycle)

1. Discover new/updated issues + discussions since last run (or all open if first run).
2. For each: summarize intent, record possible-duplicate observations (title + embedding hints or simple text match), pull signals (age, author, linked PRs, reactions, existing labels).
3. Score / bucket: P0 (security, prod breakage), P1 (high impact + clear), P2, P3, missing-info observation, possible-duplicate observation, label-suggestion observation, or human-attention candidate.
4. Write or update a clean prioritized list + label-suggestion observations + short "why this matters" into the state file. Public issue comments are not part of L1 report-only behavior.
5. Verifier (or human) reviews only the human-attention candidates and any label-suggestion observations on sensitive areas.
6. Record run, prune resolved items, update counts.

## Recommended Triage Transitions

The route can produce a fixed recommendation request without mutating the issue
tracker:

```text
GitHub/GitLab Issues Backlog
-> Route Decision
-> recommended triage transitions
-> confirmed triage transition
-> zj-triage canonical state role + brief/comment
-> if ready-for-agent: Issue Fix Request
-> Fix Consumer may claim
```

Recommendation mode is enabled by default. It writes workflow/state evidence
only and includes a fixed confirmation command:

```text
/zj-loop confirm-triage-transition <request-id>
```

Only maintainers/collaborators may confirm. The command intentionally accepts
only the request id; it does not accept an inline issue number, label, or state
argument. Confirmed transitions use `zj-triage` semantics for canonical state
roles, brief/comment templates, unusual-transition guards, and maintainer
override rules.

| Side effects setting | What happens |
| --- | --- |
| Off by default | The loop records recommended transition evidence, request ids, reasons, confidence, brief drafts, and confirmation commands. It does not comment, label, close, reopen, or create Issue Fix Requests. |
| Enabled and confirmed | The confirmed request may set tracker state/labels, write the `zj-triage` brief/comment, and for `ready-for-agent` create an Issue Fix Request after the state and brief are written successfully. |

`wontfix` is a recommendation candidate only. Default confirmation blocks it for
human review; it must not auto-close, auto-label, or write out-of-scope records.

## Verification Strategy

- The loop **never auto-labels or closes** in L1.
- In L2 it can apply allowlisted labels only (e.g. `area:*`, `needs-repro`) after verifier passes.
- Human always owns P0/P1 assignment for the first weeks and for anything touching auth, payments, security, or public API.

## Human Handoff Points

- Any issue touching security, auth, billing, or infra
- Duplicate detection that is uncertain (>30% chance wrong)
- Issues older than N days that the loop wants to close as "stale" (human confirms)
- When > X new issues appear in a single run (context overload signal)

## Tool-Specific Notes

## Route Decision Boundary

When Issue Triage output is passed to the Route Table, use the
`issue-backlog-triage` route:

```text
GitHub/GitLab Issues Backlog -> Route Decision -> Recommended Triage Transition Evidence
```

Allowed report signal kinds are fixed:

- `missing-info-observation`
- `possible-duplicate-observation`
- `label-suggestion-observation`
- `human-attention-candidate`
- `issue-backlog-summary`

The evidence target is `zj-loop/issue-triage-state.md`. The route does not
write public issue comments, apply labels, close/reopen issues, assign people,
change milestones, perform formal lifecycle transitions, create Issue Fix
Requests, or batch-mutate the issue tracker in recommendation mode.

If a triage observation should become a bounded issue side effect, route it
through the separate `issue-triage-action` consumer. That route is dry-run by
default and only accepts fixed action requests for allowlisted labels or fixed
comment templates. Do not add these side effects to `issue-backlog-triage`.

**Grok Build TUI**:
```
/loop 2h Run zj-issue-triage skill. Read zj-loop/issue-triage-state.md first. Produce updated state + label-suggestion observations for new items only. No auto-label or close. Record human-attention candidates for ambiguous items.
```

**Claude Code**:
```
/loop 2h $zj-issue-triage — update zj-loop/issue-triage-state.md. Record label-suggestion observations only on allowlisted areas. Human review for P0/P1.
```

**Codex**:
Automation every 2h or on `issues` event: run zj-issue-triage → update `zj-loop/issue-triage-state.md`. Report mode.

**GitHub Actions**:
See `examples/github-actions/` for a starter workflow that can react to issue events + scheduled run.

## Failure Modes & Mitigations

| Failure                  | Mitigation |
|--------------------------|----------|
| Over-prioritizing noisy reporter | Weight by signals the team actually cares about (reactions, linked PRs, internal +1s). Human overrides recorded in state. |
| Possible-duplicate false positives | Conservative matching + always surface "possible duplicate observation for #NNN" for human confirmation in L1. |
| Alert fatigue on every new issue | Only notify human for the human-attention candidate slice. Everything else lives in the state file that Daily Triage or the engineer reads. |

## Success Metrics

- Reduction in time from issue open → first meaningful label or "needs info" comment.
- % of issues that have a clear priority within 24h.
- Engineer-reported "I always know what the top 5 things are" score (qualitative, from state file reviews).
- Number of duplicates caught before two people start working on them.

See also: [Daily Triage](./daily-triage.md) (this loop is a feeder), [Multi-Loop Coordination](../docs/multi-loop.md), and the [Loop Design Checklist](../docs/loop-design-checklist.md).
