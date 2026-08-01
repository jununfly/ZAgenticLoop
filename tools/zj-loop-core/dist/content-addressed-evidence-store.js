import { createHash } from 'node:crypto';
import { appendFile, chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
function digest(content) { return `sha256:${createHash('sha256').update(content).digest('hex')}`; }
function requireDigest(value) { if (!DIGEST.test(value))
    throw new Error('evidence-digest-invalid'); return value.slice('sha256:'.length); }
export async function createContentAddressedEvidenceStore(input) {
    if (!path.isAbsolute(input.root))
        throw new Error('evidence-root-must-be-absolute');
    await mkdir(input.root, { recursive: true, mode: 0o700 });
    await chmod(input.root, 0o700);
    const auditPath = path.join(input.root, 'access.log');
    await writeFile(auditPath, '', { flag: 'a', mode: 0o600 });
    await chmod(auditPath, 0o600);
    return {
        async put(value) {
            if (!value.kind.trim())
                throw new Error('evidence-kind-required');
            const bytes = typeof value.content === 'string' ? Buffer.from(value.content, 'utf8') : Buffer.from(value.content);
            const fullDigest = digest(bytes);
            const hex = requireDigest(fullDigest);
            const directory = path.join(input.root, hex.slice(0, 2));
            const target = path.join(directory, hex.slice(2));
            await mkdir(directory, { recursive: true, mode: 0o700 });
            await chmod(directory, 0o700);
            try {
                const existing = await readFile(target);
                if (digest(existing) !== fullDigest)
                    throw new Error('evidence-digest-drift');
            }
            catch (error) {
                if (error instanceof Error && error.message === 'evidence-digest-drift')
                    throw error;
                const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
                await writeFile(temporary, bytes, { mode: 0o600 });
                await chmod(temporary, 0o600);
                await rename(temporary, target);
            }
            return { digest: fullDigest, size: bytes.byteLength, path: target, kind: value.kind };
        },
        async read(value) {
            if (!value.actor.trim())
                throw new Error('evidence-actor-required');
            const hex = requireDigest(value.digest);
            const target = path.join(input.root, hex.slice(0, 2), hex.slice(2));
            let content;
            try {
                content = await readFile(target);
            }
            catch {
                throw new Error('evidence-not-found');
            }
            if (digest(content) !== value.digest)
                throw new Error('evidence-digest-drift');
            await appendFile(auditPath, `${JSON.stringify({ schema: 'zj-loop.evidence_access.v1', actor: value.actor, digest: value.digest, accessed_at: new Date().toISOString() })}\n`, { mode: 0o600 });
            return content;
        },
    };
}
