# AGENTS.md — zagenticloop reference

Conventions for humans and loops maintaining this repository.

## Build & verify

```bash
# Loop readiness audit CLI
cd tools/zj-loop-audit && npm ci && npm run build
node dist/cli.js ../..              # audit repo root
node dist/cli.js ../.. --suggest    # show copy commands for gaps

# Before/after demo (scores an empty dir → starter → L2)
bash scripts/before-after-demo.sh
```

CI runs `validate-patterns` and `audit` on every push/PR (see `.github/workflows/`).

## Review norms

- Patterns and starters must stay **tool-agnostic in intent**; tool-specific paths live under `examples/` and per-tool starters.
- Never auto-merge changes to `docs/primitives*.md`, `tools/zj-loop-audit/src/`, or showcase assets without human review.
- Failure stories in `stories/` should include token cost, root cause, and remediation — not just wins.
- New patterns require an entry in `patterns/registry.yaml`.

## Loop operation (this repo)

- **Daily triage**: `zj-loop-triage` skill → `zj-loop/STATE.md` (report-only, L1).
- **Fixes**: only via PR with human review; `zj-minimal-fix` + `zj-loop-verifier` for assisted changes (L2).
- **Isolation**: use git worktrees for any unattended code-change experiments (see `zj-loop/ZJ-LOOP.md`).

## Test commands

This repo has no application test suite. Quality gates:

```bash
cd tools/zj-loop-audit && npm run build && node dist/cli.js ../../
bash scripts/before-after-demo.sh
```