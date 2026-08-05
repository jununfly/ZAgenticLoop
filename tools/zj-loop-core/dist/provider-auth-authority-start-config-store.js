import { readFile } from 'node:fs/promises';
import { validateProviderAuthAuthorityStartConfig } from './provider-auth-authority-start-config.js';
export async function readProviderAuthAuthorityStartConfig(filePath) {
    if (typeof filePath !== 'string' || !filePath.startsWith('/') || filePath.includes('\0'))
        throw new Error('provider-auth-authority-start-config-path-invalid');
    let value;
    try {
        value = JSON.parse(await readFile(filePath, 'utf8'));
    }
    catch {
        throw new Error('provider-auth-authority-start-config-read-failed');
    }
    const checked = validateProviderAuthAuthorityStartConfig(value);
    if (checked.status === 'blocked')
        throw new Error(checked.reason);
    return checked.config;
}
