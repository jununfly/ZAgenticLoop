import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
export const PROVIDER_EXECUTABLE_DISCOVERY_SCHEMA = 'zj-loop.provider_executable_discovery.v1';
const WINDOWS_PROVIDER_NAMES = {
    codex: ['codex.exe', 'codex.cmd'],
    'workbuddy-code': ['codebuddy.exe', 'codebuddy.cmd', 'workbuddy.exe', 'workbuddy.cmd'],
};
const POSIX_PROVIDER_NAMES = {
    codex: ['codex'],
    'workbuddy-code': ['codebuddy', 'workbuddy'],
};
function unique(values) { return [...new Set(values.filter((value) => Boolean(value)))]; }
function splitPath(value, pathApi) {
    return value ? value.split(pathApi.delimiter).filter(Boolean) : [];
}
function candidateNames(provider, platform) {
    return platform === 'win32' ? WINDOWS_PROVIDER_NAMES[provider] : POSIX_PROVIDER_NAMES[provider];
}
function joinIfRoot(root, pathApi, ...parts) {
    return root ? pathApi.join(root, ...parts) : undefined;
}
function knownWindowsCandidates(provider, env, pathApi) {
    const names = candidateNames(provider, 'win32');
    const roots = unique([
        env.LOCALAPPDATA,
        env.APPDATA,
        env.ProgramFiles,
        env['ProgramFiles(x86)'],
        env.USERPROFILE,
    ]);
    const result = [];
    for (const root of roots) {
        for (const product of provider === 'codex' ? ['Codex'] : ['WorkBuddy', 'CodeBuddy', 'workbuddy', 'codebuddy']) {
            for (const name of names) {
                result.push(pathApi.join(root, 'Programs', product, 'resources', 'app.asar.unpacked', 'cli', 'bin', name), pathApi.join(root, product, 'resources', 'app.asar.unpacked', 'cli', 'bin', name), pathApi.join(root, 'Programs', product, 'bin', name), pathApi.join(root, product, 'bin', name));
            }
        }
    }
    return result;
}
function knownPosixCandidates(provider, env, platform, pathApi) {
    const home = env.HOME;
    const names = candidateNames(provider, platform);
    const roots = unique(platform === 'darwin'
        ? ['/Applications', joinIfRoot(home, pathApi, 'Applications'), '/opt/homebrew/bin', '/usr/local/bin']
        : [joinIfRoot(home, pathApi, '.local', 'bin'), '/usr/local/bin', '/usr/bin']);
    return roots.flatMap((root) => names.map((name) => pathApi.join(root, name)));
}
async function defaultPathExists(candidate) {
    try {
        return (await stat(candidate)).isFile();
    }
    catch {
        return false;
    }
}
async function defaultScanDirectory(root, names, max_depth) {
    if (max_depth < 0)
        return undefined;
    let entries;
    try {
        entries = await readdir(root, { withFileTypes: true });
    }
    catch {
        return undefined;
    }
    for (const entry of entries) {
        const candidate = path.join(root, entry.name);
        if (entry.isFile() && names.has(entry.name.toLowerCase()))
            return candidate;
    }
    if (max_depth === 0)
        return undefined;
    for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === 'node_modules')
            continue;
        const found = await defaultScanDirectory(path.join(root, entry.name), names, max_depth - 1);
        if (found)
            return found;
    }
    return undefined;
}
export async function discoverProviderExecutable(input) {
    const platform = input.platform ?? process.platform;
    const pathApi = platform === 'win32' ? path.win32 : path.posix;
    const env = input.env ?? process.env;
    const names = candidateNames(input.provider, platform);
    const namesSet = new Set(names.map((name) => name.toLowerCase()));
    const exists = input.path_exists ?? defaultPathExists;
    const checked_paths = [];
    const explicit = input.explicit?.trim();
    if (explicit) {
        checked_paths.push(explicit);
        if (await exists(explicit))
            return { schema: PROVIDER_EXECUTABLE_DISCOVERY_SCHEMA, status: 'found', provider: input.provider, executable: explicit, source: 'explicit', checked_paths };
    }
    for (const directory of splitPath(env.PATH, pathApi)) {
        for (const name of names) {
            const candidate = pathApi.join(directory, name);
            checked_paths.push(candidate);
            if (await exists(candidate))
                return { schema: PROVIDER_EXECUTABLE_DISCOVERY_SCHEMA, status: 'found', provider: input.provider, executable: candidate, source: 'path', checked_paths };
        }
    }
    const known = platform === 'win32' ? knownWindowsCandidates(input.provider, env, pathApi) : knownPosixCandidates(input.provider, env, platform, pathApi);
    for (const candidate of known) {
        checked_paths.push(candidate);
        if (await exists(candidate))
            return { schema: PROVIDER_EXECUTABLE_DISCOVERY_SCHEMA, status: 'found', provider: input.provider, executable: candidate, source: 'known-install', checked_paths };
    }
    if (platform === 'win32') {
        const scan = input.scan_directory ?? defaultScanDirectory;
        for (const root of unique([env.LOCALAPPDATA, env.APPDATA, env.ProgramFiles, env['ProgramFiles(x86)']])) {
            checked_paths.push(`${root} (bounded provider scan)`);
            const found = await scan(root, namesSet, 5);
            if (found)
                return { schema: PROVIDER_EXECUTABLE_DISCOVERY_SCHEMA, status: 'found', provider: input.provider, executable: found, source: 'bounded-scan', checked_paths };
        }
    }
    return { schema: PROVIDER_EXECUTABLE_DISCOVERY_SCHEMA, status: 'unavailable', provider: input.provider, reason: 'provider-executable-not-found', checked_paths };
}
