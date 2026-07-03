# Constraints — Opencode

Binding rules the loop must never break. The `zj-loop-constraints` skill reads `zj-loop/zj-loop-constraints.md` at the start of every run.

## Quick start

```bash
# Append a rule (the loop runs once to read + persist, then every subsequent run enforces)
opencode run \
  "Append this rule to zj-loop-constraints.md verbatim: 'Don't push before telling me. Always run tests first.'"
```

Or just edit `zj-loop/zj-loop-constraints.md` directly. Comments are allowed; the loop reads every line below the header as a binding rule.

## Before every loop run

Make every scheduled run invoke constraints **before** triage. The skill itself reads `zj-loop/zj-loop-constraints.md` and bakes the rules into the agent's context before any action runs:

```bash
opencode run "Run skills/zj-loop-constraints/SKILL.md. Then run skills/loop-triage/SKILL.md. Update zj-loop/STATE.md. No auto-fix in week one."
```

## How it works

1. `zj-loop/zj-loop-constraints.md` lives at the repo root.
2. `zj-loop-constraints` skill lives at `skills/zj-loop-constraints/SKILL.md` (copy from `templates/SKILL.md.zj-loop-constraints`).
3. Every loop run starts with the constraints skill — it reads the file, loads rules, outputs them at the top of the prompt.
4. Triage then runs **inside the same context** with the rules baked in.

## Scaffold automatically

```bash
npx @jununfly/zj-loop-init . --pattern daily-triage --tool opencode
```

`zj-loop-init` copies `zj-loop/zj-loop-constraints.md` and `skills/zj-loop-constraints/SKILL.md` into the repo layout opencode expects.

Manual copy still works:

```bash
mkdir -p skills/zj-loop-constraints
cp templates/SKILL.md.zj-loop-constraints skills/zj-loop-constraints/SKILL.md
mkdir -p zj-loop
cp templates/zj-loop-constraints.md zj-loop/zj-loop-constraints.md
```

## Safety

Constraints are *binding*. If a rule can be misinterpreted, rewrite it — the loop will not second-guess, the human will.

## References

- [templates/zj-loop-constraints.md](../../templates/zj-loop-constraints.md) — default constraint set
- [templates/SKILL.md.zj-loop-constraints](../../templates/SKILL.md.zj-loop-constraints) — constraints skill template
- [docs/safety.md](../../docs/safety.md)
