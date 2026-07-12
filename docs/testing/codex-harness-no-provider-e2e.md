# Codex Harness No-Provider E2E Protocol

This test case defines the Codex-centered path when no GitHub or GitLab
provider is available:

```text
Local Protocol Input -> Route Decision -> Local Activation -> Local Review Artifact -> Local Closeout
```

The no-provider path uses the same harness input/output protocol as the
provider-backed path. The difference is only the carrier and evidence surfaces:
local files, local directories, branches, patches, and verification logs replace
issues, PRs, MRs, and provider comments.

## Replay Gate

Validate the local protocol input:

```bash
node tools/zj-loop-core/dist/harness-protocol-cli.js validate-input docs/testing/codex-harness-no-provider-input.json
```

Validate the local protocol output:

```bash
node tools/zj-loop-core/dist/harness-protocol-cli.js validate-output docs/testing/codex-harness-no-provider-output.json --expect-status completed
```

Render the local protocol output:

```bash
node tools/zj-loop-core/dist/harness-protocol-cli.js render-output docs/testing/codex-harness-no-provider-output.json
```

Expected results:

- The input validates as an explicit `fenced_protocol_block`.
- Ordinary natural language still cannot trigger side effects.
- Local activation is represented as a local carrier file, not a provider issue.
- Local review is represented as a branch, patch, or changed-file artifact.
- Local evidence is represented as deterministic files or logs.
- Local closeout remains a structured `perform_closeout` next action.

## Durable Mapping

| Provider-backed concept | No-provider equivalent |
| --- | --- |
| GitHub/GitLab issue carrier | Local activation request file |
| PR/MR | Local branch, patch, or changed-file review artifact |
| Provider comment evidence | Local evidence JSON/log |
| Post-merge closeout | Local request archive/closeout record |
| Provider URL resume anchor | Local file path resume anchor |

The protocol must stay provider-neutral. GitHub and GitLab are adapters over the
same loop protocol, not the protocol itself.
