# zj-goal-audit

Goal Readiness Score CLI for run-until-done agentic workflows.

## Install / run

```bash
npx @jununfly/zj-goal-audit .
npx @jununfly/zj-goal-audit . --suggest
npx @jununfly/zj-goal-audit . --json
```

## Levels

| Level | Score | Meaning |
|-------|-------|---------|
| G0 | < 40 | Ad hoc `/goal` usage |
| G1 | 40–59 | GOAL.md + assisted goals |
| G2 | 60–79 | Verifier + test gates |
| G3 | 80+ | CI, budget, run log |

## Development

```bash
npm install
npm test
```
