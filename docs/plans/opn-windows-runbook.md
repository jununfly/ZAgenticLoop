# OPN Windows Agent PowerShell + Node Runbook

**Purpose:** Capture the Windows + PowerShell + Node v24 debugging pitfalls that hit us during OPN enrollment and transport session work, so the Mac center can author Windows-runnable commands that don't trip on shell quoting.

**Date:** 2026-08-08

**Scope:** Windows PowerShell 5/7 + Node v24.18.0 + mTLS + `node:fs`/`node:https`/`node:crypto`.

**Audience:**

- **Mac center agent** — please follow the [Authoring rules](#authoring-rules-for-mac-center) when sending PowerShell to Windows.
- **Windows agent (Z)** — local reference; everything in [Recipes](#recipes) has been verified on the actual Windows machine.

## TL;DR

On Windows, do **not** put multi-line JavaScript inside `node -e '...'`. PowerShell single-quote strings are not literal — they interpret a small set of backslash escapes and silently mangle inner double quotes. Instead, ship a `.mjs` file and have PowerShell only run `node .\path\to\script.mjs`.

This is **not** a Node bug and **not** a bug in any specific PS version. It is a shape-of-the-language mismatch: PS single-quote is "almost literal but not quite", and any JS code that contains both `"` and `'` inside the same string is at risk.

## Read First

- `docs/plans/opn-windows-agent-co-work-handoff.md` — the upstream handoff that triggered the work this runbook debugs.
- `tools/zj-loop-core/src/opn-transport-http-server.ts` — confirms there is no "renew" endpoint; `POST /v1/transport/sessions` is the only way to (re)open a transport session, and it always returns a fresh `ots_...` id.
- `.workbuddy/memory/2026-08-08.md` — local Windows-side project memory with the timeline.

## Root cause (verified by behavior, not by PS source-diving)

PowerShell single-quote string `'...'` is documented to interpret only `''` (escaped single quote) and otherwise be literal. **In practice, the following Python-style escapes also fire inside PS single-quote strings** and we hit at least one in every `node -e` attempt that crossed the 3-line mark:

| Escape | PS behavior in `'...'` | Effect on JS code |
|---|---|---|
| `\0 \a \b \f \n \r \t \v` | Interpreted as control char | NUL/BEL/etc inside JS string → syntax error or payload corruption |
| `\z` | Eaten to empty string | `from "node:fs"` becomes `from node:fs` after the eating |
| `\"` | Eaten to `"` (sometimes) | `require("fs")` becomes `require(fs)` |
| `\\` | Becomes `\` | OK, but inconsistent across PS versions |

When a JS source file is more than ~3 lines, it almost always contains at least one of:

- A string literal with `\n` or `\t`
- An import path `"node:foo"` or `"./dist/bar.js"`
- A Windows path `C:\zj-loop\...`

Any one of those is enough to make `node -e '...'` fail. **Three independent failures during this OPN session** (each fully reproduced and then fixed) make this a pattern, not a one-off.

### Failures observed in this session

| # | Command pattern | First error line | Fix that worked |
|---|---|---|---|
| 1 | `node -e 'const fs=require("fs"),...https.request...' $body $token` | `require(fs),https=require(https),...` (literal) | Move JS to `\.workbuddy\transport-session.mjs`, call as `node .\path\script.mjs $body $token` |
| 2 | `node -e '...JSON.stringify({network_id:"opn-dogfood-20260806",...})' $id` | `400 json-invalid` from server (body was empty/wrong) | Same: `\.workbuddy\create-transport-session.mjs` reads everything from files |
| 3 | `node --input-type=module -e 'import {readFile} from "node:fs/promises";...'` | `SyntaxError: Unexpected identifier 'node'` (inner `"` lost) | Same: `tools\zj-loop-core\open-transport-session.mjs` |

## Authoring rules for Mac center

When you need to send a multi-line JS instruction to the Windows machine:

1. **Author the script in a code block; do not paste it as a PS `-e` argument.**
2. **File naming:** prefer `tools/zj-loop-core/<verb>-<noun>.mjs` for repo-resident scripts, or `.workbuddy/<verb>.mjs` for ad-hoc helpers. Windows agent will commit/push the file.
3. **Use single quotes for strings inside the script** (JS itself is fine with single quotes — PS is not in the picture once it's in a file).
4. **Use Windows-style absolute paths with `\\` escaping** inside JS strings: `'C:\\zj-loop\\identity\\agent.cert.pem'`. This is what JS sees as `C:\zj-loop\identity\agent.cert.pem` and what `readFileSync` accepts.
5. **Read dynamic inputs from files, not argv** whenever possible. The Windows machine has stable file paths (`C:\zj-loop\identity\*.pem`, `C:\zj-loop\identity\join-session.json.credential-token`) — read directly, no shell argument passing needed.
6. **Use top-level `await`** in ESM `.mjs` files. This is supported in Node ≥ 14 and removes the need for IIFEs.
7. **Single-line `-e` is still OK** for trivial one-shots (e.g. `node -e "console.log(1+1)"`), as long as the string has no `\"` or `\\` or `\n` or `\t`.

### Counter-examples (do not send these)

```powershell
# BAD — multi-line JS in single-quote string
node -e '
import { readFile } from "node:fs/promises";
import { createTlsTransportAdapter } from "./dist/tls-transport-adapter.js";
const adapter = createTlsTransportAdapter({
  endpoint: "https://100.119.216.26:43123",
  ca: await readFile("C:\\zj-loop\\identity\\ca.cert.pem", "utf8"),
  cert: await readFile("C:\\zj-loop\\identity\\agent.cert.pem", "utf8"),
  bearer_token: (await readFile("C:\\zj-loop\\identity\\join-session.json.credential-token", "utf8")).trim(),
});
console.log(await adapter.openSession({ network_id: "opn-dogfood-20260806", node_id: "5e555a2815a350df7df4417c8468570c13ac726a166134dbf687d4c8876465815" }));
'
```

### Recommended replacement (what to send instead)

```powershell
# GOOD — PowerShell only invokes the script
cd C:\workspace\github\jununfly\ZAgenticLoop\tools\zj-loop-core
node .\open-transport-session.mjs
```

…with the JS file living at `tools/zj-loop-core/open-transport-session.mjs`.

## Recipes

These have all been verified on the actual Windows + PowerShell + Node v24 machine and are kept in the repo under their respective paths.

### R1. Open a transport session (post-enrollment)

**Path:** `tools/zj-loop-core/open-transport-session.mjs`

```javascript
import { readFile } from 'node:fs/promises';
import { createTlsTransportAdapter } from './dist/tls-transport-adapter.js';

const adapter = createTlsTransportAdapter({
  endpoint: 'https://100.119.216.26:43123',
  ca: await readFile('C:\\zj-loop\\identity\\ca.cert.pem', 'utf8'),
  cert: await readFile('C:\\zj-loop\\identity\\agent.cert.pem', 'utf8'),
  key: await readFile('C:\\zj-loop\\identity\\agent.key.pem', 'utf8'),
  bearer_token: (await readFile(
    'C:\\zj-loop\\identity\\join-session.json.credential-token',
    'utf8'
  )).trim(),
});

const session = await adapter.openSession({
  network_id: 'opn-dogfood-20260806',
  node_id: '5e555a2815a350df7df441c8468570c13ac726a166134dbf687d4c8876465815',
});
console.log(JSON.stringify(session, null, 2));
```

**PowerShell:**

```powershell
cd C:\workspace\github\jununfly\ZAgenticLoop\tools\zj-loop-core
node .\open-transport-session.mjs
```

**Note:** this is the create-or-rotate path. There is no "renew" endpoint. See [Transport session lifecycle](#transport-session-lifecycle).

### R2. Generic mTLS POST (template)

**Path:** `.workbuddy/transport-session.mjs`

For ad-hoc POSTs that aren't covered by a first-class adapter. Reads the body and bearer token from `process.argv`. For better hygiene, prefer the recipes that read inputs from files.

### R3. Read credential token from file (`.trim()` matters)

```javascript
import { readFile } from 'node:fs/promises';
const token = (await readFile(
  'C:\\zj-loop\\identity\\join-session.json.credential-token',
  'utf8'
)).trim();
```

The file is 44 bytes; 43 chars of base64 token + 1 trailing newline. **Always `.trim()`** before sending as `Bearer ...` — without it the server rejects with `401 transport-credential-required`.

## Transport session lifecycle

Important shared mental model: **there is no transport-session renew endpoint.** Verified against `tools/zj-loop-core/src/opn-transport-http-server.ts` line 129–141:

- The only way to (re)obtain a transport session is `POST /v1/transport/sessions`.
- The server's `transport.openSession` is implemented as a fresh POST — every call generates a new `ots_${randomUUID()}` id.
- The new session's `expires_at` is `min(credential.expires_at, now + sessionTtl)`. So **no matter how many times you re-open, the session expires when the bearer token does**.
- The `opn-graph-verifier-cli run` flow internally calls `transport.openSession` (line 54 of `opn-graph-verifier-cli.ts`) — so it gets a new `ots_...` per run, not a "renewal" of the existing one.

**Implication for Mac center guidance:** do not say "run verifier to renew". It does open a fresh session, but that is a side effect of doing one verifier run, not a separate maintenance action. If Windows needs a long-lived transport session for non-verifier work, the only current options are:

1. Re-run R1 (or `\.workbuddy\create-transport-session.mjs`) before the current session expires.
2. Have Mac center rotate `join-session.json.credential-token` to a longer-lived credential, which raises the upper bound for all subsequent sessions.

## Open questions for Mac center

1. Is there a planned "session refresh" API in the next milestone (`opn-cross-device-transport-next-milestone-roadmap`)? If yes, this runbook's [R1](#r1-open-a-transport-session-post-enrollment) becomes a one-liner that hits it instead.
2. Is `opn-graph-verifier-cli run`'s implicit `openSession` supposed to be the canonical "re-establish transport" entry point, or are Windows clients expected to manage transport sessions themselves? Current Windows scripts do the latter, which is simpler but means Windows has to track expiry.
3. Should `join-session.json.session_token` (the JSON field) be considered deprecated in favor of `join-session.json.credential-token` (the bare file)? Mac's `db11d01 fix(opn): require SAN endpoint certificates` / `2b9e1d6 feat(opn): discover local provider executables` did not touch `join-session.json` schema, but the credential is now shipped as a separate file in practice.

## Related artifacts

- `tools/zj-loop-core/src/opn-transport-http-server.ts` — server-side session handling, line 129-141
- `tools/zj-loop-core/src/opn-graph-verifier-cli.ts` — verifier `run` flow, line 54 (calls `transport.openSession`)
- `tools/zj-loop-core/src/opn-transport-cli.ts` — the CLI counterpart Mac center can also use to validate
- `C:\zj-loop\identity\agent.cert.pem` and friends — the Windows-side mTLS material (do not commit)
- `C:\zj-loop\identity\join-session.json.credential-token` — bare credential token, 44 bytes, `.trim()` required
