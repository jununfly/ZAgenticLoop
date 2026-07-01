#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

const registry = yaml.parse(await readFile(path.join(ROOT, 'patterns/registry.yaml'), 'utf8'));
const initRegistry = yaml.parse(await readFile(path.join(ROOT, 'tools/zj-loop-init/registry.yaml'), 'utf8'));

const initPatternIds = new Set(initRegistry.patterns.map((pattern) => pattern.id));

for (const pattern of registry.patterns) {
  if (!initPatternIds.has(pattern.id)) {
    fail(`zj-loop-init bundled registry missing pattern id: ${pattern.id}`);
  }
}

console.log(`zj-loop-init pattern sync OK (${registry.patterns.length} patterns) ✓`);
