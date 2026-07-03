# Security Policy

Agentic Loop Working runs unattended automation against your codebase. Treat loops like production operators.

## Reporting vulnerabilities

Report security issues **privately** — do not open public issues for exploitable vulnerabilities.

- **Preferred:** [GitHub private vulnerability reporting](https://github.com/jununfly/ZAgenticLoop/security/advisories/new)
- **GitHub:** report through the private advisory form above so the fix can stay coordinated.

For general loop safety guidance, see [docs/safety.md](docs/safety.md).

## Unattended automation risks

| Risk | Mitigation |
|------|------------|
| Auto-merge of malicious dependency | Denylist + verifier + no auto-merge week one |
| MCP over-permission | Read-only connectors for L1; scope write to PR comments only |
| Secret exfiltration via prompts | Denylist `.env`, credentials paths; never log secrets in zj-loop/STATE.md |
| Infinite fix loops burning budget | Hard attempt caps; kill switch in zj-loop/ZJ-LOOP.md |
| Supply-chain in loop-produced PRs | Human review for anything outside allowlist |

## Recommended gates before L3

- [ ] Path denylist documented in zj-loop/ZJ-LOOP.md
- [ ] Verifier runs tests in isolated worktree
- [ ] No auto-merge without explicit allowlist
- [ ] MCP connectors use least privilege
- [ ] `zj-loop/zj-loop-run-log.md` or equivalent observability

## Supported versions

| Package | Supported |
|---------|-----------|
| `@jununfly/zj-loop-audit` | Latest release on npm |
| `@jununfly/zj-loop-init` | Latest release on npm |
| Reference repo `main` | Current HEAD |
