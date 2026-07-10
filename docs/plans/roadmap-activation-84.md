# Roadmap Activation #84: Provider-Aware Adoption

Source issue: https://github.com/jununfly/ZAgenticLoop/issues/84

Activation:

- Issue Fix Request: https://github.com/jununfly/ZAgenticLoop/issues/84#issuecomment-4931703299
- Activation request: https://github.com/jununfly/ZAgenticLoop/issues/84#issuecomment-4931719844
- Branch: `zjal/act-84-4931709369-8c94c5b9-provider-aware-adoption`

## Parent Node 1: Provider-Aware Audit First Mile

Completion condition:

- Audit/project evidence distinguishes GitHub, GitLab, and manual/local adoption facts.
- `zj-loop-audit --suggest` no longer treats `.github` workflows as universal next-step hardening for GitLab/manual repositories.
- Tests cover GitHub, GitLab, self-managed GitLab, and manual/local fixture behavior where practical.

### Leaf 1-1: Provider Detection And Audit Guidance

Status: completed

Intent:

- Add provider facts to project evidence.
- Update audit guidance so GitLab/manual repositories get local substrate/provider guidance before GitHub Actions bundle advice.
- Keep GitHub-hosted behavior compatible.

Verification:

- `cd tools/zj-loop-core && npm test`
- `cd tools/zj-loop-audit && npm test`
- `cd tools/zj-loop-audit && npm run build && node dist/cli.js ../..`
- `bash scripts/before-after-demo.sh`
- Coverage added for GitHub adapter detection, GitLab remote/CI evidence,
  self-managed GitLab CI evidence, and manual/local guidance without universal
  `.github/workflows` recommendations.

## Parent Node 2: Provider-Aware Init Guard

Completion condition:

- `zj-loop-init --add github-actions` warns or refuses in non-GitHub repositories unless explicitly forced.
- GitHub users keep the current bundle behavior.

### Leaf 2-1: GitHub Actions Adapter Guard

Status: completed

Intent:

- Prevent inert `.github/workflows` bundle installation in detected GitLab repositories by default.
- Preserve `--force` as explicit override.

Verification:

- `cd tools/zj-loop-init && npm test`
- `npm run check:zj-loop-init`
- `npm run test:generated-bundle-release-gate`
- Tests cover detected GitLab refusal for `--add github-actions` and
  `--upgrade github-actions`, plus explicit `--force` override with warning.

## Parent Node 3: User-Facing Adoption Story

Completion condition:

- README/Quickstart clarify GitHub Actions as a provider adapter, not the universal substrate.
- Non-GitHub users see a local/report-only starting path.
- The dogfood improvement about low-friction source issue request carrier creation is captured as a follow-up design item or implemented if small enough.

### Leaf 3-1: Docs And Dogfood Finding

Status: completed

Intent:

- Update user-facing docs without over-promising full GitLab live automation.
- Capture the low-friction request-carrier improvement as a scoped follow-up unless implementation is trivial and safe.

Verification:

- `cd tools/zj-loop-audit && npm test`
- `cd tools/zj-loop-init && npm test`
- README, Quickstart, `tools/zj-loop-init/README.md`, and the user-project
  execution-ready bundle now describe GitHub Actions as a GitHub provider
  adapter and give GitLab/manual projects a local substrate first path.

Follow-up:

- Consider a future policy-governed fast path where a complete, low-risk
  existing source issue with a canonical `ready-for-agent` triage state can get
  a source-issue Issue Fix Request carrier without an additional fixed-phrase
  confirmation. Keep this out of the current slice because it changes authority
  policy, not only provider detection.
