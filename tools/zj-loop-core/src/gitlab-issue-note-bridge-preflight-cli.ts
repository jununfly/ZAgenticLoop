#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import {
  GITLAB_ISSUE_NOTE_BRIDGE_PREFLIGHT_EXIT_CODES,
  GITLAB_ISSUE_NOTE_BRIDGE_PREFLIGHT_SCHEMA,
  runGitLabIssueNoteBridgePreflight,
  validateGitLabIssueNoteBridgePreflightManifest,
} from './gitlab-issue-note-bridge-preflight.js';

const configFlag = process.argv.indexOf('--config');
const configPath = configFlag >= 0 ? process.argv[configFlag + 1] : undefined;
if (!configPath) {
  print({ schema: GITLAB_ISSUE_NOTE_BRIDGE_PREFLIGHT_SCHEMA, status: 'blocked', reason: 'config-required', side_effects_executed: false });
} else {
  run(configPath).catch((error: unknown) => print({ schema: GITLAB_ISSUE_NOTE_BRIDGE_PREFLIGHT_SCHEMA, status: 'blocked', reason: error instanceof Error ? error.message : String(error), side_effects_executed: false }));
}

async function run(filePath: string): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(filePath, 'utf8'));
    validateGitLabIssueNoteBridgePreflightManifest(parsed);
  } catch (error: unknown) {
    print({ schema: GITLAB_ISSUE_NOTE_BRIDGE_PREFLIGHT_SCHEMA, status: 'blocked', reason: error instanceof Error ? error.message : 'manifest-invalid', side_effects_executed: false });
    return;
  }
  const result = await runGitLabIssueNoteBridgePreflight({ config: parsed, token: process.env.GITLAB_TOKEN });
  print(result);
}

function print(result: { status: keyof typeof GITLAB_ISSUE_NOTE_BRIDGE_PREFLIGHT_EXIT_CODES; [key: string]: unknown }): void {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = GITLAB_ISSUE_NOTE_BRIDGE_PREFLIGHT_EXIT_CODES[result.status] ?? GITLAB_ISSUE_NOTE_BRIDGE_PREFLIGHT_EXIT_CODES.failed;
}
