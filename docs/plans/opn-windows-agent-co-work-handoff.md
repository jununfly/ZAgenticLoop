# OPN Windows Agent Co-work Handoff

**Purpose:** Share the current OPN cross-device work with an Agent running on the Windows PC so it can co-design and co-work with the Mac-based center responsibility unit.

**Date:** 2026-08-06

## Read First

For cross-platform implementation, shell authoring, environment reporting, and
Agent handoff conventions, read:

- `docs/devs/cross-platform-development-conventions.md`

The roadmap is the source of truth:

- `docs/plans/opn-real-use-validation-milestones-roadmap.json`
- `docs/plans/opn-real-use-validation-milestones-roadmap.md`

The current focus is `1-3-3` (cross-device real three-node read-only task). Its current status is intentionally `in_progress`.

Important boundary: a real Mac + Windows HTTPS endpoint check has passed, but Windows has **not** completed OPN enrollment, Human approval, credential claim, or a cross-device Graph read-only task.

## Shared Mental Model

```text
Human or Human+Agent
  = center responsibility unit
  = owns goal, orchestration, approval, review and final decision

Agent1 / Agent2 / Agent3
  = provider-neutral execution nodes
  = submit requests, consume bounded tasks, produce evidence

Tailscale
  = optional network reachability underlay only

ZAgenticLoop
  = Node Identity, P-256 mTLS, pairing, StateStore, Graph routing,
    execution evidence, verification and Human review
```

Codex and WorkBuddy are concrete provider examples, not protocol identities. Do not make the Windows implementation depend on a specific Agent vendor.

## Completed Evidence

### Cross-device Endpoint

The Mac endpoint was started on Tailscale address `100.119.216.26:43123`. The Windows device is currently `100.97.251.67`.

Observed underlay:

- Tailscale connectivity: available
- Path: DERP relay, not direct peer-to-peer
- Windows `Test-NetConnection 100.119.216.26 -Port 43123`: passed
- Windows HTTPS `GET /healthz`: passed

This proves endpoint reachability only. It does not prove OPN enrollment or Graph execution.

### Implemented source

The current Mac worktree contains these new OPN slices:

- `tools/zj-loop-core/src/opn-endpoint.ts`
- `tools/zj-loop-core/src/opn-endpoint-cli.ts`
- `tools/zj-loop-core/src/opn-agent-identity-bootstrap.ts`
- `tools/zj-loop-core/src/opn-agent-identity-bootstrap-cli.ts`
- `tools/zj-loop-core/src/opn-agent-join.ts`
- `tools/zj-loop-core/src/opn-agent-join-cli.ts`

Tests:

- `tools/zj-loop-core/test/opn-endpoint.test.mjs`
- `tools/zj-loop-core/test/opn-agent-identity-bootstrap.test.mjs`
- `tools/zj-loop-core/test/opn-agent-join.test.mjs`

Package commands:

- `zj-loop-opn-endpoint`
- `zj-loop-opn-agent-identity`
- `zj-loop-opn-agent-join`

The implementation is provider-neutral and uses P-256 ECDSA. The identity bootstrap currently uses an explicitly configured `openssl` executable as a development fallback. It generates a private key and CSR; it does not claim a certificate or enrollment.

## Current Verification

From `tools/zj-loop-core`:

```bash
npm run build
node --test \
  test/opn-agent-identity-bootstrap.test.mjs \
  test/opn-agent-join.test.mjs \
  test/opn-endpoint.test.mjs
git diff --check
```

All commands passed on the Mac.

## Windows Work

### 1. Sync the exact source/build

The OPN source and generated build must be synchronized as one committed revision. After this handoff is pushed, use the branch commit supplied by the Human center; do not assume another branch or an older package contains the new OPN files. If the Windows Agent cannot clone the branch, transfer the exact source/build artifact through an agreed local channel.

The Windows Agent must report the source commit/digest it actually ran.

### 2. Generate Windows identity material

After syncing the same build, run in PowerShell:

```powershell
node dist/opn-agent-identity-bootstrap-cli.js init `
  --output-dir C:\zj-loop\identity `
  --display-name "Windows Agent" `
  --agent-kind agent `
  --agent-version dev `
  --openssl-bin "C:\Program Files\OpenSSL-Win64\bin\openssl.exe"
```

Expected files:

```text
C:\zj-loop\identity\agent.key.pem
C:\zj-loop\identity\agent.csr.pem
C:\zj-loop\identity\agent-identity.json
```

The private key must remain on Windows. Transfer only the CSR to the Mac CA operator.

### 3. Sign the CSR on the Mac

Use the repository CLI on the Mac to sign the CSR. Never transfer `ca.key.pem` to Windows. For the development CA:

```bash
node tools/zj-loop-core/dist/opn-agent-identity-bootstrap-cli.js sign \
  --csr /path/to/agent.csr.pem \
  --ca-key /path/to/ca.key.pem \
  --ca-cert /path/to/ca.cert.pem \
  --output-cert /path/to/agent.cert.pem
```

Copy back only:

- the signed Agent certificate
- the CA certificate

The Mac endpoint already trusts the CA certificate configured as `--client-ca`, so a CA-signed client certificate can be used without changing the OPN protocol.

### 4. Submit the pairing request from Windows

Use the same network id and a fresh stable request id:

```powershell
node dist/opn-agent-join-cli.js `
  --endpoint https://100.119.216.26:43123 `
  --server-name 100.119.216.26 `
  --network-id opn-dogfood-20260806 `
  --request-id win-agent-20260806-001 `
  --display-name "Windows Agent" `
  --agent-kind agent `
  --agent-version dev `
  --agent-endpoint tailscale://100.97.251.67 `
  --capabilities event.consume `
  --expires-at 2026-08-06T13:00:00.000Z `
  --ca C:\zj-loop\identity\ca.cert.pem `
  --cert C:\zj-loop\identity\agent.cert.pem `
  --key C:\zj-loop\identity\agent.key.pem `
  --session-file C:\zj-loop\identity\join-session.json
```

The ordinary output must contain request/node/session identifiers but not the session token. The session token is written to the local session file and must not be pasted into chat, logs, or Evidence.

## Next Co-work Slice

Roadmap node: `1-3-3-2-2 Windows CSR 签发、真实 join request 与 Human approval`.

The Windows Agent should help validate and report:

1. Whether the exact build runs on Windows.
2. Whether `openssl.exe` is available and which version is used.
3. Whether the CA-signed client certificate is accepted by Mac mTLS.
4. The redacted join response: status, request id, node id, request digest, session id, expiry, and reason if blocked.
5. Any Windows path, permission, TLS hostname, or process behavior differences.

The Mac center then performs Human approval and enrollment verification. Do not mark `1-3-3` complete until the real Windows enrollment, reconnect behavior, Evidence aggregation, independent verification, Human review, and the three-node read-only Graph task all pass.

## Safety Boundaries

- Do not expose private keys, CA private keys, bearer/session tokens, or full credentials.
- Do not weaken TLS with `rejectUnauthorized=false` in product code.
- Do not use Tailscale reachability as OPN identity.
- Do not add write-enabled repository tasks in M3.
- Do not modify unrelated dirty files in the Mac worktree.
- Do not claim physical cross-device completion from loopback tests.

## Suggested Skills

- `zj-loop-constraints`: read before any repository or roadmap action.
- `zj-roadmap-driven`: keep work aligned with `1-3-3` and record decisions/status through the roadmap CLI.
- `zj-tdd`: implement one observable Windows behavior at a time.
- `zj-diagnose`: use for Windows-specific TLS, OpenSSL, path, or process failures.
- `zj-grill-me`: use when the Windows result exposes an unresolved protocol, authority, or scope decision.
