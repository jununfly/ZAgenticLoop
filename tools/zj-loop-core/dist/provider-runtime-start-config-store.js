import { readFile } from 'node:fs/promises';
import { validateProviderRuntimeStartConfig } from './provider-runtime-start-config.js';
export async function readProviderRuntimeStartConfig(filePath) {
    if (typeof filePath !== 'string' || !filePath.startsWith('/') || filePath.includes('\0'))
        throw new Error('provider-runtime-start-config-path-invalid');
    let value;
    try {
        value = JSON.parse(await readFile(filePath, 'utf8'));
    }
    catch {
        throw new Error('provider-runtime-start-config-read-failed');
    }
    const checked = validateProviderRuntimeStartConfig(value);
    if (checked.status === 'blocked')
        throw new Error(checked.reason);
    return checked.config;
}
