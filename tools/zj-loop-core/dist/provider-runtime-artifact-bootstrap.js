import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { createProviderRuntimeArtifactManifest, validateProviderRuntimeArtifactManifest } from './provider-runtime-artifact-manifest.js';
import { inspectMacOSSignature } from './provider-runtime-artifact-verifier.js';
import { validateProviderRuntimeStartConfig } from './provider-runtime-start-config.js';
const execFile = promisify(execFileCallback);
const DIGEST = /^sha256:[0-9a-f]{64}$/;
export const PROVIDER_RUNTIME_ARTIFACT_APPROVAL_CHALLENGE_SCHEMA = 'zj-loop.provider_runtime_artifact_approval_challenge.v1';
function canonical(value) { const result = canonicalize(value); if (typeof result !== 'string')
    throw new Error('provider-runtime-artifact-bootstrap-canonicalization-invalid'); return result; }
function digest(value) { return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`; }
function bytesDigest(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function absolute(value) { return typeof value === 'string' && value.startsWith('/') && !value.includes('\0'); }
function text(value) { return typeof value === 'string' && value.trim() !== '' && !value.includes('\0'); }
function platform(value) { const current = value ?? process.platform; if (current === 'darwin' || current === 'win32' || current === 'linux')
    return current; throw new Error('provider-runtime-artifact-bootstrap-platform-unsupported'); }
function challengeDigest(value) { return digest(value); }
async function fileDigest(filePath) { return bytesDigest(await readFile(filePath)); }
async function adHocSign(filePath, identifier) { await execFile('/usr/bin/codesign', ['--force', '--sign', '-', '--identifier', identifier, filePath]); }
function syntheticSignature(fileDigestValue) { return { identifier: 'development-local', team_id: null, code_directory_hash: fileDigestValue.slice(7, 47), kind: 'ad-hoc', notarized: false }; }
async function writeJson(filePath, value, mode) { await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode }); await chmod(filePath, mode); }
export async function bootstrapProviderRuntimeArtifact(input) {
    if (!absolute(input.source_runtime_path) || !absolute(input.source_helper_path) || !absolute(input.artifact_root))
        throw new Error('provider-runtime-artifact-bootstrap-path-invalid');
    const checkedConfig = validateProviderRuntimeStartConfig(input.base_config);
    if (checkedConfig.status === 'blocked')
        throw new Error(`provider-runtime-artifact-bootstrap-config-${checkedConfig.reason}`);
    const targetPlatform = platform(input.platform);
    const now = input.now ?? (() => new Date().toISOString());
    const runtimeSourceDigest = await fileDigest(input.source_runtime_path);
    const helperSourceDigest = await fileDigest(input.source_helper_path);
    const artifactId = `runtime-${runtimeSourceDigest.slice(7, 19)}-${helperSourceDigest.slice(7, 19)}`;
    const artifactPath = path.join(input.artifact_root, artifactId);
    const runtimeArtifactPath = path.join(artifactPath, 'runtime');
    const helperArtifactPath = path.join(artifactPath, 'helper');
    const manifestPath = path.join(artifactPath, 'manifest.json');
    const challengePath = path.join(artifactPath, 'approval-challenge.json');
    const startConfigPath = path.join(artifactPath, 'start-config.json');
    await mkdir(artifactPath, { recursive: true, mode: 0o700 });
    await copyFile(input.source_runtime_path, runtimeArtifactPath);
    await copyFile(input.source_helper_path, helperArtifactPath);
    const sign = input.sign_artifact ?? (targetPlatform === 'darwin' ? adHocSign : async () => undefined);
    if (targetPlatform === 'darwin') {
        await sign(runtimeArtifactPath, 'com.zagenticloop.development.runtime');
        await sign(helperArtifactPath, 'com.zagenticloop.development.runtime');
    }
    const runtimeDigest = await fileDigest(runtimeArtifactPath);
    const helperDigest = await fileDigest(helperArtifactPath);
    const inspect = input.inspect_signature ?? (targetPlatform === 'darwin' ? inspectMacOSSignature : async (filePath) => syntheticSignature(await fileDigest(filePath)));
    const runtimeSignature = await inspect(runtimeArtifactPath);
    const helperSignature = await inspect(helperArtifactPath);
    if (runtimeSignature.identifier !== helperSignature.identifier || runtimeSignature.team_id !== helperSignature.team_id || runtimeSignature.kind !== helperSignature.kind || runtimeSignature.notarized !== helperSignature.notarized)
        throw new Error('provider-runtime-artifact-bootstrap-signature-pair-mismatch');
    const manifest = createProviderRuntimeArtifactManifest({ artifact_id: artifactId, profile: 'development-local', platform: targetPlatform, runtime_artifact_digest: runtimeDigest, helper_artifact_digest: helperDigest, runtime_code_directory_hash: runtimeSignature.code_directory_hash, helper_code_directory_hash: helperSignature.code_directory_hash, signing: { kind: runtimeSignature.kind, identifier: runtimeSignature.identifier, team_id: runtimeSignature.team_id, notarized: runtimeSignature.notarized }, version: artifactId, created_at: now() });
    const manifestCheck = validateProviderRuntimeArtifactManifest(manifest, { profile: 'development-local' });
    if (manifestCheck.status === 'blocked')
        throw new Error(manifestCheck.reason);
    const challengeUnsigned = { schema: PROVIDER_RUNTIME_ARTIFACT_APPROVAL_CHALLENGE_SCHEMA, challenge_id: `challenge-${artifactId}`, status: 'pending', network_id: checkedConfig.config.network_id, node_id: checkedConfig.config.runtime_id, device_id: checkedConfig.config.runtime_id, artifact_id: manifest.artifact_id, manifest_digest: manifest.manifest_digest, artifact_profile: manifest.profile, platform: manifest.platform, created_at: now() };
    const challenge = { ...challengeUnsigned, challenge_digest: challengeDigest(challengeUnsigned) };
    const startConfig = { ...checkedConfig.config, artifact_manifest_path: manifestPath, runtime_artifact_path: runtimeArtifactPath, helper_artifact_path: helperArtifactPath, artifact_profile: manifest.profile, macos_helper_path: helperArtifactPath, macos_helper_digest: manifest.helper_artifact_digest, runtime_binding: { ...checkedConfig.config.runtime_binding, runtime_manifest_digest: manifest.manifest_digest } };
    const startCheck = validateProviderRuntimeStartConfig(startConfig);
    if (startCheck.status === 'blocked')
        throw new Error(`provider-runtime-artifact-bootstrap-start-config-${startCheck.reason}`);
    await writeJson(manifestPath, manifest, 0o600);
    await writeJson(challengePath, challenge, 0o600);
    await writeJson(startConfigPath, startConfig, 0o600);
    return { status: 'prepared', side_effects_executed: false, artifact_path: artifactPath, runtime_artifact_path: runtimeArtifactPath, helper_artifact_path: helperArtifactPath, manifest_path: manifestPath, challenge_path: challengePath, start_config_path: startConfigPath, manifest, challenge, start_config: startCheck.config };
}
