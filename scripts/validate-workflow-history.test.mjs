import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('validate-patterns checkout keeps the parent commit for completion delta', async () => {
  const workflow = await readFile(new URL('../.github/workflows/validate-patterns.yml', import.meta.url), 'utf8');
  assert.match(workflow, /actions\/checkout@v7[\s\S]*fetch-depth:\s*2/);
});
