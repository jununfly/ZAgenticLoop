import { readFile } from 'node:fs/promises';
import path from 'node:path';
export function getCiSweeperPackageBuildPlan(packages) {
    return packages.map((releasePackage) => releasePackage.directory);
}
export async function buildCiSweeperRepairCommands(input = {}) {
    const root = input.root ?? '.';
    const packageDirectories = input.packageDirectories ?? [];
    const rootInstallCommand = input.rootInstallCommand === undefined ? ['npm', ['ci', '--ignore-scripts']] : input.rootInstallCommand;
    const rootCommands = input.rootCommands ?? [
        ['node', ['scripts/check-zj-loop-init-sync.mjs']],
        ['node', ['scripts/validate-release-workflows.mjs']],
    ];
    const commands = [];
    for (const directory of packageDirectories) {
        commands.push({ command: 'npm', args: ['ci'], cwd: directory });
        if (await packageHasScript(root, directory, 'build')) {
            commands.push({ command: 'npm', args: ['run', 'build'], cwd: directory });
        }
    }
    if (rootInstallCommand) {
        const [command, args] = rootInstallCommand;
        commands.push({ command, args });
    }
    for (const [command, args] of rootCommands) {
        commands.push({ command, args });
    }
    return commands;
}
export async function buildCiSweeperRepairPlan(input = {}) {
    const packageDirectories = input.packageDirectories ?? [];
    return {
        schema: 'zj-loop.ci_sweeper_repair_plan.v1',
        package_directories: packageDirectories,
        commands: await buildCiSweeperRepairCommands(input),
    };
}
export function formatCommandStep(step) {
    const command = [step.command, ...step.args].join(' ');
    return step.cwd ? `(cd ${step.cwd} && ${command})` : command;
}
async function packageHasScript(root, directory, scriptName) {
    const packageJsonPath = path.join(root, directory, 'package.json');
    const pkg = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    return Boolean(pkg.scripts?.[scriptName]);
}
