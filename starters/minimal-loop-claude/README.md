# Minimal Loop Starter — Claude Code

Clone this into your project root to run a **report-only daily triage loop** (L1 readiness).

## Quick Start

1. Copy files into your repo:

   ```bash
   cp -r starters/minimal-loop-claude/.claude/skills/loop-triage .claude/skills/
   cp starters/minimal-loop-claude/.claude/agents/loop-verifier.md .claude/agents/
   mkdir -p zj-loop
   cp starters/minimal-loop-claude/STATE.md.example zj-loop/STATE.md
   cp starters/minimal-loop-claude/ZJ-LOOP.md zj-loop/ZJ-LOOP.md
   ```

2. Customize `zj-loop/STATE.md` project name.

3. Start the loop (Claude Code):

   ```bash
   /loop 1d Run $loop-triage. Read zj-loop/STATE.md first. Append high-priority and watch items. Update Last run timestamp. Do not auto-fix anything in week one.
   ```

4. Read `zj-loop/STATE.md` each morning for 1–2 weeks. Tune the triage skill.

5. When triage quality is good, add `minimal-fix` from `templates/SKILL.md.minimal-fix` and enable small auto-wins with the verifier agent (`isolation: worktree` on implementer tasks).

## What's Included

| File | Purpose |
|------|---------|
| `zj-loop/STATE.md` | State spine template after init |
| `.claude/skills/loop-triage/SKILL.md` | Triage skill |
| `.claude/agents/loop-verifier.md` | Checker sub-agent for L2+ |
| `zj-loop/ZJ-LOOP.md` | Loop config doc for your team |

## Next Steps

- [Loop Design Checklist](../../docs/loop-design-checklist.md)
- [Daily Triage pattern](../../patterns/daily-triage.md)
- [Claude Code example](../../examples/claude-code/daily-triage.md)
- Run `npx @jununfly/zj-loop-audit .` for readiness score
