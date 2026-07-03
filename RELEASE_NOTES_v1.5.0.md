# v1.5.0 — Community Tools Drop

Seven community PRs merged. Three new tools ship. One command to try everything.

## Quickstart (copy-paste)

```bash
# Scaffold your first loop (any git repo)
npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok

# Check token cost before you schedule
npx @jununfly/zj-loop-cost --pattern daily-triage --level L1 --cadence 1d

# Score readiness + get next steps
npx @jununfly/zj-loop-audit . --suggest

# Detect drift between zj-loop/STATE.md and zj-loop/ZJ-LOOP.md
npx @jununfly/zj-loop-sync .
```

**New here?** [Quickstart (5 min)](docs/QUICKSTART.md) · [Interactive pattern picker](docs/pattern-picker.md)

---

## What's new

### New: `zj-loop-sync` CLI

Detect configuration drift between `zj-loop/STATE.md`, `zj-loop/ZJ-LOOP.md`, and skill versions. Run in CI or locally:

```bash
npx @jununfly/zj-loop-sync . -v
```

Contributed through the ZAgenticLoop roadmap.

### New: `zj-loop-constraints`

Structured guardrails file + enforcement skill. `zj-loop-init` now scaffolds `zj-loop/zj-loop-constraints.md` and the `zj-loop-constraints` skill on every run. `zj-loop-audit` scores constraints presence (+6 readiness points when file + skill both exist).

Contributed through the ZAgenticLoop roadmap.

### New: `zj-loop-mcp-server` (repo v1)

MCP runtime lookup for patterns, skills, and state. Path traversal guards included.

```bash
node tools/zj-loop-mcp-server/dist/index.js
```

Contributed through the ZAgenticLoop roadmap.

### Updated npm packages

| Package | Version | Highlights |
|---------|---------|------------|
| `@jununfly/zj-loop-audit` | **0.1.x** | Constraints scoring + recommendations |
| `@jununfly/zj-loop-init` | **0.1.x** | Constraints scaffold; serialized asset bundling fix |
| `@jununfly/zj-loop-sync` | **0.1.x** | Drift detection |

### Docs & discoverability

- [QUICKSTART.md](docs/QUICKSTART.md) — 5-minute path from zero to first loop
- [OpenClaw primitives matrix](docs/primitives-matrix.md) — cron, webhooks, heartbeat mapping
- Dark-theme SVG visuals + README polish
- Star History chart in README
- Post-run critique sections in daily-triage and changelog-drafter starters

---

## Community

This release merges the current ZAgenticLoop roadmap work.

**Run a loop?** Add yourself to [docs/adopters.md](docs/adopters.md) or open an adopter issue in this repository.

**Show & tell:** Use this repository's GitHub Discussions.

---

## Companion — Goal Engineering

Loops discover ongoing work. **Goals finish bounded tasks.**

| Layer | Repo | Command |
|-------|------|---------|
| Discover (cadence) | [ZAgenticLoop](https://github.com/jununfly/ZAgenticLoop) | `npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok` |
| Finish (run-until-done) | `zj-goal-audit` | `npx @jununfly/zj-goal-audit . --suggest` |

**Stack cookbook:** Use the loop patterns plus goal readiness checks together.

```
/goal Read zj-loop/STATE.md top priority. Done when verifier PASS. goal-verifier before completed: true.
```
