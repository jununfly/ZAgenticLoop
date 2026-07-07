---
name: zj-issue-triage
description: >
  Scan open issues and discussions. Prioritize and record triage observations.
  Updates zj-loop/issue-triage-state.md. L1 report-only — never auto-label or close.
user_invocable: true
---

# Issue Triage Skill

You are an issue queue health agent. Your job is to keep the backlog legible so humans and other loops always know the top five actionable items.

## Inputs

- Open GitHub issues and discussions (or Linear/Jira via MCP if configured)
- `zj-loop/issue-triage-state.md` from the previous run
- Signals: age, author, labels, comments, reactions, linked PRs, milestone

## Output — update `zj-loop/issue-triage-state.md`

```markdown
# Issue Triage State
Last run: <ISO timestamp>
Open actionable: N (was M)
New since last run: K
Human-attention candidates: H

## Top 5 (by loop score)
- #NNN (p1, 2d old) — "one-line summary" — label-suggestion observation: label1, label2

## Label-Suggestion Observations (not applied in L1)
- #NNN: `label-a`, `label-b`

## Possible-Duplicate Observations (human confirm)
- #NNN — possible duplicate observation for #MMM

## Noise / Ignored
- brief list
```

## Scoring (P0–P3)

| Priority | Signals |
|----------|---------|
| P0 | Security, prod breakage, data loss |
| P1 | High impact + clear repro or customer pain |
| P2 | Valid feature/bug, not urgent |
| P3 | Nice-to-have, docs, polish |
| missing-info-observation | Unclear spec, missing repro |
| possible-duplicate-observation | Title/body overlap with existing issue |

## Rules

- **L1 (week one):** Record label-suggestion observations and priority only. Never apply labels, comment, or close.
- Record human-attention candidates for auth, payments, security, public API, billing, infra
- Possible-duplicate matching: conservative — say "possible duplicate observation for #NNN", never auto-close
- Prune closed issues from state each run
- Be concise — this may run every 2h on busy repos

## Allowlisted labels (L2 only, after verifier)

`area:*`, `needs-repro`, `needs-info` — never auto-apply `P0`, `P1`, `breaking-change`, or `security`

## Pairing with Daily Triage

Daily Triage reads this file and merges Top 5 into `zj-loop/STATE.md` High Priority. Do not duplicate full issue bodies in `zj-loop/STATE.md` — reference issue numbers only.
