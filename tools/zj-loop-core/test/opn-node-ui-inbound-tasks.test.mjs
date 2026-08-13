import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('OPN node UI exposes the read-only inbound task projection', async () => {
  const source = await readFile(new URL('../src/opn-node-ui-cli.ts', import.meta.url), 'utf8');
  const page = await readFile(new URL('../ui/opn/index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('../ui/opn/opn-ui.js', import.meta.url), 'utf8');
  assert.match(source, /\/ui\/inbound-tasks/);
  assert.match(source, /listInboundTasks/);
  assert.match(source, /--state-store|state_store/);
  assert.match(page, /待人工批准的入站任务/);
  assert.match(script, /api\('\/ui\/inbound-tasks'\)/);
  assert.match(script, /inbound\.tasks/);
});
