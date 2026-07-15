# Changelog

All notable changes to `@jununfly/zj-loop-audit` are documented here.

## [0.1.6] - 2026-07-11

### Changed
- Align generated bundle readiness checks with the GitLab provider bundle and current route table maturity contract.
- Keep audit smoke workflow pins aligned with the `@jununfly/zj-loop-core@0.1.7` release.

## [0.1.5] - 2026-07-11

### Changed
- Publish the auditor with the current Route Table maturity vocabulary, including `install-ready`.
- Keep generated smoke workflow audit pins aligned with the published auditor version.

## [0.1.4] - 2026-07-09

### Changed
- Audit generated bundle readiness against the current workflow and route-table contracts.
- Clarify readiness versus execution authority in user-facing package documentation.
- Keep audit guidance aligned with local runtime state files and generated artifact policy.

## [0.1.3] - 2026-07-05

### Changed
- `--suggest` is now context-aware: it only recommends copy commands for missing artifacts and suggests targeted edits for files that already exist but need policy content.
- Findings now expose structured categories, score impact, and next steps so warnings are separated from blockers, readiness gaps, hardening, and future tooling.
- Safety policy detection now uses the canonical `zj-loop/zj-loop-safety.md` path.

## [1.5.2] - 2026-06-30

### Added
- Detect verifier agents in `opencode.json` and `opencode.json.example` (maker/checker split for Opencode loops)
- `--suggest` copy commands for Opencode (`loop-init --tool opencode`)

## [1.5.0] - 2026-06-30

### Added
- `zj-loop-constraints.md` and `zj-loop-constraints` skill detection in readiness scoring (+6 points when both present)
- Recommendations when constraints file or skill is missing

## [1.4.1] - 2026-06-13

### Changed
- Updated package description and keywords for better discoverability on npm / npx (emphasizes "agentic loop working", coding agents, and concrete usage examples).

## [1.3.0] - 2026-06-09

### Added
- Unit tests for scoring logic (`test/auditor.test.ts`)
- `--suggest` now mentions `zj-loop-init` scaffold CLI
- Registry and starter coverage in audit recommendations

### Changed
- CI gates on test suite before publish

## [1.2.0] - 2026-06-09

### Added
- `--suggest` copy-from-template commands for Grok, Claude Code, and Codex
- Expanded signals: MCP, worktree evidence, `patterns/registry.yaml`
- L3 scoring threshold with verifier + state requirements

## [1.1.0] - 2026-06-08

### Added
- `--md` markdown report format
- Safety doc and GitHub workflow detection

## [1.0.0] - 2026-06-07

### Added
- Initial Loop Readiness Score CLI (L0–L3)
- `--json` output for CI integration
