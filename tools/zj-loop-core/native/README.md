# macOS Human Signer Helper

`macos-human-signer.swift` is the macOS implementation behind the
provider-neutral `HumanSigner` adapter.

## Build

Run on macOS with Xcode command-line tools installed:

```bash
swiftc -O \
  -framework Security \
  -framework CryptoKit \
  macos-human-signer.swift \
  -o macos-human-signer
```

The TypeScript adapter invokes the compiled helper with a Keychain tag. The
helper supports these commands:

- `identity <tag>` creates or loads the P-256 Keychain key and returns the
  public SPKI and SHA-256 fingerprint.
- `sign <tag>` reads `{ "payload_base64": "..." }` from stdin and returns the
  identity metadata plus the ECDSA P-256/SHA-256 signature.
- `delete <tag>` removes the tagged test or development key.

The private key is generated and retained by macOS Keychain. It is never
serialized into the helper output, Node.js, OpenSSL, or a repository file.
Production callers must use an explicit, protected helper path and should not
use a repository-local compiled binary as a trust root.

## macOS TrustedRunner peer identity helper

`macos-process-audit-peer-identity.swift` is the macOS OS-peer adapter used by
the TrustedRunner Unix-socket boundary. Build it with:

```bash
swiftc -O \
  -framework Security \
  -framework CryptoKit \
  macos-process-audit-peer-identity.swift \
  -o macos-process-audit-peer-identity
```

The helper receives an inherited accepted socket as FD 3 and obtains the peer
PID from `LOCAL_PEERPID`. It then resolves that PID to a valid macOS code
signature and returns a digest bound to the process ID and signing material.
The TypeScript adapter verifies the helper digest, validates the response, and
blocks when the OS identity is unavailable or drifts. It never accepts a
random token or an Agent-supplied identity as a fallback.
