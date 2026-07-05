# Post-Merge Cleanup Starter

Scaffold for the [Post-Merge Cleanup](../../patterns/post-merge-cleanup.md) loop (L1 report → L2 small fixes).

## Quick Start

```bash
# Grok
npx @jununfly/zj-loop-init . --pattern post-merge-cleanup --tool grok

# Or manual copy
cp -r starters/post-merge-cleanup/.grok/skills/zj-post-merge-scan .grok/skills/
cp starters/post-merge-cleanup/post-merge-state.md.example post-merge-state.md
mkdir -p zj-loop
cp starters/post-merge-cleanup/ZJ-LOOP.md zj-loop/ZJ-LOOP.md
```

Start (Grok):

```
/loop 1d Run zj-post-merge-scan on merges to main (last 7d). Update post-merge-state.md. Small doc/link fixes only in worktree. Escalate refactors.
```

## Files

| File | Purpose |
|------|---------|
| `post-merge-state.md.example` | Cleanup backlog from recent merges |
| `.grok/skills/zj-post-merge-scan/` | Scan skill |
| `zj-loop/ZJ-LOOP.md` | Cadence and gates |

## Safety

- No large refactors without human ticket
- Denylist: feature flags, auth paths — see [zj-loop/zj-loop-safety.md](../../zj-loop/zj-loop-safety.md)
