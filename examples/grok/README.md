# Grok Build TUI

New: See [changelog-drafter.md](./changelog-drafter.md) for the low-risk, high-ROI release notes pattern. Examples

Native primitives: `/loop`, `scheduler_create`, worktree isolation, skills, MCP, sub-agents.

| Example | Pattern |
|---------|---------|
| [daily-triage.md](./daily-triage.md) | Daily Triage |
| [zj-issue-triage.md](./zj-issue-triage.md) | Issue Triage (L1 propose-only) |

## Common Commands

```bash
/loop 5m /pr-steward check
/loop 1d Run zj-loop-triage and update STATE.md
/loop 15m Check CI on main — see patterns/ci-sweeper.md
```

Background tasks: `Ctrl+G` demote, queue pane `Ctrl+;`.

See [docs/primitives-matrix.md](../../docs/primitives-matrix.md).