# Known TODO List

## OPN Multi-Windows Node Identity

### Problem

Multiple Windows devices may use the same repository, display name, provider, or
Tailscale network. Those values are not node identity and must not be used to
route a task or attribute a failure.

### Current deterministic rule

- `node_id` is the lowercase SHA-256 digest of the agent certificate DER bytes.
- Derive it from the active `agent.cert.pem`; never copy a historical node id.
- A task target is valid only when `target_node_id` equals the enrolled node id.
- Every diagnostic record must include `network_id`, `node_id`, `message_id`,
  `task_id`, `execution_id`, `attempt`, provider id, and session id when present.

### Known TODOs

- [ ] Add a first-class node inventory read model: node id, display name, platform,
  certificate fingerprint, enrollment status, last session, last heartbeat, and
  last error.
- [ ] Make Web UI node selection explicit and show the certificate fingerprint
  before sending a task.
- [ ] Reject ambiguous display-name-only task routing in every gateway command.
- [ ] Add a per-node service binding view for launchd, Windows Task Scheduler,
  and future systemd adapters.
- [ ] Add node-scoped log correlation and downloadable E2E evidence bundles.
- [ ] Add a diagnostic command that compares local certificate-derived node id
  with the task target before any network request.
- [ ] Add a multi-device E2E matrix covering duplicate display names, stale
  credentials, wrong target node ids, reconnect, and session expiry refresh.

### E2E operating convention

Before sending a task, record the target tuple:

```text
network_id + target_node_id + certificate_sha256 + display_name + platform
```

The sender must report the exact tuple and the resulting `message_id` before
the receiver starts diagnosis. A receiver must report the same tuple from its
local certificate and session-open response.
