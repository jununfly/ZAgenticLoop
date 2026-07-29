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
