# Changelog Drafter Starter

Scaffold for the [Changelog Drafter](../../patterns/changelog-drafter.md) loop (L1 report + draft → L2 assisted publish prep). Excellent low-risk second or third loop.

## Quick Start

```bash
# Recommended
npx @jununfly/zj-loop-init . --pattern changelog-drafter --tool grok

# Or manual copy (Grok)
cp -r starters/changelog-drafter/.grok/skills/zj-changelog-scan .grok/skills/
cp -r starters/changelog-drafter/.grok/skills/zj-draft-release-notes .grok/skills/
cp starters/changelog-drafter/changelog-drafter-state.md.example changelog-drafter-state.md
mkdir -p zj-loop
cp starters/changelog-drafter/ZJ-LOOP.md zj-loop/ZJ-LOOP.md
```

Start (Grok example — report/draft only in week one):

```bash
/loop 1d Run zj-changelog-scan on merges since last tag (or last 7 days). Produce a clean categorized draft in RELEASE_NOTES_DRAFT.md using zj-draft-release-notes skill. Update changelog-drafter-state.md. Never publish or tag without explicit human approval.
```

## Files

| File | Purpose |
|------|---------|
| `changelog-drafter-state.md.example` | Tracks last release, scanned window, pending drafts |
| `.grok/skills/zj-changelog-scan/` | Discovery / triage of merges + signals |
| `.grok/skills/zj-draft-release-notes/` | Turns structured list into polished user-facing notes |
| `zj-loop/ZJ-LOOP.md` | Cadence, gates, and budget for your team |

## Also Bring In (recommended)

- `zj-loop-verifier` (or use the human as verifier for L1)
- Your project's release voice / style guide (add a short section to AGENTS.md or a project skill)

## Safety

- This loop proposes drafts only. Publishing (updating CHANGELOG.md, creating GitHub releases, pushing tags) should require human review or a very tight allowlist + verifier.
- Always surface breaking changes and security items explicitly for human sign-off.
- See [zj-loop/zj-loop-safety.md](../../zj-loop/zj-loop-safety.md) and the pattern doc for full guidance.

After copying, run:

```bash
npx @jununfly/zj-loop-audit . --suggest
```
