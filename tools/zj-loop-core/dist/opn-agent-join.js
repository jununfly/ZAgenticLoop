import { request as httpsRequest } from 'node:https';
import { buildNodeIdentity, createPairingRequest, createPairingRequestProof } from './node-enrollment.js';
export const OPN_AGENT_JOIN_SCHEMA = 'zj-loop.opn_agent_join.v1';
function requiredText(value, error) {
    if (typeof value !== 'string' || !value.trim())
        throw new Error(error);
    return value;
}
export function createOpnAgentJoinRequest(input) {
    requiredText(input.certificate_pem, 'opn-agent-join-certificate-required');
    requiredText(input.private_key_pem, 'opn-agent-join-private-key-required');
    const identity = buildNodeIdentity({ certificate_pem: input.certificate_pem, display_name: input.display_name, agent_kind: input.agent_kind, agent_version: input.agent_version });
    const request = createPairingRequest({ request_id: input.request_id, network_id: input.network_id, identity, endpoint: input.endpoint, requested_capabilities: input.requested_capabilities, expires_at: input.expires_at });
    const proof = createPairingRequestProof({ request, private_key_pem: input.private_key_pem });
    return { request, proof };
}
function parseEndpoint(value) {
    let endpoint;
    try {
        endpoint = new URL(value);
    }
    catch {
        throw new Error('opn-agent-join-endpoint-invalid');
    }
    if (endpoint.protocol !== 'https:')
        throw new Error('opn-agent-join-https-required');
    return endpoint;
}
export function submitOpnAgentJoinRequest(input) {
    const endpoint = parseEndpoint(input.endpoint);
    if (!input.ca || !input.cert || !input.key)
        throw new Error('opn-agent-join-tls-material-required');
    const body = JSON.stringify(input.request);
    const options = {
        protocol: 'https:',
        hostname: endpoint.hostname,
        port: endpoint.port || 443,
        path: '/v1/pairing-requests',
        method: 'POST',
        ca: input.ca,
        cert: input.cert,
        key: input.key,
        servername: input.server_name ?? endpoint.hostname,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.3',
        timeout: input.timeout_ms ?? 10_000,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    };
    return new Promise((resolve, reject) => {
        const req = httpsRequest(options, (response) => {
            let text = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { text += chunk; });
            response.on('end', () => {
                try {
                    resolve({ statusCode: response.statusCode ?? 0, body: text ? JSON.parse(text) : null });
                }
                catch {
                    reject(new Error('opn-agent-join-response-invalid'));
                }
            });
        });
        req.on('timeout', () => req.destroy(new Error('opn-agent-join-timeout')));
        req.on('error', reject);
        req.end(body);
    });
}
