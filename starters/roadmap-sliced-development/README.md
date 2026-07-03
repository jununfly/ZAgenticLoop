# Roadmap-Sliced Development Starter

Starter for the [Roadmap-Sliced Development Pattern](../../patterns/roadmap-sliced-development.md): a human-led loop for ambiguous product, architecture, documentation, or release initiatives.

## Quick Start

```bash
# Grok
npx @jununfly/zj-loop-init . --pattern roadmap-sliced-development --tool grok

# Claude Code
npx @jununfly/zj-loop-init . --pattern roadmap-sliced-development --tool claude

# Codex
npx @jununfly/zj-loop-init . --pattern roadmap-sliced-development --tool codex
```

Start with one bounded roadmap branch:

```text
Run zj-grill-me + zj-roadmap-driven for one roadmap slice. Keep decisions in the roadmap, update slice evidence before commit, and stop only at Human Gates or external blockers.
```

## Files

| File | Purpose |
|------|---------|
| `zj-loop/roadmap-sliced-state.md` | Human-readable initiative state and closeout checklist after init |
| `zj-loop/ZJ-LOOP.md` | Cadence, gates, branch policy, and PR handoff contract after init |

## Safety

- Use a dedicated branch for non-trivial roadmap work.
- Every leaf needs a verification or decision-only gate.
- Update roadmap status, notes, and evidence before committing.
- Closeout commit is not terminal; continue to PR handoff unless a Human Gate pauses or push/PR is blocked.
