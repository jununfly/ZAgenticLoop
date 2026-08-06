import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { readProviderRuntimeArtifactManifest, validateProviderRuntimeArtifactManifest } from './provider-runtime-artifact-manifest.js';
const execFile = promisify(execFileCallback);
function digestBytes(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function absolute(value) { return typeof value === 'string' && value.startsWith('/') && !value.includes('\0'); }
async function fileDigest(filePath) {
    return digestBytes(await readFile(filePath));
}
async function inspectMacOSSignature(filePath) {
    await execFile('/usr/bin/codesign', ['--verify', '--strict', filePath]);
    const details = await execFile('/usr/bin/codesign', ['-dvvv', '--strict', filePath]);
    const output = `${details.stdout}\n${details.stderr}`;
    const identifier = output.match(/^Identifier=(.+)$/m)?.[1]?.trim();
    const team = output.match(/^TeamIdentifier=(.+)$/m)?.[1]?.trim();
    const cdhash = output.match(/^CDHash=(.+)$/m)?.[1]?.trim();
    if (!identifier || !cdhash)
        throw new Error('provider-runtime-macos-signature-metadata-invalid');
    const team_id = !team || team === 'not set' ? null : team;
    return { identifier, team_id, code_directory_hash: cdhash, kind: team_id ? 'developer-id' : 'ad-hoc', notarized: false };
}
export function createProviderRuntimeArtifactVerifier(input) {
    if (!absolute(input.manifest_path) || !absolute(input.runtime_artifact_path) || !absolute(input.helper_artifact_path))
        throw new Error('provider-runtime-artifact-verifier-path-invalid');
    const platform = input.platform ?? process.platform;
    const inspect = input.inspect_signature ?? inspectMacOSSignature;
    return {
        async verify() {
            let manifest;
            try {
                manifest = await readProviderRuntimeArtifactManifest(input.manifest_path);
            }
            catch {
                return { status: 'blocked', reason: 'provider-runtime-artifact-manifest-read-failed' };
            }
            const checked = validateProviderRuntimeArtifactManifest(manifest, { profile: input.profile });
            if (checked.status === 'blocked')
                return checked;
            const value = checked.manifest;
            if (value.platform !== platform)
                return { status: 'blocked', reason: 'provider-runtime-artifact-platform-mismatch' };
            let runtimeDigest;
            let helperDigest;
            try {
                runtimeDigest = await fileDigest(input.runtime_artifact_path);
                helperDigest = await fileDigest(input.helper_artifact_path);
            }
            catch {
                return { status: 'blocked', reason: 'provider-runtime-artifact-read-failed' };
            }
            if (runtimeDigest !== value.runtime_artifact_digest || helperDigest !== value.helper_artifact_digest)
                return { status: 'blocked', reason: 'provider-runtime-artifact-digest-mismatch' };
            if (platform !== 'darwin')
                return { status: 'verified', manifest: value };
            let runtimeSignature;
            let helperSignature;
            try {
                runtimeSignature = await inspect(input.runtime_artifact_path);
                helperSignature = await inspect(input.helper_artifact_path);
            }
            catch {
                return { status: 'blocked', reason: 'provider-runtime-artifact-signature-unavailable' };
            }
            const expected = value.signing;
            if (runtimeSignature.identifier !== expected.identifier || helperSignature.identifier !== expected.identifier || runtimeSignature.team_id !== expected.team_id || helperSignature.team_id !== expected.team_id || runtimeSignature.kind !== expected.kind || helperSignature.kind !== expected.kind || runtimeSignature.code_directory_hash !== value.runtime_code_directory_hash || helperSignature.code_directory_hash !== value.helper_code_directory_hash || runtimeSignature.notarized !== expected.notarized || helperSignature.notarized !== expected.notarized)
                return { status: 'blocked', reason: 'provider-runtime-artifact-signature-mismatch' };
            return { status: 'verified', manifest: value };
        },
    };
}
