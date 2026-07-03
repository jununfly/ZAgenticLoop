# Daily Triage — Codex App

## Automation Setup

In the Codex **Automations** tab:

| Field | Value |
|-------|--------|
| Project | Your repo checkout |
| Cadence | Daily (e.g. 08:00 local) |
| Environment | Local or background worktree |
| Prompt | See below |

## Prompt

```
Run $zj-loop-triage on this project. Read zj-loop/STATE.md if present.

Append to STATE.md:
- High-Priority Items → "## High Priority" section
- Watch Items → "## Watch List"
- Update "Last run" timestamp

Week 1: report only. Do not modify source files.

Flag anything ambiguous for the Triage inbox.
```

## Skills

Install `zj-loop-triage` per [Codex Agent Skills](https://developers.openai.com/codex/skills) — same `SKILL.md` format as `templates/SKILL.md.zj-loop-triage`.

## Phase 2 — Action

Add to prompt:

```
For high-priority single-file bugfixes only: draft fix in isolated worktree.
Spawn verifier subagent (stronger model) before proposing PR.
```

Define verifier in `.codex/agents/verifier.toml`.

## Triage Inbox

Runs with findings land in Codex Triage inbox — review there + `zj-loop/STATE.md`.

Empty runs archive automatically (built-in behavior).