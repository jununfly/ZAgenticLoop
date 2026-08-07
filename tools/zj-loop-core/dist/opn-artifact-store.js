import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
export const OPN_ARTIFACT_SCHEMA = 'zj-loop.opn_artifact.v1';
export const OPN_ARTIFACT_MAX_BYTES = 8 * 1024 * 1024;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
function digest(bytes) {
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
function requireDigest(value) {
    if (!DIGEST.test(value))
        throw new Error('opn-artifact-digest-invalid');
}
function requireFileName(value) {
    if (!value.trim() || value.includes('/') || value.includes('\\') || value === '.' || value === '..' || value.length > 255)
        throw new Error('opn-artifact-file-name-invalid');
    return value;
}
export function createOpnArtifactStore(input) {
    if (!input.root.trim())
        throw new Error('opn-artifact-store-root-required');
    const maxBytes = input.max_bytes ?? OPN_ARTIFACT_MAX_BYTES;
    if (!Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > OPN_ARTIFACT_MAX_BYTES)
        throw new Error('opn-artifact-max-bytes-invalid');
    const filePath = (artifact_id) => path.join(input.root, artifact_id.slice('sha256:'.length));
    const metaPath = (artifact_id) => `${filePath(artifact_id)}.json`;
    return {
        async put(value) {
            requireFileName(value.file_name);
            if (value.bytes.byteLength > maxBytes)
                throw new Error('opn-artifact-too-large');
            const content_sha256 = digest(value.bytes);
            if (value.expected_digest !== undefined) {
                requireDigest(value.expected_digest);
                if (value.expected_digest !== content_sha256)
                    throw new Error('opn-artifact-digest-mismatch');
            }
            const artifact_id = content_sha256;
            const metadata = { schema: OPN_ARTIFACT_SCHEMA, artifact_id, content_sha256, size_bytes: value.bytes.byteLength, file_name: value.file_name, media_type: value.media_type?.trim() || 'application/octet-stream' };
            await mkdir(input.root, { recursive: true });
            try {
                const existing = JSON.parse(await readFile(metaPath(artifact_id), 'utf8'));
                if (existing.content_sha256 !== artifact_id || existing.size_bytes !== value.bytes.byteLength)
                    throw new Error('opn-artifact-storage-conflict');
                return { status: 'duplicate', metadata: existing };
            }
            catch (error) {
                if (error instanceof Error && error.message === 'opn-artifact-storage-conflict')
                    throw error;
            }
            const temp = path.join(input.root, `.incoming-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
            await writeFile(temp, value.bytes, { flag: 'wx' });
            try {
                await rename(temp, filePath(artifact_id));
                await writeFile(metaPath(artifact_id), JSON.stringify(metadata), { flag: 'wx' });
            }
            catch (error) {
                await rm(temp, { force: true });
                if (error.code !== 'EEXIST')
                    throw error;
                return { status: 'duplicate', metadata: JSON.parse(await readFile(metaPath(artifact_id), 'utf8')) };
            }
            return { status: 'stored', metadata };
        },
        async read(artifact_id) {
            requireDigest(artifact_id);
            const metadata = JSON.parse(await readFile(metaPath(artifact_id), 'utf8'));
            const bytes = await readFile(filePath(artifact_id));
            if (digest(bytes) !== artifact_id || metadata.content_sha256 !== artifact_id || metadata.size_bytes !== bytes.byteLength)
                throw new Error('opn-artifact-integrity-failed');
            return { metadata, bytes };
        },
        async has(artifact_id) {
            requireDigest(artifact_id);
            try {
                await stat(metaPath(artifact_id));
                await stat(filePath(artifact_id));
                return true;
            }
            catch {
                return false;
            }
        },
    };
}
