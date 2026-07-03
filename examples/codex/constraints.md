# Constraints — Codex

Add rules your loop must never break. The `zj-loop-constraints` skill reads `zj-loop/zj-loop-constraints.md` at the start of every run.

## Quick start

Add to your Automation prompt:

```text
Before any triage or fix: run $zj-loop-constraints. Read zj-loop-constraints.md and enforce every rule.
```

## Adding constraints

Edit `zj-loop/zj-loop-constraints.md` directly:

```
zj-loop-constraints.md rules:
- Don't push before telling me
- Never edit auth/
- Always run tests first
- Max 3 fix attempts per item
```

## Scaffold automatically

```bash
npx @jununfly/zj-loop-init . --pattern daily-triage --tool codex
```
