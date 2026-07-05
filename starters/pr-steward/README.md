# PR Steward Starter

Scaffold for the [PR Steward](../../patterns/pr-steward.md) loop (L2 — assisted fixes with verifier).

## Quick Start

1. Copy into your repo:
   ```bash
   npx @jununfly/zj-loop-init . --pattern pr-steward --tool grok
   # Or manual:
   cp -r starters/pr-steward/.grok/skills/* .grok/skills/
   cp starters/pr-steward/pr-steward-state.md.example pr-steward-state.md
   mkdir -p zj-loop
   cp starters/pr-steward/ZJ-LOOP.md zj-loop/ZJ-LOOP.md
   ```

2. Customize skills with your review norms and required checks.

3. Start (Grok):
   ```bash
   /loop 5m Check open PRs. Update pr-steward-state.md. For CI failures or actionable review comments on allowlisted PRs: worktree + zj-minimal-fix + zj-loop-verifier. Never merge — propose only. Escalate after 3 attempts per PR.
   ```

4. Sign PR comments: `🤖 ZAgenticLoop — PR Steward`

## Files

| File | Purpose |
|------|---------|
| `pr-steward-state.md.example` | Watcher state |
| `.grok/skills/zj-pr-review-triage/` | PR triage skill |
| `zj-loop/ZJ-LOOP.md` | Team loop config |

## Safety

- No auto-merge by default
- Denylist: auth, payments, secrets — see [zj-loop/zj-loop-safety.md](../../zj-loop/zj-loop-safety.md)
