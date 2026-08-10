import os from 'node:os';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

export type OpnEndpointServiceSpec = {
  label: string;
  executable: string;
  script: string;
  args: string[];
  runtime_dir: string;
  working_directory: string;
};

function xml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export function createMacOsLaunchdPlist(spec: OpnEndpointServiceSpec): string {
  const args = [spec.executable, spec.script, ...spec.args].map((item) => `    <string>${xml(item)}</string>`).join('\n');
  const log = path.join(spec.runtime_dir, 'endpoint.log');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>Label</key><string>${xml(spec.label)}</string>\n  <key>ProgramArguments</key>\n  <array>\n${args}\n  </array>\n  <key>WorkingDirectory</key><string>${xml(spec.working_directory)}</string>\n  <key>RunAtLoad</key><true/>\n  <key>KeepAlive</key><true/>\n  <key>StandardOutPath</key><string>${xml(log)}</string>\n  <key>StandardErrorPath</key><string>${xml(log)}</string>\n</dict>\n</plist>\n`;
}

export function createWindowsTaskSchedulerCommand(spec: OpnEndpointServiceSpec): { create: string[]; run: string[]; stop: string[]; delete: string[] } {
  const task = spec.label;
  const command = [spec.executable, spec.script, ...spec.args].map((item) => `"${item.replaceAll('"', '\\"')}"`).join(' ');
  return {
    create: ['schtasks.exe', '/Create', '/TN', task, '/SC', 'ONLOGON', '/TR', command, '/F'],
    run: ['schtasks.exe', '/Run', '/TN', task],
    stop: ['schtasks.exe', '/End', '/TN', task],
    delete: ['schtasks.exe', '/Delete', '/TN', task, '/F'],
  };
}

export function opnEndpointServiceLabel(network_id: string): string {
  return `ZAgenticLoop-OPN-${network_id}`;
}

export async function installOpnEndpointService(spec: OpnEndpointServiceSpec, platform: NodeJS.Platform = process.platform): Promise<{ platform: 'darwin' | 'win32'; path?: string; command?: string[] }> {
  await mkdir(spec.runtime_dir, { recursive: true });
  if (platform === 'darwin') {
    const pathname = path.join(os.homedir(), 'Library', 'LaunchAgents', `${spec.label}.plist`);
    await mkdir(path.dirname(pathname), { recursive: true });
    await writeFile(pathname, createMacOsLaunchdPlist(spec), { mode: 0o600 });
    const result = spawnSync('launchctl', ['bootstrap', `gui/${process.getuid?.() ?? 0}`, pathname], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`opn-endpoint-launchd-install-failed:${(result.stderr || '').trim()}`);
    return { platform: 'darwin', path: pathname };
  }
  if (platform === 'win32') {
    const command = createWindowsTaskSchedulerCommand(spec).create;
    const result = spawnSync(command[0], command.slice(1), { encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error(`opn-endpoint-task-install-failed:${(result.stderr || '').trim()}`);
    return { platform: 'win32', command };
  }
  throw new Error('opn-endpoint-service-platform-unsupported');
}

export async function uninstallOpnEndpointService(label: string, platform: NodeJS.Platform = process.platform): Promise<{ platform: 'darwin' | 'win32'; path?: string; command?: string[] }> {
  if (platform === 'darwin') {
    const pathname = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
    const result = spawnSync('launchctl', ['bootout', `gui/${process.getuid?.() ?? 0}/${label}`], { encoding: 'utf8' });
    if (result.status !== 0 && !/Could not find service/i.test(result.stderr || '')) throw new Error(`opn-endpoint-launchd-uninstall-failed:${(result.stderr || '').trim()}`);
    return { platform: 'darwin', path: pathname };
  }
  if (platform === 'win32') {
    const command = ['schtasks.exe', '/Delete', '/TN', label, '/F'];
    const result = spawnSync(command[0], command.slice(1), { encoding: 'utf8', windowsHide: true });
    if (result.status !== 0 && !/does not exist/i.test(result.stderr || '')) throw new Error(`opn-endpoint-task-uninstall-failed:${(result.stderr || '').trim()}`);
    return { platform: 'win32', command };
  }
  throw new Error('opn-endpoint-service-platform-unsupported');
}
