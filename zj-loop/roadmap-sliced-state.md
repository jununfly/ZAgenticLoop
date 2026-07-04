# Roadmap-Sliced Initiative State

Roadmap id:
Branch: `zjal/plan-intake-trigger`
Issue / tracker: Local design roadmap from `docs/designs/tmp-plan-intake-trigger-roadmap.json`
PR:
Last updated: 2026-07-05

## Goal

Define and implement the plan-intake activation path that lets Daily Triage
discover PRD/plan issues and lets Roadmap-Sliced Development consume explicit,
auditable activation requests.

## Current Focus

- Parent node: 1. Plan Intake Trigger Design
- Leaf node: 1-1 through 1-5 completed as a tightly related contract slice
- Mode: exploit
- Commit intent: document triage/activation/roadmap ownership and add deterministic activation contract coverage

## Decisions

| Node | Decision | Durable location |
|------|----------|------------------|
| 1-1 | Labels and `zj-loop/STATE.md` are not activation state. Slash command comments create activation requests. | `patterns/daily-triage.md`, `patterns/roadmap-sliced-development.md` |
| 1-2 | Activation lifecycle is append-only, idempotent, duplicate-aware, and fail-closed on ambiguity. | `patterns/roadmap-sliced-development.md`, `scripts/zj-loop-activation-contract.mjs` |
| 1-3 | Add `zj-loop-activate`; keep Daily Triage as discovery/recommendation only. | `skills/zj-loop-activate/SKILL.md`, `skills/zj-loop-triage/SKILL.md`, `docs/designs/triage-architecture.md` |
| 1-4 | Activation-consumption failure requires a new request; post-consumption Roadmap-Sliced failure resumes without reactivation. | `patterns/roadmap-sliced-development.md` |
| 1-5 | Pure activation logic belongs in deterministic script coverage, not ad hoc prompt logic. | `scripts/zj-loop-activation-contract.mjs` |

## Verification Evidence

| Leaf | Gate | Result | Notes |
|------|------|--------|-------|
| 1-1 | Durable docs updated | Passed | Daily Triage and Roadmap-Sliced docs now define the slash-command activation boundary. |
| 1-2 | Deterministic contract tests | Passed | Covers duplicate, failed, consumed, and ambiguous lifecycle behavior. |
| 1-3 | Skill/template updated | Passed | Added `zj-loop-activate`; updated `zj-loop-triage` skill/template. |
| 1-4 | Durable docs updated | Passed | Roadmap-Sliced failure/resume contract documented. |
| 1-5 | `npm run test:activation-contract`; `git diff --check` | Passed | Script and node:test coverage implemented. |

## Human Gates

| Gate | Decision | Scope / expiry |
|------|----------|----------------|
| Activation storage | GitHub Issue comment, not `zj-loop/STATE.md` or labels | Applies to first implementation of plan intake activation. |
| Command shape | `/zj-loop start roadmap-sliced-development`, no parameters | Applies to v1 activation contract. |
| Permissions | Allow `admin`, `maintain`, `write`; reject `triage`, `read`, `none`, `unknown` | Applies to v1 activation contract. |

## Closeout Checklist

- [ ] All leaf nodes completed, deferred with follow-up, or explicitly won't do.
- [ ] Durable decisions moved into docs, ADRs, README, or pattern docs.
- [ ] Process roadmap files deleted or promoted into durable docs.
- [ ] Closeout commit created separately from the final feature slice.
- [ ] Branch clean.
- [ ] Branch pushed.
- [ ] PR opened or updated with verification notes and branch cleanup plan.
