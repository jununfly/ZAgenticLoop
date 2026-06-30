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

# Detect drift between STATE.md and LOOP.md
npx @jununfly/zj-loop-sync .
```

**New here?** [Quickstart (5 min)](docs/QUICKSTART.md) · [Interactive pattern picker](https://jununfly.github.io/ZAgenticLoop/#interactive)

---

## What's new

### New: `zj-loop-sync` CLI (npm v1.0.0)

Detect configuration drift between `STATE.md`, `LOOP.md`, and skill versions. Run in CI or locally:

```bash
npx @jununfly/zj-loop-sync . -v
```

Contributed via [#47](https://github.com/jununfly/ZAgenticLoop/pull/47) — thanks @community.

### New: `loop-constraints`

Structured guardrails file + enforcement skill. `zj-loop-init` now scaffolds `loop-constraints.md` and the `loop-constraints` skill on every run. `zj-loop-audit` scores constraints presence (+6 readiness points when file + skill both exist).

Contributed via [#71](https://github.com/jununfly/ZAgenticLoop/pull/71).

### New: `zj-loop-mcp-server` (repo v1)

MCP runtime lookup for patterns, skills, and state. Path traversal guards included.

```bash
node tools/zj-loop-mcp-server/dist/index.js
```

Contributed via [#72](https://github.com/jununfly/ZAgenticLoop/pull/72). npm publish coming soon.

### Updated npm packages

| Package | Version | Highlights |
|---------|---------|------------|
| `@jununfly/zj-loop-audit` | **1.5.0** | Constraints scoring + recommendations |
| `@jununfly/zj-loop-init` | **1.2.3** | Constraints scaffold; serialized asset bundling fix ([#80](https://github.com/jununfly/ZAgenticLoop/pull/80)) |
| `@jununfly/zj-loop-sync` | **1.0.0** | First npm release |

### Docs & discoverability

- [QUICKSTART.md](docs/QUICKSTART.md) — 5-minute path from zero to first loop
- [OpenClaw primitives matrix](docs/primitives-matrix.md) — cron, webhooks, heartbeat mapping
- Dark-theme SVG visuals + README polish
- Star History chart in README
- Post-run critique sections in daily-triage and changelog-drafter starters

---

## Community

This release merges work from 7 community PRs. Read the full story in [Discussion #89](https://github.com/jununfly/ZAgenticLoop/discussions/89).

**Run a loop?** Add yourself to [docs/adopters.md](docs/adopters.md) or [open an Add Adopter issue](https://github.com/jununfly/ZAgenticLoop/issues/new?template=add-adopter.yml).

**Show & tell:** [Discussions → Show and tell](https://github.com/jununfly/ZAgenticLoop/discussions/categories/show-and-tell)

---

## Companion — Goal Engineering

Loops discover ongoing work. **Goals finish bounded tasks.**

| Layer | Repo | Command |
|-------|------|---------|
| Discover (cadence) | [zagenticloop](https://github.com/jununfly/ZAgenticLoop) | `npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok` |
| Finish (run-until-done) | [goal-engineering](https://github.com/cobusgreyling/goal-engineering) | `npx @cobusgreyling/goal init . --pattern fix-bug --tool grok` |

**Stack cookbook:** [loop → goal → fleet day rhythm](https://github.com/cobusgreyling/goal-engineering/blob/main/docs/stack-cookbook.md)

```
/goal Read STATE.md top priority. Done when verifier PASS. goal-verifier before completed: true.
```