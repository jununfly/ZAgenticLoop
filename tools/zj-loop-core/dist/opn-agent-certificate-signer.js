import { access, chmod, mkdir, unlink, writeFile } from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
const execFile = promisify(execFileCallback);
export const OPN_AGENT_CERTIFICATE_SIGNER_SCHEMA = 'zj-loop.opn_agent_certificate_signer.v1';
async function exists(filePath) {
    try {
        await access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
function required(value, error) {
    if (!value.trim())
        throw new Error(error);
    return value;
}
export async function signOpnAgentCertificate(input) {
    const csrPath = path.resolve(required(input.csr_path, 'certificate-signer-csr-path-required'));
    const caKeyPath = path.resolve(required(input.ca_key_path, 'certificate-signer-ca-key-path-required'));
    const caCertPath = path.resolve(required(input.ca_cert_path, 'certificate-signer-ca-cert-path-required'));
    const certificatePath = path.resolve(required(input.output_cert_path, 'certificate-signer-output-path-required'));
    if (await exists(certificatePath))
        throw new Error('certificate-signer-output-exists');
    if (!(await exists(csrPath)) || !(await exists(caKeyPath)) || !(await exists(caCertPath)))
        throw new Error('certificate-signer-input-not-found');
    const days = input.days ?? 30;
    if (!Number.isInteger(days) || days < 1 || days > 825)
        throw new Error('certificate-signer-days-invalid');
    const serialPath = path.resolve(input.serial_path?.trim() || `${caCertPath}.srl`);
    await mkdir(path.dirname(certificatePath), { recursive: true });
    const extensionPath = path.join(path.dirname(certificatePath), `.zj-loop-client-ext-${process.pid}-${Date.now()}.cnf`);
    await writeFile(extensionPath, '[v3_client]\n basicConstraints=critical,CA:FALSE\n keyUsage=critical,digitalSignature,keyEncipherment\n extendedKeyUsage=clientAuth\n', { mode: 0o600 });
    const openssl = input.openssl_bin?.trim() || process.env.OPENSSL_BIN || 'openssl';
    try {
        await execFile(openssl, ['x509', '-req', '-in', csrPath, '-CA', caCertPath, '-CAkey', caKeyPath, '-CAcreateserial', '-CAserial', serialPath, '-out', certificatePath, '-days', String(days), '-sha256', '-extfile', extensionPath, '-extensions', 'v3_client'], { windowsHide: true });
        await chmod(certificatePath, 0o600);
    }
    catch {
        throw new Error('certificate-signer-openssl-failed');
    }
    finally {
        await unlink(extensionPath).catch(() => undefined);
    }
    return { schema: OPN_AGENT_CERTIFICATE_SIGNER_SCHEMA, status: 'signed', certificate_path: certificatePath, serial_path: serialPath };
}
