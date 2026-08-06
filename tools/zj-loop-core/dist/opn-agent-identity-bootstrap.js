import { execFile as execFileCallback } from 'node:child_process';
import { access, chmod, mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
const execFile = promisify(execFileCallback);
export const OPN_AGENT_IDENTITY_BOOTSTRAP_SCHEMA = 'zj-loop.opn_agent_identity_bootstrap.v1';
function requiredText(value, error) {
    if (typeof value !== 'string' || !value.trim())
        throw new Error(error);
    return value;
}
async function exists(filePath) {
    try {
        await access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
export async function bootstrapOpnAgentIdentity(input) {
    requiredText(input.output_dir, 'identity-bootstrap-output-dir-required');
    requiredText(input.display_name, 'identity-bootstrap-display-name-required');
    requiredText(input.agent_kind, 'identity-bootstrap-agent-kind-required');
    requiredText(input.agent_version, 'identity-bootstrap-agent-version-required');
    const outputDir = path.resolve(input.output_dir);
    const privateKeyPath = path.join(outputDir, 'agent.key.pem');
    const csrPath = path.join(outputDir, 'agent.csr.pem');
    const metadataPath = path.join(outputDir, 'agent-identity.json');
    if ((await Promise.all([privateKeyPath, csrPath, metadataPath].map(exists))).some(Boolean))
        throw new Error('identity-bootstrap-output-exists');
    await mkdir(outputDir, { recursive: true });
    const openssl = input.openssl_bin?.trim() || process.env.OPENSSL_BIN || 'openssl';
    try {
        await execFile(openssl, ['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', privateKeyPath], { windowsHide: true });
        await chmod(privateKeyPath, 0o600);
        await execFile(openssl, ['req', '-new', '-key', privateKeyPath, '-out', csrPath, '-subj', `/CN=${input.display_name}`], { windowsHide: true });
    }
    catch {
        throw new Error('identity-bootstrap-openssl-failed');
    }
    const metadata = {
        schema: OPN_AGENT_IDENTITY_BOOTSTRAP_SCHEMA,
        certificate_status: 'pending',
        algorithm: 'ECDSA-P256',
        display_name: input.display_name,
        agent_kind: input.agent_kind,
        agent_version: input.agent_version,
        private_key_path: privateKeyPath,
        csr_path: csrPath,
        generated_at: input.now ?? new Date().toISOString(),
    };
    try {
        await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    }
    catch {
        throw new Error('identity-bootstrap-metadata-write-failed');
    }
    return { status: 'pending-certificate', private_key_path: privateKeyPath, csr_path: csrPath, metadata_path: metadataPath, metadata };
}
