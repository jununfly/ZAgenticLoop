#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const [, , targetPath, content] = process.argv;

if (!targetPath || content === undefined) {
  console.error('Usage: node scripts/write-file-once.mjs <path> <content>');
  process.exit(2);
}

if (targetPath.startsWith('/') || targetPath.includes('..')) {
  console.error('Refusing unsafe target path');
  process.exit(2);
}

await mkdir(dirname(targetPath), { recursive: true });
await writeFile(targetPath, content, { flag: 'wx' });
