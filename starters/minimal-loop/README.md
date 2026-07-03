# Minimal Loop Starter

Clone this into your project root to run a **report-only daily triage loop** (L1 readiness).

## Quick Start

1. Copy files into your repo:
   ```bash
   cp -r starters/minimal-loop/.grok/skills/zj-loop-triage .grok/skills/  # Grok
   mkdir -p zj-loop
   cp starters/minimal-loop/STATE.md.example zj-loop/STATE.md
   cp starters/minimal-loop/ZJ-LOOP.md zj-loop/ZJ-LOOP.md
   ```

2. Customize `zj-loop/STATE.md` project name.

3. Start the loop (Grok):
   ```bash
   /loop 1d Run the zj-loop-triage skill. Read zj-loop/STATE.md first. Append high-priority and watch items. Update Last run timestamp. Do not auto-fix anything in week one.
   ```

4. Read `zj-loop/STATE.md` each morning for 1–2 weeks. Tune the triage skill.

5. When triage quality is good, add `zj-minimal-fix` + `zj-loop-verifier` from `templates/` and enable small auto-wins.

## What's Included

| File | Purpose |
|------|---------|
| `zj-loop/STATE.md` | State spine template after init |
| `.grok/skills/zj-loop-triage/SKILL.md` | Triage skill |
| `zj-loop/ZJ-LOOP.md` | Loop config doc for your team |

## Other tools

- Claude Code: [minimal-loop-claude](../minimal-loop-claude/)
- Codex: [minimal-loop-codex](../minimal-loop-codex/)

## Next Steps

- [Loop Design Checklist](../../docs/loop-design-checklist.md)
- [Daily Triage pattern](../../patterns/daily-triage.md)
- Run `npx @jununfly/zj-loop-audit .` for readiness score
