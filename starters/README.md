# Starters

Clone-and-run scaffolds. Copy into your project — or use `zj-loop-init`:

```bash
npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok
npx @jununfly/zj-loop-init . -p pr-steward -t claude
```

`zj-loop-init` also creates the shared control-plane files that all starters
use: `zj-loop/zj-loop-route-table.yaml`, `zj-loop/zj-loop-budget.md`,
`zj-loop/zj-loop-run-log.md`, and `zj-loop/zj-loop-constraints.md`.
Manual copies can add the canonical route table with:

```bash
npx @jununfly/zj-loop-init . --add route-table
```

## Daily Triage (L1 report-only)

| Starter | Tool | Path |
|---------|------|------|
| [minimal-loop](./minimal-loop/) | Grok | `.grok/skills/` |
| [minimal-loop-claude](./minimal-loop-claude/) | Claude Code | `.claude/skills/` + `.claude/agents/` |
| [minimal-loop-codex](./minimal-loop-codex/) | Codex | `.codex/skills/` + `.codex/agents/` |

## L2 assisted patterns

| Starter | Pattern | Tools | Readiness |
|---------|---------|-------|-----------|
| [pr-steward](./pr-steward/) | PR Steward | Grok, Claude, Codex | L2 assisted |
| [ci-sweeper](./ci-sweeper/) | CI Sweeper | Grok, Claude, Codex | L2 assisted |
| [dependency-sweeper](./dependency-sweeper/) | Dependency Sweeper | Grok, Claude, Codex | L2 patch-only |
| [post-merge-cleanup](./post-merge-cleanup/) | Post-Merge Cleanup | Grok, Claude, Codex | L1 → L2 |
| [changelog-drafter](./changelog-drafter/) | Changelog Drafter | Grok, Claude, Codex | L1 draft → L2 |
| [issue-triage](./issue-triage/) | Issue Triage | Grok, Claude, Codex | L1 propose-only |

After copying:

```bash
npx @jununfly/zj-loop-audit .
npx @jununfly/zj-loop-audit . --suggest
```
