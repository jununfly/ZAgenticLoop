#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultCliIo, runCli } from './cli.js';
import { readProviderRuntimeServiceBinding } from './provider-runtime-service-binding.js';
import { createInMemoryProviderRuntimeProcessIdentityVerifier } from './provider-runtime-process-identity.js';
import { createProviderRuntimeServiceLifecycle } from './provider-runtime-service-lifecycle.js';
import { createMacOSProviderRuntimeProcessIdentityVerifier } from './macos-process-audit-peer-identity.js';
import { bootstrapProviderRuntimeArtifact } from './provider-runtime-artifact-bootstrap.js';
import { readProviderRuntimeStartConfig } from './provider-runtime-start-config-store.js';
import { readProviderRuntimeArtifactManifest } from './provider-runtime-artifact-manifest.js';
import { createSqliteStateStore } from './sqlite-state-store.js';
import { createProviderRuntimeArtifactApproval } from './provider-runtime-artifact-approval.js';
import { recordProviderRuntimeArtifactApproval } from './provider-runtime-artifact-approval-store.js';
import { createMacOSKeychainHumanSigner } from './macos-keychain-human-signer.js';
import { readFile } from 'node:fs/promises';
import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { createProviderRuntimeStartAssembly } from './provider-runtime-start-assembly.js';
import { createMacOSProviderRuntimeLauncher } from './provider-runtime-launcher-factory.js';
const SCHEMA = 'zj-loop.provider_runtime_cli.v1';
export function runProviderRuntimeCli(argv = process.argv.slice(2), io = defaultCliIo, deps) {
    return runCli({
        name: 'zj-loop-provider-runtime',
        description: 'Inspect or stop a provider runtime using a verified binding artifact.',
        usage: 'zj-loop-provider-runtime <bootstrap|approve|start|status|stop> [options] [--json]',
        options: [
            { name: 'command', type: 'positional', description: 'start, status, or stop' },
            { name: 'binding', type: 'string', description: 'Runtime binding artifact path' },
            { name: 'runtime_source', flag: 'runtime-source', type: 'string', description: 'Source Runtime executable for bootstrap' },
            { name: 'helper_source', flag: 'helper-source', type: 'string', description: 'Source process-audit helper for bootstrap' },
            { name: 'artifact_root', flag: 'artifact-root', type: 'string', description: 'Fixed artifact directory for bootstrap' },
            { name: 'config', type: 'string', description: 'Base Runtime start config for bootstrap' },
            { name: 'platform', type: 'string', description: 'Artifact platform override for bootstrap' },
            { name: 'challenge', type: 'string', description: 'Artifact approval challenge path' },
            { name: 'manifest', type: 'string', description: 'Artifact manifest path' },
            { name: 'state_store', flag: 'state-store', type: 'string', description: 'Network StateStore path' },
            { name: 'human_id', flag: 'human-id', type: 'string', description: 'Human identity for approval' },
            { name: 'key_tag', flag: 'key-tag', type: 'string', description: 'macOS Keychain key tag' },
            { name: 'helper_path', flag: 'helper-path', type: 'string', description: 'macOS Keychain signer helper path' },
            { name: 'expires_at', flag: 'expires-at', type: 'string', description: 'Approval expiry timestamp' },
            { name: 'process_identity_digest', flag: 'process-identity-digest', type: 'string', description: 'Verified Runtime process identity digest for start' },
            { name: 'macos_helper', flag: 'macos-helper', type: 'string', description: 'Pinned macOS process-audit helper path' },
            { name: 'macos_helper_digest', flag: 'macos-helper-digest', type: 'string', description: 'SHA-256 digest of the macOS process-audit helper' },
            { name: 'json', type: 'boolean', description: 'Emit structured JSON', default: false },
        ],
        async handler({ options }) {
            const command = String(options.command ?? '');
            if (command === 'bootstrap') {
                const required = (name) => { const value = options[name]; if (typeof value !== 'string' || value.trim() === '')
                    throw new Error(`provider-runtime-bootstrap-${name.replaceAll('_', '-')}-required`); return value; };
                const readStartConfig = deps?.read_start_config ?? readProviderRuntimeStartConfig;
                const bootstrap = deps?.bootstrap ?? bootstrapProviderRuntimeArtifact;
                const result = await bootstrap({ source_runtime_path: required('runtime_source'), source_helper_path: required('helper_source'), artifact_root: required('artifact_root'), base_config: await readStartConfig(required('config')), platform: typeof options.platform === 'string' ? options.platform : undefined });
                io.stdout(JSON.stringify({ schema: SCHEMA, status: result.status, side_effects_executed: result.side_effects_executed, artifact_path: result.artifact_path, manifest_path: result.manifest_path, manifest_digest: result.manifest.manifest_digest, challenge_path: result.challenge_path, challenge_digest: result.challenge.challenge_digest, start_config_path: result.start_config_path, next_action: 'human-approve' }));
                return 0;
            }
            if (command === 'approve') {
                const required = (name) => { const value = options[name]; if (typeof value !== 'string' || value.trim() === '')
                    throw new Error(`provider-runtime-approval-${name.replaceAll('_', '-')}-required`); return value; };
                const challenge = JSON.parse(await readFile(required('challenge'), 'utf8'));
                if (challenge.schema !== 'zj-loop.provider_runtime_artifact_approval_challenge.v1' || challenge.status !== 'pending')
                    throw new Error('provider-runtime-approval-challenge-invalid');
                const { challenge_digest, ...unsignedChallenge } = challenge;
                const canonicalChallenge = canonicalize(unsignedChallenge);
                if (typeof canonicalChallenge !== 'string' || `sha256:${createHash('sha256').update(canonicalChallenge, 'utf8').digest('hex')}` !== challenge_digest)
                    throw new Error('provider-runtime-approval-challenge-digest-invalid');
                const manifest = await readProviderRuntimeArtifactManifest(required('manifest'));
                if (manifest.manifest_digest !== challenge.manifest_digest || manifest.artifact_id !== challenge.artifact_id || manifest.profile !== challenge.artifact_profile || manifest.platform !== challenge.platform)
                    throw new Error('provider-runtime-approval-challenge-manifest-mismatch');
                const stateStore = createSqliteStateStore({ filename: required('state_store') });
                try {
                    const expected_revision = await stateStore.getRevision(challenge.network_id);
                    const signer = (deps?.create_signer ?? createMacOSKeychainHumanSigner)({ human_id: required('human_id'), key_tag: required('key_tag'), helper_path: required('helper_path') });
                    const now = new Date().toISOString();
                    const approval = await createProviderRuntimeArtifactApproval({ signer, network_id: challenge.network_id, node_id: challenge.node_id, device_id: challenge.device_id, manifest, approval_id: challenge.challenge_id, revision: expected_revision, issued_at: now, expires_at: typeof options.expires_at === 'string' ? options.expires_at : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });
                    const result = await recordProviderRuntimeArtifactApproval({ stateStore, approval, expected_revision, now });
                    io.stdout(JSON.stringify({ schema: SCHEMA, status: result.status, approval_id: result.approval_id, revision: result.revision, current_revision: result.current_revision, reason: result.reason, side_effects_executed: result.side_effects_executed }));
                    return result.status === 'recorded' || result.status === 'duplicate' ? 0 : 2;
                }
                finally {
                    await stateStore.close();
                }
            }
            if (command === 'start') {
                const configPath = typeof options.config === 'string' ? options.config : '';
                if (!configPath) {
                    const legacy = { schema: SCHEMA, status: 'blocked', reason: 'provider-runtime-start-config-required', side_effects_executed: false };
                    io.stdout(JSON.stringify(legacy));
                    return 2;
                }
                const readStartConfig = deps?.read_start_config ?? readProviderRuntimeStartConfig;
                const config = await readStartConfig(configPath);
                const processIdentityDigest = typeof options.process_identity_digest === 'string' ? options.process_identity_digest : '';
                if (!/^sha256:[0-9a-f]{64}$/.test(processIdentityDigest))
                    throw new Error('provider-runtime-start-process-identity-digest-required');
                const createAssembly = deps?.create_start_assembly ?? ((input) => createProviderRuntimeStartAssembly({ config: input.config, process_identity_digest: input.process_identity_digest, revoke_ref: async () => ({ status: 'blocked', reason: 'provider-runtime-revoke-authority-not-configured' }), create_launcher: ({ runtime, resolver, config, state_store }) => {
                        if (!config.macos_helper_path || !config.macos_helper_digest)
                            throw new Error('provider-runtime-start-macos-helper-required');
                        return createMacOSProviderRuntimeLauncher({ config, runtime, resolver, state_store, macos_helper_path: config.macos_helper_path, macos_helper_digest: config.macos_helper_digest });
                    } }));
                const assembly = createAssembly({ config, process_identity_digest: processIdentityDigest });
                const result = await assembly.service.start();
                io.stdout(JSON.stringify({ schema: SCHEMA, ...result, side_effects_executed: false }));
                return 0;
            }
            const bindingPath = typeof options.binding === 'string' ? options.binding : '';
            if (!bindingPath)
                throw new Error('provider-runtime-binding-required');
            const readBinding = deps?.read_binding ?? readProviderRuntimeServiceBinding;
            const binding = await readBinding(bindingPath);
            const lifecycle = deps?.lifecycle ?? createProviderRuntimeServiceLifecycle({ verifier: typeof options.macos_helper === 'string' && typeof options.macos_helper_digest === 'string'
                    ? createMacOSProviderRuntimeProcessIdentityVerifier({ helper_path: options.macos_helper, helper_digest: options.macos_helper_digest })
                    : createInMemoryProviderRuntimeProcessIdentityVerifier({ available: false }) });
            const result = command === 'status'
                ? await lifecycle.status({ binding })
                : command === 'stop'
                    ? await lifecycle.stop({ binding, terminate: deps?.terminate ?? (async () => { throw new Error('provider-runtime-terminate-not-configured'); }) })
                    : { status: 'blocked', reason: 'provider-runtime-command-unsupported' };
            io.stdout(JSON.stringify({ schema: SCHEMA, ...result, side_effects_executed: result.status === 'stopped' }));
            return result.status === 'ready' || result.status === 'stopped' ? 0 : 2;
        },
    }, argv, io);
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)))
    process.exitCode = await runProviderRuntimeCli();
