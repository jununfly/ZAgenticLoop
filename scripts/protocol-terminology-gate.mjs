#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_TERMS = [`Plan ${'Signal'}`];
const DEFAULT_ROOTS = ['docs', 'patterns', 'scripts', 'zj-loop', 'README.md', 'package.json'];
const IGNORED_DIRS = new Set(['node_modules', '.git', '.zcodegraph']);
const TEXT_EXTENSIONS = new Set(['.md', '.mjs', '.js', '.json', '.yaml', '.yml', '.sh']);

export async function runProtocolTerminologyGate({ cwd = process.cwd(), roots = DEFAULT_ROOTS } = {}) {
  const files = [];
  for (const root of roots) {
    await collectTextFiles(join(cwd, root), files);
  }

  const violations = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const lines = text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      for (const term of FORBIDDEN_TERMS) {
        if (line.includes(term)) {
          violations.push({
            file: relative(cwd, file),
            line: index + 1,
            term,
            text: line.trim(),
          });
        }
      }
    }
  }

  return {
    status: violations.length === 0 ? 'passed' : 'failed',
    gate: 'protocol-terminology',
    forbidden_terms: FORBIDDEN_TERMS,
    violations,
  };
}

async function collectTextFiles(path, files) {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    if (isTextFile(path)) files.push(path);
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        await collectTextFiles(join(path, entry.name), files);
      }
      continue;
    }
    const file = join(path, entry.name);
    if (isTextFile(file)) files.push(file);
  }
}

function isTextFile(path) {
  return TEXT_EXTENSIONS.has(path.slice(path.lastIndexOf('.')));
}

async function main() {
  const result = await runProtocolTerminologyGate();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'passed') process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
