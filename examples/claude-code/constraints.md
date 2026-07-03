# Constraints — Claude Code

Add rules your loop must never break. The `zj-loop-constraints` skill reads `zj-loop/zj-loop-constraints.md` at the start of every run.

## Quick start

```bash
# Add a constraint (appends to zj-loop-constraints.md)
/constraints Don't push before telling me. Never edit auth/. Always run tests first.
```

## Before every loop run

```bash
# The zj-loop-constraints skill runs first — it reads zj-loop-constraints.md and bakes
# every rule into the agent's context BEFORE triage or any action skill runs.
/loop 1d Run $zj-loop-constraints, then $loop-triage. Update zj-loop/STATE.md. No auto-fix in week one.
```

## How it works

1. `/constraints <rule>` appends your rule to `zj-loop/zj-loop-constraints.md`
2. The `zj-loop-constraints` skill (from `templates/SKILL.md.zj-loop-constraints`) must be installed in `.claude/skills/zj-loop-constraints/SKILL.md`
3. Every loop run starts with `$zj-loop-constraints` — it reads the file, loads rules, enforces them

## Scaffold automatically

```bash
npx @jununfly/zj-loop-init . --pattern daily-triage --tool claude
```
