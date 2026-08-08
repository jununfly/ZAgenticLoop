# Cross-Platform Development Conventions

**Audience:** Agents and Humans developing or dogfooding this repository across
macOS, Windows, and Linux.

**Purpose:** Keep cross-platform work reproducible, diagnosable, and easy for
another Agent to continue. This document is a development convention, not an
OPN user manual and not a substitute for the roadmap or repository constraints.

## Agent Contract

Before changing code or asking another Agent to run a command:

1. Read `AGENTS.md` and `zj-loop/zj-loop-constraints.md`.
2. Identify the current branch, commit, worktree, dirty files, runtime version,
   operating system, shell, and package manager.
3. State the smallest observable goal and the files or commands it touches.
4. Prefer a test or a diagnostic probe that can distinguish competing causes.
5. Report exact success or failure signals, not only a conclusion.

An Agent must never assume that another machine has the same branch, generated
build, current directory, environment variables, executable paths, certificate
format, or provider installation. Report those facts explicitly.

## Source and Build Agreement

The source revision and generated build are one unit of work.

### Rule

Before a cross-device run, both machines must identify the exact Git commit and
build the same package from that revision. Do not hand-edit `dist/**`; regenerate
it from source.

### Agent procedure

```text
git status --short --branch
git rev-parse HEAD
npm ci                 # when dependencies are not already installed
npm run build
```

For a remote Agent, include the commit it actually ran in the handoff and in
the result. If source and build are copied through a non-Git channel, record the
source commit and an artifact digest.

### Verification signal

The commit, package lock state, and generated entrypoints are known on both
machines. A missing module, stale CLI, or unexpected argument is first treated
as a synchronization/build problem, not as a protocol problem.

## Shell and Script Authoring

Shells are transport layers around a command, not a portable programming
language. Quoting, argument conversion, path syntax, executable lookup, and
exit-code behavior differ between PowerShell, `cmd.exe`, Bash, and Zsh.

### Rule

For more than a trivial one-line expression, put logic in a repository script
or a temporary local script and invoke that file from the shell. Do not send
multi-line JavaScript through `node -e` embedded in a shell string.

Preferred shapes:

```powershell
node .\tools\zj-loop-core\open-transport-session.mjs
```

```bash
node tools/zj-loop-core/open-transport-session.mjs
```

Use `.mjs` for Node scripts that need ESM or top-level `await`. Use `.ps1` or
`.sh` for platform orchestration only when the platform-specific shell is
actually required.

### Authoring rules

- Keep dynamic data in files or structured input, rather than passing large JSON
  through shell arguments.
- Use single-purpose scripts with explicit input paths and explicit output.
- Avoid shell interpolation of secrets, certificates, JSON, and Windows paths.
- Use `path.join`/`path.resolve` in Node instead of concatenating separators.
- Do not claim that a quoting rule is portable without testing it in the target
  shell. PowerShell single-quoted strings are not JavaScript source; the safest
  fix for multi-line code is to remove the shell quoting boundary entirely by
  using a file.
- Preserve and check exit status. Print structured JSON for machine-consumed
  results and human-readable diagnostics to stderr.

### Verification signal

The same script can be invoked from the target machine's documented working
directory without manual quote edits. The output includes a schema/status and
the command fails non-zero when the operation is not successful.

## Paths, Executables, and Processes

### Rule

Treat executable discovery and process behavior as platform adapters. Core
protocol code must consume a provider-neutral result and must not assume that a
provider is on `PATH` or that a POSIX process model exists.

### Agent procedure

- Report `process.platform`, Node version, shell, current working directory, and
  the resolved executable path.
- Prefer the repository's bounded provider discovery over a single
  `Get-Command`/`which` probe.
- On Windows, account for `.exe`, `.cmd`, and `.bat` shims and use the existing
  process adapter rather than passing a shell command to `spawn`.
- On macOS/Linux, account for PATH differences between interactive and launched
  processes.
- Treat PID-only identity or termination as insufficient when the contract
  requires process identity, descendants, or cleanup proof.
- Do not kill an existing provider process merely because a test expected it to
  exit; it may belong to another user task. Use an isolated session, bounded
  child process, or explicit ownership check.

### Failure report

Include the requested provider, discovered candidates, selected executable,
existence/permission result, arguments (with secrets redacted), working
directory, process identity facts, and termination observation.

## TLS, Certificates, and Credentials

### Rule

Separate network reachability, TLS authentication, OPN identity, enrollment,
credential validity, and transport-session validity. A successful TCP check does
not prove any of the others.

For development certificates:

- The server certificate must contain a SAN matching the connection name (IP or
  DNS name); do not rely on the certificate common name alone.
- The client certificate must be signed by the configured CA and its identity
  digest must match the node identity used by the request.
- Keep private keys, CA private keys, bearer tokens, and session credentials on
  their owning machine. Transfer CSRs and signed public certificates only.
- Never disable certificate verification with `rejectUnauthorized=false`.
- Read bare token files with `.trim()` before constructing an Authorization
  header.
- Redact tokens, private keys, full credential files, and sensitive request
  headers from chat, logs, and evidence.

### Diagnostic order

1. TCP reachability.
2. Server TLS trust and SAN/name validation.
3. Client certificate/key import and CA trust.
4. Node identity digest and enrollment state.
5. Credential validity and capability ceiling.
6. Transport-session request body, protocol version, and expiry.

Record the first failing layer. Do not jump from a failed CLI to a protocol
conclusion before reproducing the same request through the adapter or a small
file-based diagnostic script.

## Protocol and Data Contracts

### Rule

Use typed, versioned contracts and the repository's canonicalization/digest
helpers. Do not recreate JSON field ordering, digest construction, signatures,
or state transitions in a shell script or provider adapter.

Every cross-device request/result should make these facts inspectable without
secrets:

- schema and protocol version
- network/node/session/request identifiers
- lifecycle status and reason when blocked
- digest or artifact reference
- expiry information
- side-effect status
- source commit and runtime/provider identity when execution is involved

An empty, duplicate, expired, malformed, or rejected result is a meaningful
outcome and must not be presented as success.

## Evidence and Diagnosis

Use the smallest reproducible slice:

1. Capture the exact command/script and sanitized inputs.
2. Capture environment facts and the source commit.
3. Reproduce at the lowest failing boundary: filesystem, executable discovery,
   TLS, HTTP payload, adapter, or graph orchestration.
4. Add a regression test before or with the fix when the behavior is in code.
5. Re-run the original cross-device scenario and record the final structured
   result.

When handing off, include:

```text
Goal:
Machine / OS / shell / Node:
Repository commit:
Working directory:
Command or script:
Expected signal:
Observed signal:
First failing boundary:
Already ruled out:
Secrets redacted:
Recommended next action:
```

Do not paste a full credential, private key, session token, or unredacted
environment dump into an Agent handoff.

## Agent-to-Agent Handoff

The receiving Agent must be able to continue without reconstructing hidden
conversation context. A handoff therefore links the roadmap/plan, names the
current lifecycle boundary, states what is intentionally out of scope, and
provides one executable next step.

Concrete provider names such as Codex or WorkBuddy are implementation choices,
not protocol identities. Keep contracts provider-neutral and put provider-
specific discovery or invocation behind adapters.

For a Human gate, tell the Human what action is required and show the pending
fact in the target UI when the product contract requires it. An Agent may
prepare evidence or a request; it must not silently make the final Human
decision.

## Platform Matrix

| Concern | macOS | Windows | Linux |
| --- | --- | --- | --- |
| Shell | Zsh/Bash | PowerShell/`cmd.exe` | Bash/Zsh |
| Paths | `/...` | `C:\...` | `/...` |
| Provider shims | executable on PATH/app bundle | `.exe`/`.cmd`/`.bat`, user install | executable on PATH/user install |
| Process boundary | process groups/native observation | job objects/native observation | process groups/native observation |
| IPC examples | Unix socket/inherited FD | named pipe/handle | Unix socket/inherited FD |
| Human signer options | Keychain | CNG/DPAPI or approved provider | PKCS#11/TPM2 or approved provider |

The matrix describes adapter boundaries, not implemented support. Never report
a platform as supported solely because the provider-neutral interface exists.

## Definition of Done for Cross-Platform Work

A cross-platform change is ready for review when:

- the source and generated build are tied to a known commit;
- the target platform path has a focused test or diagnostic result;
- platform-specific behavior is isolated behind an adapter or explicit script;
- success, blocked, duplicate, expired, and uncertain outcomes are distinguishable;
- evidence and handoff text contain no secrets and are independently actionable;
- `git diff --check` passes and the relevant repository gates are reported.

When a platform cannot satisfy a required identity, process, or protocol
contract, report `blocked` or `outcome-uncertain` with the missing observation;
do not silently downgrade the guarantee.

## Related References

- `AGENTS.md`
- `zj-loop/zj-loop-constraints.md`
- `ZJ-CONTEXT.md`
- `docs/designs/opn-architecture-state-overview.md`
- `docs/plans/opn-windows-agent-co-work-handoff.md`
- `tools/zj-loop-core/src/provider-executable-discovery.ts`
- `tools/zj-loop-core/src/local-process-adapter.ts`
- `tools/zj-loop-core/open-transport-session.mjs`
