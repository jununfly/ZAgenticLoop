#!/usr/bin/env node
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildAgentContextCapabilityReview } from './agent-context-capability-review.js';
import { runCli } from './cli.js';
const execFileAsync = promisify(execFile);
process.exitCode = await runCli({
    name: 'zj-loop-agent-context-review',
    description: 'Validate and materialize a read-only Agent context capability review.',
    usage: 'zj-loop-agent-context-review --input <file> [--root <dir>] [--ref <commit>] [--out <file>] [--json]',
    options: [
        { name: 'input', type: 'string', description: 'JSON review input without the canonical schema field' },
        { name: 'root', type: 'string', description: 'Verify hashed evidence refs relative to this repository root' },
        { name: 'ref', type: 'string', description: 'Verify evidence blobs from this git ref instead of the working tree' },
        { name: 'out', type: 'string', description: 'Write the canonical report to this path' },
        { name: 'execute', type: 'boolean', description: 'Execute the allowlisted verification commands and refresh their artifacts' },
        { name: 'json', type: 'boolean', description: 'Print the canonical report' },
    ],
    async handler({ io, options }) {
        if (typeof options.input !== 'string' || options.input.trim() === '') {
            throw new Error('--input is required');
        }
        const input = JSON.parse(await readFile(options.input, 'utf8'));
        if (options.execute === true) {
            if (typeof options.root !== 'string' || options.root.trim() === '')
                throw new Error('--root is required with --execute');
            await executeVerificationManifest(input, path.resolve(options.root));
        }
        const report = buildAgentContextCapabilityReview(input);
        if (typeof options.root === 'string' && options.root.trim() !== '') {
            const root = path.resolve(options.root);
            const canonicalRoot = await realpath(root);
            if (typeof options.ref === 'string' && options.ref.trim() !== '') {
                const resolvedRef = await resolveGitCommit(root, options.ref);
                if (resolvedRef.toLowerCase() !== report.target.commit.toLowerCase())
                    throw new Error('target commit mismatch');
            }
            for (const [key, evidence] of Object.entries(report.evidence_refs)) {
                if (!evidence.hash)
                    continue;
                const target = await verifyPathWithinRoot(canonicalRoot, root, evidence.path, key);
                const data = typeof options.ref === 'string' && options.ref.trim() !== ''
                    ? await readPinnedFile(root, options.ref, evidence.path, key)
                    : await readFile(target);
                const actual = createHash('sha256').update(data).digest('hex');
                if (actual !== evidence.hash.toLowerCase())
                    throw new Error(`evidence hash mismatch: ${key}`);
            }
            for (const [index, manifest] of report.verification_manifest.entries()) {
                if (!manifest.output_path || !manifest.output_sha256)
                    continue;
                const target = await verifyPathWithinRoot(canonicalRoot, root, manifest.output_path, `manifest-${index}`);
                const data = typeof options.ref === 'string' && options.ref.trim() !== ''
                    ? await readPinnedFile(root, options.ref, manifest.output_path, `manifest-${index}`)
                    : await readFile(target);
                const actual = createHash('sha256').update(data).digest('hex');
                if (actual !== manifest.output_sha256.toLowerCase())
                    throw new Error(`manifest output hash mismatch: ${index}`);
            }
        }
        const text = `${JSON.stringify(report, null, 2)}\n`;
        if (typeof options.out === 'string' && options.out.trim() !== '') {
            await writeFile(options.out, text);
        }
        if (options.json === true || typeof options.out !== 'string')
            io.stdout(text.trimEnd());
    },
});
async function readPinnedFile(root, ref, relativePath, label) {
    if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes('..'))
        throw new Error(`evidence path escapes root: ${label}`);
    try {
        const result = await execFileAsync('git', ['-C', root, 'show', `${ref}:${relativePath}`]);
        return Buffer.from(result.stdout);
    }
    catch {
        throw new Error(`evidence hash mismatch: ${label}`);
    }
}
async function verifyPathWithinRoot(canonicalRoot, root, relativePath, label) {
    const target = path.resolve(root, relativePath);
    if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes('..') || (target !== root && !target.startsWith(`${root}${path.sep}`))) {
        throw new Error(`evidence path escapes root: ${label}`);
    }
    const canonicalTarget = await realpath(target).catch(() => { throw new Error(`evidence path escapes root: ${label}`); });
    if (canonicalTarget !== canonicalRoot && !canonicalTarget.startsWith(`${canonicalRoot}${path.sep}`))
        throw new Error(`evidence path escapes root: ${label}`);
    return canonicalTarget;
}
async function executeVerificationManifest(input, root) {
    const now = new Date().toISOString();
    for (const [index, manifest] of (input.verification_manifest ?? []).entries()) {
        if (typeof manifest.command !== 'string' || typeof manifest.output_path !== 'string')
            throw new Error(`manifest entry ${index} requires command and output_path`);
        const outputPath = await prepareOutputPath(root, manifest.output_path, `manifest-${index}`);
        let status = 'passed';
        let exitCode = 0;
        let output = '';
        try {
            output = await runAllowlistedVerification(root, manifest.command);
        }
        catch (cause) {
            status = 'failed';
            exitCode = typeof cause?.code === 'number' ? cause.code : 1;
            output = `${cause?.stdout ?? ''}${cause?.stderr ?? cause?.message ?? ''}`;
        }
        await writeFile(outputPath, output);
        const outputSha256 = createHash('sha256').update(output).digest('hex');
        manifest.status = status;
        manifest.exit_code = exitCode;
        manifest.output_sha256 = outputSha256;
        manifest.captured_at = now;
        const result = (input.verification_results ?? []).find((item) => item.command === manifest.command);
        if (result) {
            result.status = status;
            result.summary = status === 'passed' ? `Command completed with exit code 0.` : `Command failed with exit code ${exitCode}.`;
        }
    }
}
async function runAllowlistedVerification(root, command) {
    if (command === 'npm run test:agent-local') {
        const cwd = await resolveNpmProjectRoot(root);
        const result = await execFileAsync('npm', ['run', 'test:agent-local'], { cwd, maxBuffer: 16 * 1024 * 1024 });
        return result.stdout;
    }
    if (command === 'git diff --check') {
        const result = await execFileAsync('git', ['diff', '--check'], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
        return result.stdout;
    }
    throw new Error(`verification command is not allowlisted: ${command}`);
}
async function resolveNpmProjectRoot(root) {
    try {
        const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
        if (packageJson?.scripts?.['test:agent-local'])
            return root;
    }
    catch {
        // Fall through to the package's known workspace location.
    }
    const coreRoot = path.join(root, 'tools', 'zj-loop-core');
    try {
        const packageJson = JSON.parse(await readFile(path.join(coreRoot, 'package.json'), 'utf8'));
        if (packageJson?.scripts?.['test:agent-local'])
            return coreRoot;
    }
    catch {
        // The command below reports the missing project as a failed verification.
    }
    return root;
}
async function prepareOutputPath(root, relativePath, label) {
    if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes('..'))
        throw new Error(`manifest output path escapes root: ${label}`);
    const target = path.resolve(root, relativePath);
    if (target !== root && !target.startsWith(`${root}${path.sep}`))
        throw new Error(`manifest output path escapes root: ${label}`);
    await mkdir(path.dirname(target), { recursive: true });
    return target;
}
async function resolveGitCommit(root, ref) {
    try {
        const result = await execFileAsync('git', ['-C', root, 'rev-parse', '--verify', `${ref}^{commit}`]);
        return result.stdout.trim();
    }
    catch {
        throw new Error('git ref could not be resolved to a commit');
    }
}
