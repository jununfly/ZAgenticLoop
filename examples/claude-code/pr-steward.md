# PR Steward — Claude Code

## Command

```bash
/loop 5m /pr-steward
```

Or explicit (matches this repo's pattern):

```bash
/loop 5m For each open PR I care about: triage CI and reviews. Propose minimal fixes in worktree. Verifier agent must approve before commenting. Update pr-steward-state.md. Max 3 attempts per PR.
```

## With /goal on a Single PR

```bash
/goal PR #1234 has green CI, no blocking review comments, and is rebased on main
```

## State

Use `pr-steward-state.md` from `starters/pr-steward/`.

## Notes

- Combine with hooks for pre-commit checks if the loop edits locally
- GitHub Actions can complement `/loop` when laptop is closed
