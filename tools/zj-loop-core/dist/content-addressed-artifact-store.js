import { createHash } from 'node:crypto';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
export const CONTENT_ADDRESSED_ARTIFACT_SCHEMA = 'zj-loop.content_addressed_artifact.v1';
export const ARTIFACT_SIZE_LIMIT = 10 * 1024 * 1024;
function requireId(value, error) {
    if (!value.trim())
        throw new Error(error);
    return value;
}
function artifactPath(root, digest) {
    return path.join(root, 'sha256', digest.slice(0, 2), digest);
}
function metadataPath(contentPath) {
    return `${contentPath}.json`;
}
function parseArtifactId(value) {
    if (!/^sha256:[0-9a-f]{64}$/.test(value))
        throw new Error('artifact-id-invalid');
    return value.slice('sha256:'.length);
}
export function createContentAddressedArtifactStore(input) {
    requireId(input.root, 'artifact-store-root-required');
    return {
        async putArtifact(request) {
            requireId(request.network_id, 'network-id-required');
            requireId(request.content_type, 'artifact-content-type-required');
            if (!(request.content instanceof Uint8Array))
                throw new Error('artifact-content-invalid');
            if (request.content.byteLength > ARTIFACT_SIZE_LIMIT)
                throw new Error('artifact-too-large');
            const digest = createHash('sha256').update(request.content).digest('hex');
            const contentPath = artifactPath(input.root, digest);
            const metadata = { schema: CONTENT_ADDRESSED_ARTIFACT_SCHEMA, artifact_id: `sha256:${digest}`, network_id: request.network_id, content_sha256: digest, content_type: request.content_type, size_bytes: request.content.byteLength, created_at: request.now ?? new Date().toISOString() };
            await mkdir(path.dirname(contentPath), { recursive: true });
            try {
                const handle = await open(contentPath, 'wx');
                try {
                    await handle.writeFile(request.content);
                }
                finally {
                    await handle.close();
                }
                await writeFile(metadataPath(contentPath), JSON.stringify(metadata), { flag: 'wx' });
                return { status: 'recorded', metadata };
            }
            catch (error) {
                if (error.code !== 'EEXIST')
                    throw error;
                const existing = JSON.parse(await readFile(metadataPath(contentPath), 'utf8'));
                if (existing.network_id !== request.network_id || existing.content_sha256 !== digest || existing.content_type !== request.content_type || existing.size_bytes !== request.content.byteLength)
                    throw new Error('artifact-metadata-conflict');
                return { status: 'duplicate', metadata: existing };
            }
        },
        async readArtifact(request) {
            requireId(request.network_id, 'network-id-required');
            const digest = parseArtifactId(request.artifact_id);
            const contentPath = artifactPath(input.root, digest);
            let metadata;
            try {
                metadata = JSON.parse(await readFile(metadataPath(contentPath), 'utf8'));
            }
            catch {
                throw new Error('artifact-not-found');
            }
            if (metadata.network_id !== request.network_id)
                throw new Error('artifact-network-mismatch');
            const content = new Uint8Array(await readFile(contentPath));
            if (content.byteLength !== metadata.size_bytes || createHash('sha256').update(content).digest('hex') !== metadata.content_sha256 || metadata.content_sha256 !== digest)
                throw new Error('artifact-integrity-failed');
            return { metadata, content };
        },
    };
}
