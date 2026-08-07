import { request } from 'node:https';
export function createTlsOpnArtifactPublisher(input) {
    const base = new URL(input.endpoint);
    const call = (method, pathname, body, headers) => new Promise((resolve, reject) => {
        const options = { protocol: 'https:', hostname: base.hostname, port: base.port || 443, method, path: `${base.pathname.replace(/\/$/, '')}${pathname}`, ca: input.ca, cert: input.cert, key: input.key, rejectUnauthorized: true, minVersion: 'TLSv1.3', headers: { authorization: `Bearer ${input.bearer_token}`, 'content-length': body.byteLength, ...headers } };
        const req = request(options, (response) => { const chunks = []; response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))); response.on('end', () => resolve({ statusCode: response.statusCode ?? 0, body: Buffer.concat(chunks) })); });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
    return {
        async publish(inputValue) {
            const offered = await call('POST', '/v1/artifacts', Buffer.from(JSON.stringify({ transfer_id: inputValue.transfer_id, target_node_id: inputValue.target_node_id, metadata: inputValue.metadata })), { 'content-type': 'application/json' });
            if (offered.statusCode !== 200 && offered.statusCode !== 202)
                throw new Error('opn-artifact-publish-offer-failed');
            const uploaded = await call('PUT', `/v1/artifacts/${encodeURIComponent(inputValue.metadata.artifact_id)}`, inputValue.bytes, {});
            if (uploaded.statusCode !== 200 && uploaded.statusCode !== 201)
                throw new Error('opn-artifact-publish-upload-failed');
        },
    };
}
