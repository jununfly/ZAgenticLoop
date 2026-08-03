import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { bootstrapIdentityDigest } from './bootstrap-protocol.js';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const RESPONSE_SCHEMA = 'zj-loop.macos_process_audit_peer_identity.v1';
function blocked(reason) { return { status: 'blocked', reason }; }
function parseResponse(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const item = value;
    if (item.schema !== RESPONSE_SCHEMA || (item.status !== 'verified' && item.status !== 'blocked'))
        return null;
    if (item.status === 'blocked')
        return typeof item.reason === 'string' && item.reason ? item : null;
    if (!Number.isInteger(item.process_id) || item.process_id < 1 || typeof item.identity_digest !== 'string' || !DIGEST.test(item.identity_digest)
        || typeof item.signing_identifier !== 'string' || !item.signing_identifier || (item.team_identifier !== undefined && item.team_identifier !== null && typeof item.team_identifier !== 'string')
        || typeof item.code_directory_hash !== 'string' || !item.code_directory_hash)
        return null;
    return item;
}
function identityDigest(value) {
    const material = canonicalize({
        code_directory_hash: value.code_directory_hash,
        process_id: value.process_id,
        signing_identifier: value.signing_identifier,
        ...(value.team_identifier == null ? {} : { team_identifier: value.team_identifier }),
    });
    if (typeof material !== 'string')
        throw new Error('macos-process-audit-identity-material-invalid');
    return `sha256:${createHash('sha256').update(material, 'utf8').digest('hex')}`;
}
function sha256(value) { return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`; }
export function createMacOSProcessAuditIdentityFacts(input) {
    if (!Number.isInteger(input.process_id) || input.process_id < 1 || !input.signing_identifier || !input.code_directory_hash)
        throw new Error('macos-process-audit-identity-facts-invalid');
    const facts = {
        schema: 'zj-loop.worker_identity_facts.v1',
        platform: 'darwin',
        kind: 'process-audit',
        process_id: input.process_id,
        signing_identifier: input.signing_identifier,
        ...(input.team_identifier == null ? {} : { team_identifier: input.team_identifier }),
        code_directory_hash: input.code_directory_hash,
        executable_digest: sha256(input.code_directory_hash),
        signer_digest: sha256(canonicalize({ signing_identifier: input.signing_identifier, ...(input.team_identifier == null ? {} : { team_identifier: input.team_identifier }) })),
    };
    bootstrapIdentityDigest(facts);
    return Object.freeze(facts);
}
async function invokeHelper(helperPath, socketFd, timeoutMs) {
    return await new Promise((resolve, reject) => {
        const child = spawn(helperPath, ['--socket-fd', '3'], { stdio: ['ignore', 'pipe', 'pipe', socketFd] });
        if (!child.stdout || !child.stderr) {
            child.kill('SIGKILL');
            reject(new Error('macos-process-audit-helper-pipes-unavailable'));
            return;
        }
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('macos-process-audit-helper-timeout')); }, timeoutMs);
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => { stdout += chunk; if (stdout.length > 16 * 1024) {
            child.kill('SIGKILL');
            reject(new Error('macos-process-audit-helper-output-too-large'));
        } });
        child.stderr.on('data', (chunk) => { stderr += chunk; if (stderr.length > 4 * 1024)
            child.kill('SIGKILL'); });
        child.once('error', (error) => { clearTimeout(timer); reject(error); });
        child.once('close', (code) => {
            clearTimeout(timer);
            if (code !== 0) {
                reject(new Error(stderr.trim() || `macos-process-audit-helper-exit-${code ?? 'unknown'}`));
                return;
            }
            try {
                const parsed = parseResponse(JSON.parse(stdout.trim()));
                if (!parsed)
                    throw new Error('macos-process-audit-helper-response-invalid');
                resolve(parsed);
            }
            catch (error) {
                reject(error);
            }
        });
    });
}
async function readNativeResponse(input, socket) {
    if (process.platform !== 'darwin')
        throw new Error('macos-process-audit-platform-unsupported');
    if (!DIGEST.test(input.helper_digest))
        throw new Error('macos-process-audit-helper-digest-invalid');
    const timeout = input.timeout_ms ?? 2_000;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60_000)
        throw new Error('macos-process-audit-timeout-invalid');
    const socketFd = socket._handle?.fd;
    if (!Number.isInteger(socketFd) || socketFd < 0)
        throw new Error('macos-process-audit-socket-fd-unavailable');
    const helperBytes = await readFile(input.helper_path);
    if (helperBytes.byteLength === 0 || `sha256:${createHash('sha256').update(helperBytes).digest('hex')}` !== input.helper_digest)
        throw new Error('macos-process-audit-helper-digest-invalid');
    return invokeHelper(input.helper_path, socketFd, timeout);
}
function nativeFacts(response) {
    if (response.status !== 'verified' || !Number.isInteger(response.process_id) || typeof response.signing_identifier !== 'string' || typeof response.code_directory_hash !== 'string')
        throw new Error('macos-process-audit-identity-response-invalid');
    return createMacOSProcessAuditIdentityFacts({ process_id: response.process_id, signing_identifier: response.signing_identifier, team_identifier: response.team_identifier, code_directory_hash: response.code_directory_hash });
}
export function createMacOSProcessAuditPeerIdentityVerifier(input) {
    const timeout = input.timeout_ms ?? 2_000;
    return async ({ socket, expected_identity_digest }) => {
        if (process.platform !== 'darwin')
            return blocked('macos-process-audit-platform-unsupported');
        if (!DIGEST.test(expected_identity_digest))
            return blocked('macos-process-audit-expected-digest-invalid');
        try {
            const response = await readNativeResponse(input, socket);
            if (response.status === 'blocked')
                return blocked(response.reason ?? 'macos-process-audit-blocked');
            if (response.identity_digest !== identityDigest(response))
                return blocked('macos-process-audit-identity-digest-invalid');
            if (response.identity_digest !== expected_identity_digest)
                return blocked('trusted-runner-peer-identity-mismatch');
            const identity = {
                schema: 'zj-loop.trusted_runner_peer_identity.v1', platform: 'darwin', kind: 'process-audit',
                identity_digest: response.identity_digest, process_id: response.process_id,
            };
            return { status: 'verified', identity };
        }
        catch (error) {
            return blocked(error instanceof Error ? error.message : 'macos-process-audit-failed');
        }
    };
}
export function createMacOSProcessAuditBootstrapPeerIdentityVerifier(input) {
    return async ({ socket, expected_identity_digest }) => {
        if (!DIGEST.test(expected_identity_digest))
            return blocked('macos-process-audit-expected-digest-invalid');
        try {
            const response = await readNativeResponse(input, socket);
            if (response.status === 'blocked')
                return blocked(response.reason ?? 'macos-process-audit-blocked');
            const facts = nativeFacts(response);
            const actual = bootstrapIdentityDigest(facts);
            if (actual !== expected_identity_digest)
                return blocked('trusted-runner-peer-identity-mismatch');
            return { status: 'verified', identity: { schema: 'zj-loop.trusted_runner_peer_identity.v1', platform: 'darwin', kind: 'process-audit', identity_digest: actual, process_id: facts.process_id } };
        }
        catch (error) {
            return blocked(error instanceof Error ? error.message : 'macos-process-audit-failed');
        }
    };
}
