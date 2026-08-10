// Keep the OPN TLS handshake deterministic across Node/OpenSSL versions and
// Tailscale DERP paths. P-256 is supported by the macOS and Windows baselines.
export const OPN_TLS_ECDH_CURVE = 'P-256';
